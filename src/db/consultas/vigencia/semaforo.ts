/**
 * El semáforo de vigencia (spec 13C §7): una consulta trae, por documento con versión vigente, lo que hace
 * falta para saber desde cuándo corre su plazo (última ratificación, última verificación, trámite abierto,
 * impacto pendiente); el estado se calcula en TypeScript con las reglas puras de `src/lib/vigencia`. Nunca se
 * guarda (spec maestro DC14). Aquí también se fija a mano la próxima revisión y se ajusta el plazo.
 */
import type { PendingQuery, Row } from "postgres";
import { obtenerSql, type Cliente } from "@/db/cliente";
import { registrarAuditoria } from "@/db/consultas/admin";
import { obtenerConfigDocumental } from "@/db/consultas/config-documental";
import { enTransaccion, type SesionFlujo } from "@/db/consultas/flujo/contrato";
import {
  alcanceProcesos,
  enAlcance,
  filtroAcceso,
  filtroVigencia,
  puedeRatificar,
  type Alcance,
  type SujetoVisibilidad,
} from "@/lib/alcance";
import { dentroDelPlazo } from "@/lib/indicadores-documentales/definiciones";
import { puede, requerirPermiso } from "@/lib/permisos";
import { estadoPlazo } from "@/lib/tramites/plazos";
import { ETAPAS_ABIERTAS, type Autoridad, type Etapa } from "@/lib/tramites/tipos";
import { fechaBase, limitesDeFechaFijada, proximaRevision, textoFecha, type OrigenVigencia } from "@/lib/vigencia/plazo";
import { estadoVigencia, type ClaseRevision } from "@/lib/vigencia/semaforo";
import { ESTADOS_VIGENCIA, ErrorVigencia, type EstadoVigencia } from "@/lib/vigencia/tipos";
import { zonaHoraria } from "@/lib/zona-horaria";
import { NO_EXISTE, ratificacionesDe, type Ratificacion } from "./ratificaciones";

type Opciones = { sql?: Cliente; ahora?: Date };

export type FilaSemaforo = {
  documentoId: number;
  codigo: string;
  titulo: string;
  origen: "interno" | "externo";
  tipo: string;
  autoridad: Autoridad;
  proceso: { id: number; nombre: string; sigla: string };
  version: { id: number; numero: number; edicion: string | null };
  /** Huella registrada del archivo principal de la vigente; la muestra el diálogo de ratificar. */
  huella: string | null;
  mesesRevision: number;
  /** El plazo es el del documento, no el de su tipo. */
  plazoPropio: boolean;
  ultimaRevision: { fecha: Date; clase: ClaseRevision; quien: string | null } | null;
  proximaRevision: Date | null;
  fijada: { por: string; en: Date; nota: string } | null;
  vigencia: { estado: EstadoVigencia; dias: number | null };
  tramite: { id: number; numero: string; etapa: Etapa; dia: number } | null;
  impacto: { cambioId: number; norma: string } | null;
};

export type FiltroSemaforo = {
  estado?: EstadoVigencia | "todos";
  procesoId?: number;
  origen?: "interno" | "externo" | "todos";
};

export type AccionesVigencia = { ratificar: boolean; solicitar: boolean; ajustar: boolean };

export type VigenciaDeDocumento = FilaSemaforo & { acciones: AccionesVigencia; ratificaciones: Ratificacion[] };

export type ConteosSemaforo = Record<EstadoVigencia, number> & { total: number; dentroDelPlazoPct: number | null };

const SIN_FECHA_FIJADA = "El documento no tiene una fecha fijada a mano";
const PLAZO_FUERA = "El plazo debe estar entre 1 y 120 meses";

/** Los eventos que no cambian la etapa: el día de la etapa cuenta desde el último que sí (como `diaDeEtapa`). */
const EVENTOS_SIN_CAMBIO_DE_ETAPA = ["reasignar", "corregir_datos"];

/** Una sola sentencia, con un `LATERAL` por fuente; `condicion` filtra sobre `documentos d` y `procesos p`. */
function consultaSemaforo(sql: Cliente, condicion: PendingQuery<Row[]>) {
  return sql`
    SELECT d.id, d.codigo, d.titulo, d.origen, d.meses_revision AS meses_documento,
      d.proxima_revision_fijada::text AS fijada, d.fijada_en, d.fijada_nota, uf.nombre AS fijada_por,
      t.nombre AS tipo, t.autoridad, t.meses_revision AS meses_tipo, ex.verificacion_meses,
      p.id AS proceso_id, p.nombre AS proceso_nombre, p.sigla AS proceso_sigla,
      v.id AS version_id, v.numero, v.edicion_externa, v.origen_aprobacion, v.publicado_en,
      v.fecha_aprobacion::text AS fecha_aprobacion, v.aprobo, pa.hash_sha256 AS huella,
      rat.creado_en AS ratificado_en, rat.nombre AS ratifico,
      ver.creado_en AS verificado_en, ver.nombre AS verifico,
      ado.nombre AS adopto,
      tra.id AS tramite_id, tra.numero AS tramite_numero, tra.etapa AS tramite_etapa, tra.entrada AS tramite_entrada,
      imp.cambio_id, imp.norma
    FROM documentos d
    JOIN documento_versiones v ON v.documento_id = d.id AND v.estado = 'vigente'
    JOIN tipos_documento t ON t.id = d.tipo_id
    JOIN documento_proceso dp ON dp.documento_id = d.id AND dp.es_principal
    LEFT JOIN subprocesos s ON s.id = dp.subproceso_id
    JOIN procesos p ON p.id = COALESCE(dp.proceso_id, s.proceso_id)
    LEFT JOIN externos ex ON ex.documento_id = d.id
    LEFT JOIN usuarios uf ON uf.id = d.fijada_por
    LEFT JOIN archivos pa ON pa.version_id = v.id AND pa.rol = 'principal'
    LEFT JOIN LATERAL (
      SELECT r.creado_en, f.nombre_firmante AS nombre
      FROM ratificaciones r JOIN firmas f ON f.id = r.firma_id
      WHERE r.version_id = v.id
      ORDER BY r.creado_en DESC, r.id DESC LIMIT 1
    ) rat ON true
    LEFT JOIN LATERAL (
      SELECT ev.creado_en, u.nombre
      FROM externo_verificaciones ev JOIN usuarios u ON u.id = ev.usuario_id
      WHERE ev.documento_id = d.id AND ev.version_id = v.id
      ORDER BY ev.creado_en DESC, ev.id DESC LIMIT 1
    ) ver ON true
    LEFT JOIN LATERAL (
      SELECT f.nombre_firmante AS nombre FROM firmas f
      WHERE f.version_id = v.id AND f.firma = 'adopto'
      ORDER BY f.id DESC LIMIT 1
    ) ado ON true
    LEFT JOIN LATERAL (
      SELECT tr.id, tr.numero, tr.etapa,
        COALESCE((SELECT max(e.creado_en) FROM tramite_eventos e
          WHERE e.tramite_id = tr.id AND e.tipo <> ALL(${EVENTOS_SIN_CAMBIO_DE_ETAPA})), tr.creado_en) AS entrada
      FROM tramites tr
      WHERE tr.documento_id = d.id AND tr.etapa = ANY(${ETAPAS_ABIERTAS})
      LIMIT 1
    ) tra ON true
    LEFT JOIN LATERAL (
      SELECT i.cambio_id, concat_ws(' ', tn.nombre, n.numero, 'de', n.anio::text) AS norma
      FROM impactos_normativos i
      JOIN normas n ON n.id = i.norma_id
      JOIN tipos_norma tn ON tn.id = n.tipo_norma_id
      WHERE i.documento_id = d.id AND i.estado = 'pendiente'
      ORDER BY i.creado_en DESC, i.id DESC LIMIT 1
    ) imp ON true
    WHERE ${condicion}
    ORDER BY d.codigo`;
}

const instante = (v: unknown): Date | null => (v === null || v === undefined ? null : new Date(v as string));

/** El día de la etapa en curso: el de la entrada es el día 1. */
function diaDeEtapa(entrada: Date, ahora: Date, zona: string): number {
  const p = estadoPlazo(entrada, ahora, zona);
  return (p.estado === "vencido" ? p.dias : 0) + 1;
}

function aFila(f: Row, ahora: Date, atencionDias: number, zona: string): FilaSemaforo {
  const origen = f.origen as "interno" | "externo";
  const origenVigencia: OrigenVigencia =
    origen === "externo" ? "externo" : f.origen_aprobacion === "plataforma" ? "plataforma" : "fuera";
  const publicadoEn = instante(f.publicado_en);
  const ratificadoEn = instante(f.ratificado_en);
  const verificadoEn = instante(f.verificado_en);
  const base = fechaBase(
    { origen: origenVigencia, publicadoEn, fechaAprobacion: f.fecha_aprobacion, ultimaRatificacion: ratificadoEn, ultimaVerificacion: verificadoEn },
    zona,
  );
  const mesesRevision = Number(
    origen === "externo" ? (f.verificacion_meses ?? f.meses_documento ?? f.meses_tipo) : (f.meses_documento ?? f.meses_tipo),
  );
  const proxima = proximaRevision({ base, meses: mesesRevision, fijada: f.fijada }, zona);

  // La clase sigue a la fecha que eligió `fechaBase`.
  let ultimaRevision: FilaSemaforo["ultimaRevision"] = null;
  if (base) {
    if (origenVigencia === "externo") {
      ultimaRevision = verificadoEn && base.getTime() === verificadoEn.getTime()
        ? { fecha: base, clase: "verificacion", quien: f.verifico }
        : { fecha: base, clase: "adopcion", quien: f.adopto ?? null };
    } else if (ratificadoEn && base.getTime() === ratificadoEn.getTime()) {
      ultimaRevision = { fecha: base, clase: "ratificacion", quien: f.ratifico };
    } else {
      ultimaRevision = origenVigencia === "plataforma"
        ? { fecha: base, clase: "publicacion", quien: null }
        : { fecha: base, clase: "aprobacion", quien: f.aprobo ?? null };
    }
  }

  const tramite = f.tramite_id === null
    ? null
    : {
        id: Number(f.tramite_id),
        numero: f.tramite_numero as string,
        etapa: f.tramite_etapa as Etapa,
        dia: diaDeEtapa(new Date(f.tramite_entrada as string), ahora, zona),
      };
  const impacto = f.cambio_id === null ? null : { cambioId: Number(f.cambio_id), norma: f.norma as string };

  return {
    documentoId: Number(f.id),
    codigo: f.codigo,
    titulo: f.titulo,
    origen,
    tipo: f.tipo,
    autoridad: f.autoridad as Autoridad,
    proceso: { id: Number(f.proceso_id), nombre: f.proceso_nombre, sigla: f.proceso_sigla },
    version: { id: Number(f.version_id), numero: f.numero as number, edicion: f.edicion_externa ?? null },
    huella: f.huella ?? null,
    mesesRevision,
    plazoPropio: origen === "externo" ? f.verificacion_meses !== null : f.meses_documento !== null,
    ultimaRevision,
    proximaRevision: proxima,
    fijada: f.fijada ? { por: f.fijada_por as string, en: new Date(f.fijada_en as string), nota: (f.fijada_nota as string | null) ?? "" } : null,
    vigencia: estadoVigencia({ proxima, enTramite: tramite !== null, impactoPendiente: impacto !== null }, ahora, atencionDias, zona),
    tramite,
    impacto,
  };
}

const ORDEN_ESTADO: Record<EstadoVigencia, number> = { vencida: 0, atencion: 1, al_dia: 2, en_tramite: 3 };

/** Lo más urgente primero: lo más vencido, lo que vence antes (sin fecha, al frente de atención), y el código. */
function compararFilas(a: FilaSemaforo, b: FilaSemaforo): number {
  const estado = ORDEN_ESTADO[a.vigencia.estado] - ORDEN_ESTADO[b.vigencia.estado];
  if (estado !== 0) return estado;
  const dias = (f: FilaSemaforo) => f.vigencia.dias ?? Number.NEGATIVE_INFINITY;
  if (dias(a) !== dias(b)) return dias(a) < dias(b) ? -1 : 1;
  return a.codigo.localeCompare(b.codigo, "es");
}

async function leerFilas(sql: Cliente, condicion: PendingQuery<Row[]>, ahora: Date): Promise<FilaSemaforo[]> {
  const config = await obtenerConfigDocumental({ sql });
  const zona = zonaHoraria();
  const filas = await consultaSemaforo(sql, condicion);
  return filas.map((f) => aFila(f, ahora, config.vigencia.atencionDias, zona));
}

/**
 * Los documentos con versión vigente que la persona ve en la pestaña «Semáforo» (`filtroVigencia`), filtrados
 * por proceso y origen en la consulta y por estado después, sobre el estado calculado.
 */
export async function listarSemaforo(sesion: SesionFlujo, filtro: FiltroSemaforo, opciones?: Opciones): Promise<FilaSemaforo[]> {
  const sql = opciones?.sql ?? obtenerSql();
  const ahora = opciones?.ahora ?? new Date();
  const alcance = await alcanceProcesos(sesion, { sql });
  const condicion = sql`${filtroVigencia(sql, sesion, alcance)}
    ${filtro.procesoId === undefined ? sql`` : sql`AND p.id = ${filtro.procesoId}`}
    ${filtro.origen === "interno" || filtro.origen === "externo" ? sql`AND d.origen = ${filtro.origen}` : sql``}`;
  const filas = await leerFilas(sql, condicion, ahora);
  const estado = filtro.estado ?? "todos";
  return (estado === "todos" ? filas : filas.filter((f) => f.vigencia.estado === estado)).sort(compararFilas);
}

/** Qué puede hacer la persona con la vigencia de un documento, desde la ficha o el semáforo. */
export function accionesDeFila(sesion: SujetoVisibilidad, fila: FilaSemaforo, alcance: Alcance): AccionesVigencia {
  const interno = fila.origen === "interno";
  const enTramite = fila.tramite !== null;
  return {
    ratificar:
      fila.huella !== null &&
      puedeRatificar(sesion, { procesoId: fila.proceso.id, autoridad: fila.autoridad, origen: fila.origen, enTramite, vigente: true }, alcance),
    solicitar: interno && !enTramite && puede(sesion, "tramites.solicitar") && enAlcance(alcance, fila.proceso.id),
    ajustar: interno && puede(sesion, "revision_anual.gestionar"),
  };
}

/**
 * La vigencia de un documento para su ficha: la ve quien ve el documento (`filtroAcceso`), no solo quien tiene
 * la pestaña. `null` si no lo ve o no tiene versión vigente.
 */
export async function vigenciaDeDocumento(documentoId: number, sesion: SesionFlujo, opciones?: Opciones): Promise<VigenciaDeDocumento | null> {
  const sql = opciones?.sql ?? obtenerSql();
  const ahora = opciones?.ahora ?? new Date();
  const [fila] = await leerFilas(sql, sql`d.id = ${documentoId} AND ${filtroAcceso(sql, sesion)}`, ahora);
  if (!fila) return null;
  const alcance = await alcanceProcesos(sesion, { sql });
  return { ...fila, acciones: accionesDeFila(sesion, fila, alcance), ratificaciones: await ratificacionesDe(fila.version.id, { sql }) };
}

/** Los conteos por estado y el porcentaje dentro del plazo; un documento sin fecha no entra al porcentaje. */
export function resumirSemaforo(filas: FilaSemaforo[], ahora: Date): ConteosSemaforo {
  const zona = zonaHoraria();
  const conteos = Object.fromEntries(ESTADOS_VIGENCIA.map((e) => [e, 0])) as Record<EstadoVigencia, number>;
  for (const f of filas) conteos[f.vigencia.estado] += 1;
  // Por la fecha: un documento en trámite sigue vencido o no por debajo.
  const dentro = dentroDelPlazo(
    filas.map((f) => ({ vencida: f.proximaRevision === null ? null : estadoPlazo(f.proximaRevision, ahora, zona).estado === "vencido" })),
  );
  return { ...conteos, total: filas.length, dentroDelPlazoPct: dentro.valor };
}

export async function conteosSemaforo(
  sesion: SesionFlujo,
  opciones?: Opciones & Pick<FiltroSemaforo, "procesoId" | "origen">,
): Promise<ConteosSemaforo> {
  const filas = await listarSemaforo(sesion, { estado: "todos", procesoId: opciones?.procesoId, origen: opciones?.origen }, opciones);
  return resumirSemaforo(filas, opciones?.ahora ?? new Date());
}

/** Los procesos activos que la persona puede elegir en el filtro del semáforo. */
export async function procesosDelSemaforo(
  sesion: SesionFlujo,
  opciones?: { sql?: Cliente },
): Promise<{ id: number; nombre: string; sigla: string }[]> {
  const sql = opciones?.sql ?? obtenerSql();
  const alcance = await alcanceProcesos(sesion, { sql });
  const filas = await sql`SELECT id, nombre, sigla FROM procesos
    WHERE activo ${alcance.todos ? sql`` : sql`AND id = ANY(${alcance.procesoIds})`}
    ORDER BY nombre`;
  return filas.map((f) => ({ id: Number(f.id), nombre: f.nombre as string, sigla: f.sigla as string }));
}

function esFechaReal(fecha: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return false;
  const d = new Date(`${fecha}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === fecha;
}

/**
 * Fija a mano la próxima revisión de uno o varios documentos internos vigentes (spec 13C §7.4), con nota, para
 * que la carga inicial no amanezca toda en rojo. La fecha va de mañana al plazo de cada documento contado desde
 * hoy; si no cabe en uno, no se fija ninguno y el mensaje lo nombra. Se audita por documento.
 */
export async function fijarProximaRevision(
  sesion: SesionFlujo,
  d: { documentoIds: number[]; fecha: string; nota: string },
  opciones?: Opciones,
): Promise<{ fijados: number }> {
  requerirPermiso(sesion, "revision_anual.gestionar");
  const sql = opciones?.sql ?? obtenerSql();
  const ahora = opciones?.ahora ?? new Date();
  const zona = zonaHoraria();
  const ids = [...new Set(d.documentoIds)];
  const nota = d.nota.trim();
  if (ids.length === 0) throw new ErrorVigencia("Elija al menos un documento");
  if (!esFechaReal(d.fecha)) throw new ErrorVigencia("Elija una fecha válida");
  if (nota.length < 5) throw new ErrorVigencia("La nota debe tener al menos 5 caracteres");

  return enTransaccion(sql, async (tx) => {
    const filas = await tx`SELECT d.id, d.codigo, d.origen, COALESCE(d.meses_revision, t.meses_revision) AS meses,
        EXISTS (SELECT 1 FROM documento_versiones v WHERE v.documento_id = d.id AND v.estado = 'vigente') AS vigente
      FROM documentos d JOIN tipos_documento t ON t.id = d.tipo_id
      WHERE d.id = ANY(${ids})
      ORDER BY d.codigo
      FOR UPDATE OF d`;
    if (filas.length !== ids.length) throw new ErrorVigencia(NO_EXISTE);
    for (const f of filas) {
      if (f.origen !== "interno" || !f.vigente) throw new ErrorVigencia(`${f.codigo} no es un documento interno vigente`);
      const { minima, maxima } = limitesDeFechaFijada({ meses: Number(f.meses) }, ahora, zona);
      if (d.fecha < minima || d.fecha > maxima) {
        const mensaje = `La fecha debe estar entre mañana y el ${textoFecha(maxima, zona)}`;
        throw new ErrorVigencia(ids.length > 1 ? `${mensaje} para ${f.codigo}` : mensaje);
      }
    }
    await tx`UPDATE documentos SET proxima_revision_fijada = ${d.fecha}, fijada_por = ${sesion.usuarioId}, fijada_en = ${ahora},
        fijada_nota = ${nota}, revision_aviso_en = NULL, revision_escalado_en = NULL
      WHERE id = ANY(${ids})`;
    for (const f of filas) {
      await registrarAuditoria(tx, {
        usuarioId: sesion.usuarioId,
        accion: "fecha_revision_fijada",
        entidad: "documento",
        entidadId: Number(f.id),
        detalle: { codigo: f.codigo, fecha: d.fecha, nota },
      });
    }
    return { fijados: filas.length };
  });
}

/** Quita la fecha fijada a mano: vuelve a regir la fecha base más el plazo. */
export async function quitarFechaFijada(sesion: SesionFlujo, documentoId: number, opciones?: Opciones): Promise<void> {
  requerirPermiso(sesion, "revision_anual.gestionar");
  const sql = opciones?.sql ?? obtenerSql();
  await enTransaccion(sql, async (tx) => {
    const [f] = await tx`SELECT codigo, proxima_revision_fijada::text AS fijada, fijada_nota FROM documentos
      WHERE id = ${documentoId} FOR UPDATE`;
    if (!f) throw new ErrorVigencia(NO_EXISTE);
    if (!f.fijada) throw new ErrorVigencia(SIN_FECHA_FIJADA);
    await tx`UPDATE documentos SET proxima_revision_fijada = NULL, fijada_por = NULL, fijada_en = NULL, fijada_nota = NULL,
        revision_aviso_en = NULL, revision_escalado_en = NULL
      WHERE id = ${documentoId}`;
    await registrarAuditoria(tx, {
      usuarioId: sesion.usuarioId,
      accion: "fecha_revision_quitada",
      entidad: "documento",
      entidadId: documentoId,
      detalle: { codigo: f.codigo, fecha: f.fijada, nota: f.fijada_nota },
    });
  });
}

/**
 * El plazo de revisión propio de un documento interno, de 1 a 120 meses; nulo vuelve al del tipo. La próxima
 * revisión cambia con él, así que sus avisos pueden volver a darse.
 */
export async function ajustarPlazo(
  sesion: SesionFlujo,
  d: { documentoId: number; mesesRevision: number | null },
  opciones?: Opciones,
): Promise<void> {
  requerirPermiso(sesion, "revision_anual.gestionar");
  const sql = opciones?.sql ?? obtenerSql();
  const despues = d.mesesRevision;
  if (despues !== null && (!Number.isInteger(despues) || despues < 1 || despues > 120)) throw new ErrorVigencia(PLAZO_FUERA);
  await enTransaccion(sql, async (tx) => {
    const [f] = await tx`SELECT codigo, origen, meses_revision FROM documentos WHERE id = ${d.documentoId} FOR UPDATE`;
    if (!f) throw new ErrorVigencia(NO_EXISTE);
    if (f.origen !== "interno") throw new ErrorVigencia("El plazo de un documento externo es su periodicidad de verificación");
    const antes = f.meses_revision === null ? null : Number(f.meses_revision);
    if (antes === despues) return;
    await tx`UPDATE documentos SET meses_revision = ${despues}, revision_aviso_en = NULL, revision_escalado_en = NULL
      WHERE id = ${d.documentoId}`;
    await registrarAuditoria(tx, {
      usuarioId: sesion.usuarioId,
      accion: "plazo_revision_ajustado",
      entidad: "documento",
      entidadId: d.documentoId,
      detalle: { codigo: f.codigo, antes, despues },
    });
  });
}
