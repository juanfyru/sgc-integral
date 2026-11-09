/**
 * El semáforo de vigencia (spec 13C §7): la pestaña «Semáforo», la vigencia de la ficha y sus conteos, sobre la
 * consulta de `columnasDeVigencia` (`fragmentos.ts`). Aquí también se fija a mano la próxima revisión y se
 * ajusta el plazo.
 */
import { obtenerSql, type Cliente } from "@/db/cliente";
import { registrarAuditoria } from "@/db/consultas/admin";
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
import { limitesDeFechaFijada, textoFecha } from "@/lib/vigencia/plazo";
import { ESTADOS_VIGENCIA, ErrorVigencia, type EstadoVigencia } from "@/lib/vigencia/tipos";
import { zonaHoraria } from "@/lib/zona-horaria";
import { listarExternos } from "./externos";
import { columnasDeVigencia, type FilaSemaforo } from "./fragmentos";
import { NO_EXISTE } from "./comun";
import { ratificacionesDe, type Ratificacion } from "./ratificaciones";

export type { FilaSemaforo } from "./fragmentos";

type Opciones = { sql?: Cliente; ahora?: Date };

export type FiltroSemaforo = {
  estado?: EstadoVigencia | "todos";
  procesoId?: number;
  origen?: "interno" | "externo" | "todos";
};

/** `verTramite`: el trámite abierto se enlaza solo a quien puede abrirlo; a los demás se les dice su número. */
export type AccionesVigencia = { ratificar: boolean; solicitar: boolean; ajustar: boolean; verTramite: boolean };

export type VigenciaDeDocumento = FilaSemaforo & { acciones: AccionesVigencia; ratificaciones: Ratificacion[] };

export type ConteosSemaforo = Record<EstadoVigencia, number> & { total: number; dentroDelPlazoPct: number | null };

const SIN_FECHA_FIJADA = "El documento no tiene una fecha fijada a mano";
const PLAZO_FUERA = "El plazo debe estar entre 1 y 120 meses";

const ORDEN_ESTADO: Record<EstadoVigencia, number> = { vencida: 0, atencion: 1, al_dia: 2, en_tramite: 3 };

/** Lo más urgente primero: lo más vencido, lo que vence antes (sin fecha, al frente de atención), y el código. */
function compararFilas(a: FilaSemaforo, b: FilaSemaforo): number {
  const estado = ORDEN_ESTADO[a.vigencia.estado] - ORDEN_ESTADO[b.vigencia.estado];
  if (estado !== 0) return estado;
  const dias = (f: FilaSemaforo) => f.vigencia.dias ?? Number.NEGATIVE_INFINITY;
  if (dias(a) !== dias(b)) return dias(a) < dias(b) ? -1 : 1;
  return a.codigo.localeCompare(b.codigo, "es");
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
  const filas = await columnasDeVigencia(sql, condicion, ahora);
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
    // Lo abren el Admin SGC y el líder del proceso (`puedeVerTramite`); a un participante de otro rol no se le
    // conoce aquí, y se le dice el número.
    verTramite: enTramite && (sesion.rol === "admin_sgc" || (sesion.rol === "lider_proceso" && enAlcance(alcance, fila.proceso.id))),
  };
}

/**
 * La vigencia de un documento para su ficha: la ve quien ve el documento (`filtroAcceso`), no solo quien tiene
 * la pestaña. `null` si no lo ve o no tiene versión vigente.
 */
export async function vigenciaDeDocumento(documentoId: number, sesion: SesionFlujo, opciones?: Opciones): Promise<VigenciaDeDocumento | null> {
  const sql = opciones?.sql ?? obtenerSql();
  const ahora = opciones?.ahora ?? new Date();
  const [fila] = await columnasDeVigencia(sql, sql`d.id = ${documentoId} AND ${filtroAcceso(sql, sesion)}`, ahora);
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

/**
 * La insignia de la entrada «Vigencia» de la barra (spec 13C §14.1): cuántos documentos de su alcance tienen la
 * vigencia vencida. Con `vigencia.ver`, los del semáforo que ve (internos y externos); para quien solo es responsable
 * técnico, sus externos. Quien no ve la entrada no cuenta nada, y no consulta.
 */
export async function vencidosDeVigencia(sesion: SesionFlujo, d: { responsableTecnico: boolean }, opciones?: Opciones): Promise<number> {
  if (puede(sesion, "vigencia.ver") || puede(sesion, "documentos.indicadores")) {
    return (await listarSemaforo(sesion, { estado: "vencida" }, opciones)).length;
  }
  if (!d.responsableTecnico) return 0;
  return (await listarExternos(sesion, { estado: "vencida" }, opciones)).length;
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
