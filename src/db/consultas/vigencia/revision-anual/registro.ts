/**
 * El registro de las decisiones de la revisión anual desde los actos que las producen (spec 13C §9.3): ratificar,
 * verificar o retirar un externo, adoptar una edición, pedir una solicitud de modificación o eliminación y publicar. Lo
 * que se hace fuera de la página de la campaña también cuenta: la decisión queda dentro de la transacción del acto, a
 * nombre de quien lo hizo, aunque no tenga `revision_anual.decidir`. Una decisión queda fija cuando produjo su
 * ratificación o su verificación, o cuando su trámite fue aceptado; antes (un trámite retirado, rechazado o cancelado) se
 * puede decidir de nuevo.
 *
 * Con la revisión abierta, cada acto la lee con `FOR SHARE`: el cierre (que la toma `FOR UPDATE`) espera al acto, o el
 * acto la ve ya cerrada y sigue sin registrar nada. Cualquier otro fallo al registrar la decisión hace fallar el acto: una
 * decisión perdida en silencio sería peor evidencia que un acto que se reintenta.
 *
 * Lo importan `aplicarPublicacion` (admin.ts) y los actos: depende solo de la bitácora y de tipos, para no cerrar un ciclo
 * de importaciones a través de los avisos y la estructura.
 */
import type { TransactionSql } from "postgres";
import { registrarAuditoria } from "@/db/consultas/admin";
import type { Etapa, TipoSolicitud } from "@/lib/tramites/tipos";
import type { Decision } from "@/lib/vigencia/tipos";
import { PENDIENTE } from "./comun";

/** Las etapas en las que el trámite de una decisión todavía no la fija. */
const ETAPAS_QUE_NO_FIJAN: readonly Etapa[] = ["visto_bueno", "aceptacion", "rechazado", "cancelado"];

export type Enlaces = { ratificacionId: number | null; verificacionId: number | null; tramiteId: number | null };

export type FilaDecision = Enlaces & { id: number; codigo: string; decision: Decision; usuarioId: number | null; tramiteEtapa: Etapa | null };

export type NuevaDecision = {
  documentoId: number;
  versionId: number;
  decision: "ratificar" | "actualizar" | "eliminar" | "reciente";
  /** Nulo cuando la registra el sistema. */
  usuarioId: number | null;
  ratificacionId?: number;
  verificacionId?: number;
  tramiteId?: number;
  ahora: Date;
};

export type RevisionBloqueada = { id: number; anio: number };

const id = (v: unknown) => (v === null || v === undefined ? null : Number(v));

/** La revisión abierta, leída con `FOR SHARE`: el cierre espera a quien escribe en ella. */
async function abiertaBloqueada(tx: TransactionSql): Promise<RevisionBloqueada | null> {
  const [r] = await tx`SELECT id, anio FROM revisiones_anuales WHERE estado = 'abierta' FOR SHARE`;
  return r ? { id: Number(r.id), anio: Number(r.anio) } : null;
}

/** La revisión abierta que tiene al documento en su foto; nula si no hay o no lo tiene. */
export async function revisionQueIncluye(tx: TransactionSql, documentoId: number): Promise<number | null> {
  const r = await abiertaBloqueada(tx);
  if (!r) return null;
  const [f] = await tx`SELECT 1 FROM revision_anual_decisiones WHERE revision_id = ${r.id} AND documento_id = ${documentoId}`;
  return f ? r.id : null;
}

/** La fila de decisión del documento en la revisión, bloqueada; nula si no está en su foto. */
export async function filaDeDecision(tx: TransactionSql, revisionId: number, documentoId: number): Promise<FilaDecision | null> {
  const [f] = await tx`SELECT rad.id, d.codigo, rad.decision, rad.usuario_id, rad.ratificacion_id, rad.verificacion_id, rad.tramite_id,
      t.etapa AS tramite_etapa
    FROM revision_anual_decisiones rad
    JOIN documentos d ON d.id = rad.documento_id
    LEFT JOIN tramites t ON t.id = rad.tramite_id
    WHERE rad.revision_id = ${revisionId} AND rad.documento_id = ${documentoId}
    FOR UPDATE OF rad`;
  if (!f) return null;
  return {
    id: Number(f.id),
    codigo: f.codigo as string,
    decision: f.decision as Decision,
    usuarioId: id(f.usuario_id),
    ratificacionId: id(f.ratificacion_id),
    verificacionId: id(f.verificacion_id),
    tramiteId: id(f.tramite_id),
    tramiteEtapa: (f.tramite_etapa as Etapa | null) ?? null,
  };
}

/** Produjo su ratificación o su verificación, o su trámite fue aceptado (spec 13C §9.3). */
export function quedoFija(f: FilaDecision): boolean {
  if (f.ratificacionId !== null || f.verificacionId !== null) return true;
  return f.tramiteId !== null && f.tramiteEtapa !== null && !ETAPAS_QUE_NO_FIJAN.includes(f.tramiteEtapa);
}

/** Lo que la bitácora guarda de una decisión. */
function enBitacora(f: Pick<FilaDecision, "decision" | "usuarioId"> & Enlaces) {
  return { decision: f.decision, usuarioId: f.usuarioId, ratificacionId: f.ratificacionId, verificacionId: f.verificacionId, tramiteId: f.tramiteId };
}

/**
 * Escribe la decisión nueva sobre la fila, con antes y después en la bitácora (la pendiente es «sin decisión»). Nada
 * cambia si ya dice lo mismo con los mismos enlaces: así la adopción que sigue a la publicación no escribe dos veces.
 */
export async function escribirDecision(
  tx: TransactionSql,
  revision: RevisionBloqueada,
  actual: FilaDecision,
  d: { documentoId: number; versionId: number; decision: Decision; usuarioId: number | null; ahora: Date } & Enlaces,
): Promise<void> {
  const igual =
    actual.decision === d.decision &&
    actual.ratificacionId === d.ratificacionId &&
    actual.verificacionId === d.verificacionId &&
    actual.tramiteId === d.tramiteId;
  if (igual) return;
  await tx`UPDATE revision_anual_decisiones SET decision = ${d.decision}, usuario_id = ${d.usuarioId},
      ratificacion_id = ${d.ratificacionId}, verificacion_id = ${d.verificacionId}, tramite_id = ${d.tramiteId},
      actualizado_en = ${d.ahora}
    WHERE id = ${actual.id}`;
  await registrarAuditoria(tx, {
    usuarioId: d.usuarioId,
    accion: "revision_anual_decision",
    entidad: "revision_anual",
    entidadId: revision.id,
    detalle: {
      anio: revision.anio,
      documentoId: d.documentoId,
      codigo: actual.codigo,
      versionId: d.versionId,
      antes: actual.decision === PENDIENTE ? null : enBitacora(actual),
      despues: enBitacora(d),
    },
  });
}

/**
 * Registra la decisión de un documento en la revisión abierta, dentro de la transacción del acto que la produce. Sin
 * revisión abierta, o si el documento no está en su foto, no hace nada y devuelve `null`. Si la decisión que tiene quedó
 * fija, no la toca. La llaman `alRatificar`, la verificación y el retiro de un externo, `alAdoptar` y `alSolicitar`.
 */
export async function registrarDecision(tx: TransactionSql, d: NuevaDecision): Promise<{ revisionId: number } | null> {
  const revision = await abiertaBloqueada(tx);
  if (!revision) return null;
  const actual = await filaDeDecision(tx, revision.id, d.documentoId);
  if (!actual) return null;
  if (quedoFija(actual)) return { revisionId: revision.id };
  await escribirDecision(tx, revision, actual, {
    ...d,
    ratificacionId: d.ratificacionId ?? null,
    verificacionId: d.verificacionId ?? null,
    tramiteId: d.tramiteId ?? null,
  });
  return { revisionId: revision.id };
}

/**
 * Desde `crearSolicitud`, en su transacción: pedir la modificación o la eliminación de un documento de la foto es su
 * decisión «actualizar» o «eliminar», enlazada al trámite, a nombre de quien pide. Una creación no tiene documento.
 */
export async function alSolicitar(
  tx: TransactionSql,
  d: { tipo: TipoSolicitud; documentoId: number; tramiteId: number; usuarioId: number; ahora: Date },
): Promise<void> {
  if (d.tipo === "crear") return;
  const [vigente] = await tx`SELECT id FROM documento_versiones WHERE documento_id = ${d.documentoId} AND estado = 'vigente'`;
  if (!vigente) return;
  await registrarDecision(tx, {
    documentoId: d.documentoId,
    versionId: Number(vigente.id),
    decision: d.tipo === "eliminar" ? "eliminar" : "actualizar",
    usuarioId: d.usuarioId,
    tramiteId: d.tramiteId,
    ahora: d.ahora,
  });
}

/**
 * Desde `aplicarPublicacion`: un documento que entra a la foto después de abrir (una creación publicada, una carga
 * nueva, un externo adoptado por primera vez) gana su fila como «revisado recientemente», a nombre del sistema, y suma
 * al conteo de su proceso. El que ya estaba conserva su decisión: la de su trámite (cuyo estado se lee al cerrar), la de
 * su verificación, o la que deje la adopción (`alAdoptar`, que corre después en la misma transacción).
 */
export async function alPublicarDuranteRevision(tx: TransactionSql, documentoId: number, versionId: number, ahora: Date): Promise<void> {
  const revision = await abiertaBloqueada(tx);
  if (!revision) return;
  const [ya] = await tx`SELECT 1 FROM revision_anual_decisiones WHERE revision_id = ${revision.id} AND documento_id = ${documentoId}`;
  if (ya) return;
  const [dueno] = await tx`SELECT COALESCE(dp.proceso_id, s.proceso_id) AS proceso_id, p.activo, d.codigo
    FROM documento_proceso dp
    JOIN documentos d ON d.id = dp.documento_id
    LEFT JOIN subprocesos s ON s.id = dp.subproceso_id
    JOIN procesos p ON p.id = COALESCE(dp.proceso_id, s.proceso_id)
    WHERE dp.documento_id = ${documentoId} AND dp.es_principal`;
  // Como al abrir: sin proceso propietario activo no está en la foto.
  if (!dueno?.activo) return;
  const procesoId = Number(dueno.proceso_id);
  await tx`INSERT INTO revision_anual_decisiones (revision_id, documento_id, version_id, decision, creado_en, actualizado_en)
    VALUES (${revision.id}, ${documentoId}, ${versionId}, 'reciente', ${ahora}, ${ahora})`;
  await tx`INSERT INTO revision_anual_procesos (revision_id, proceso_id, documentos)
    VALUES (${revision.id}, ${procesoId}, 1)
    ON CONFLICT (revision_id, proceso_id) DO UPDATE SET documentos = revision_anual_procesos.documentos + 1`;
  await registrarAuditoria(tx, {
    usuarioId: null,
    accion: "revision_anual_decision",
    entidad: "revision_anual",
    entidadId: revision.id,
    detalle: {
      anio: revision.anio,
      documentoId,
      codigo: dueno.codigo,
      versionId,
      antes: null,
      despues: { decision: "reciente", usuarioId: null, ratificacionId: null, verificacionId: null, tramiteId: null },
    },
  });
}
