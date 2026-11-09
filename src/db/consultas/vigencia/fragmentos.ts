/**
 * La vigencia de los documentos con versión vigente (spec 13C §7): una consulta trae lo que hace falta para
 * saber desde cuándo corre su plazo, con un `LATERAL` por fuente (última ratificación, última verificación,
 * firma «Adoptó», trámite abierto, impacto pendiente), y el estado se calcula en TypeScript con las reglas
 * puras de `src/lib/vigencia`. Nunca se guarda (spec maestro DC14). La componen el semáforo y las demás
 * pantallas y pasadas que muestran o usan el estado de vigencia.
 */
import type { PendingQuery, Row } from "postgres";
import type { Cliente } from "@/db/cliente";
import { obtenerConfigDocumental, type ConfigDocumental } from "@/db/consultas/config-documental";
import { EVENTOS_SIN_CAMBIO_DE_ETAPA, diaDeEtapa } from "@/lib/tramites/dia-de-etapa";
import { ETAPAS_ABIERTAS, type Autoridad, type Etapa } from "@/lib/tramites/tipos";
import { fechaBase, proximaRevision, type OrigenVigencia } from "@/lib/vigencia/plazo";
import { estadoVigencia, textoVigenciaDeFila, type ClaseRevision } from "@/lib/vigencia/semaforo";
import type { EstadoVigencia } from "@/lib/vigencia/tipos";
import { zonaHoraria } from "@/lib/zona-horaria";

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
  /** `dia`: el de la etapa en curso, como en el encabezado del trámite; nulo si la etapa no tiene fecha límite. */
  tramite: { id: number; numero: string; etapa: Etapa; dia: number | null } | null;
  /** El impacto normativo pendiente más reciente; `procesoId` es el del impacto (el de su página de impactos). */
  impacto: { cambioId: number; procesoId: number; norma: string } | null;
  /** Un externo con una verificación «hay una edición nueva» que aún no se adopta (spec 13C §8.4): sale en atención. */
  edicionPendiente: { desde: Date } | null;
  /** La revisión anual abierta que lo incluye: la leyenda «En revisión anual <año>» junto a los botones (spec 13C §7.5). */
  revisionAnual: { anio: number } | null;
};

/**
 * Lo que el cascarón necesita además de la vigencia para repartir las tareas y la insignia de una persona con una sola
 * lectura (resolución 1 de la Tarea 7).
 */
export type FilaDePersona = FilaSemaforo & {
  /** El responsable técnico de un externo; null en un interno. */
  responsableTecnicoId: number | null;
  /** Está en la revisión anual abierta: la tarea de la campaña lo cubre (spec 13C §7.5). */
  enRevisionAnual: boolean;
  /** Su proceso propietario está activo y tiene un líder activo: sus tareas no son del Admin SGC (F13A-DC2). */
  procesoConLider: boolean;
};

/**
 * Una sola sentencia, con un `LATERAL` por fuente; `condicion` filtra sobre `documentos d` y `procesos p`. `marcas`
 * añade las columnas de `FilaDePersona`.
 */
function consultaSemaforo(sql: Cliente, condicion: PendingQuery<Row[]>, marcas = false) {
  return sql`
    SELECT d.id, d.codigo, d.titulo, d.origen, d.meses_revision AS meses_documento,
      d.proxima_revision_fijada::text AS fijada, d.fijada_en, d.fijada_nota, uf.nombre AS fijada_por,
      t.nombre AS tipo, t.autoridad, t.meses_revision AS meses_tipo, ex.verificacion_meses, ex.edicion_nueva_pendiente_desde,
      p.id AS proceso_id, p.nombre AS proceso_nombre, p.sigla AS proceso_sigla,
      v.id AS version_id, v.numero, v.edicion_externa, v.origen_aprobacion, v.publicado_en,
      v.fecha_aprobacion::text AS fecha_aprobacion, v.aprobo, pa.hash_sha256 AS huella,
      rat.creado_en AS ratificado_en, rat.nombre AS ratifico,
      ver.creado_en AS verificado_en, ver.nombre AS verifico,
      ado.nombre AS adopto,
      tra.id AS tramite_id, tra.numero AS tramite_numero, tra.etapa AS tramite_etapa, tra.vence_en AS tramite_vence_en,
      tra.entrada AS tramite_entrada,
      imp.cambio_id, imp.proceso_id AS impacto_proceso_id, imp.norma,
      ${anioDeRevisionAbierta(sql)} AS revision_anual_anio
      ${marcas
        ? sql`, ex.responsable_id AS responsable_tecnico_id,
          (p.activo AND EXISTS (SELECT 1 FROM usuario_procesos lider_up
            JOIN usuarios lider_u ON lider_u.id = lider_up.usuario_id AND lider_u.activo AND lider_u.rol = 'lider_proceso'
            WHERE lider_up.proceso_id = p.id)) AS proceso_con_lider`
        : sql``}
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
      SELECT tr.id, tr.numero, tr.etapa, tr.vence_en,
        COALESCE((SELECT e.creado_en FROM tramite_eventos e
          WHERE e.tramite_id = tr.id AND e.tipo <> ALL(${[...EVENTOS_SIN_CAMBIO_DE_ETAPA]})
          ORDER BY e.id DESC LIMIT 1), tr.creado_en) AS entrada
      FROM tramites tr
      WHERE tr.documento_id = d.id AND tr.etapa = ANY(${ETAPAS_ABIERTAS})
      LIMIT 1
    ) tra ON true
    LEFT JOIN LATERAL (
      SELECT i.cambio_id, i.proceso_id, concat_ws(' ', tn.nombre, n.numero, 'de', n.anio::text) AS norma
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
        // La misma regla del encabezado del trámite; sin fecha límite no hay día.
        dia:
          diaDeEtapa(
            { etapa: f.tramite_etapa as Etapa, venceEn: instante(f.tramite_vence_en), entrada: new Date(f.tramite_entrada as string) },
            ahora,
            zona,
          )?.dia ?? null,
      };
  const impacto =
    f.cambio_id === null ? null : { cambioId: Number(f.cambio_id), procesoId: Number(f.impacto_proceso_id), norma: f.norma as string };
  const pendienteDesde = instante(f.edicion_nueva_pendiente_desde);

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
    vigencia: estadoVigencia(
      { proxima, enTramite: tramite !== null, impactoPendiente: impacto !== null, edicionPendiente: pendienteDesde !== null },
      ahora,
      atencionDias,
      zona,
    ),
    tramite,
    impacto,
    edicionPendiente: pendienteDesde === null ? null : { desde: pendienteDesde },
    revisionAnual: f.revision_anual_anio === null ? null : { anio: Number(f.revision_anual_anio) },
  };
}

/**
 * La vigencia de cada documento con versión vigente que cumple `condicion` (un `WHERE` sobre `documentos d` y
 * `procesos p`, su proceso propietario por la asociación principal), en el orden del código. Quien la compone
 * pone en `condicion` su regla de visibilidad: aquí no se decide quién ve qué. `config`, si ya se leyó.
 */
export async function columnasDeVigencia(
  sql: Cliente,
  condicion: PendingQuery<Row[]>,
  ahora: Date,
  opciones?: { config?: ConfigDocumental },
): Promise<FilaSemaforo[]> {
  const config = opciones?.config ?? (await obtenerConfigDocumental({ sql }));
  const zona = zonaHoraria();
  const filas = await consultaSemaforo(sql, condicion);
  return filas.map((f) => aFila(f, ahora, config.vigencia.atencionDias, zona));
}

/** La misma lectura con las marcas de `FilaDePersona`, sobre la configuración ya leída. */
export async function filasDePersona(
  sql: Cliente,
  condicion: PendingQuery<Row[]>,
  ahora: Date,
  config: ConfigDocumental,
): Promise<FilaDePersona[]> {
  const zona = zonaHoraria();
  const filas = await consultaSemaforo(sql, condicion, true);
  return filas.map((f) => ({
    ...aFila(f, ahora, config.vigencia.atencionDias, zona),
    responsableTecnicoId: f.responsable_tecnico_id === null ? null : Number(f.responsable_tecnico_id),
    // La misma búsqueda que da el año de la leyenda: no se repite por fila.
    enRevisionAnual: f.revision_anual_anio !== null,
    procesoConLider: f.proceso_con_lider as boolean,
  }));
}

/**
 * El documento `d` está en la revisión anual abierta: mientras dure, la tarea de la campaña lo cubre y no da tarea
 * ni aviso de vencimiento propios (spec 13C §7.5).
 */
export function enRevisionAnualAbierta(sql: Cliente) {
  return sql`EXISTS (SELECT 1 FROM revision_anual_decisiones rad JOIN revisiones_anuales ra ON ra.id = rad.revision_id
    WHERE ra.estado = 'abierta' AND rad.documento_id = d.id)`;
}

/** El año de la revisión anual abierta que incluye al documento `d`, o nulo: una columna de la misma sentencia. */
function anioDeRevisionAbierta(sql: Cliente) {
  return sql`(SELECT ra.anio FROM revision_anual_decisiones rad JOIN revisiones_anuales ra ON ra.id = rad.revision_id
    WHERE ra.estado = 'abierta' AND rad.documento_id = d.id LIMIT 1)`;
}

/** La vigencia de cada documento de `ids` que tenga versión vigente, por su id. */
export async function vigenciaPorDocumento(sql: Cliente, ids: number[], ahora: Date): Promise<Map<number, FilaSemaforo>> {
  if (ids.length === 0) return new Map();
  return new Map((await columnasDeVigencia(sql, sql`d.id = ANY(${ids})`, ahora)).map((f) => [f.documentoId, f]));
}

/** El semáforo de un documento en una lista (Gestión, la página del proceso): con el mismo texto que el chip del semáforo. */
export type VigenciaEnLista = { estado: EstadoVigencia; dias: number | null; texto: string };

export function vigenciaEnLista(f: FilaSemaforo): VigenciaEnLista {
  return { ...f.vigencia, texto: textoVigenciaDeFila(f) };
}
