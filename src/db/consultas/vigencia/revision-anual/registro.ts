/**
 * El registro de las decisiones de la revisión anual desde los actos que las producen (spec 13C §9.3): ratificar,
 * verificar o retirar un externo, adoptar una edición, pedir una solicitud de modificación o eliminación, publicar y
 * deshacer una carga. Lo que se hace fuera de la página de la campaña también cuenta: la decisión queda dentro de la
 * transacción del acto, a nombre de quien lo hizo, aunque no tenga `revision_anual.decidir`. Una decisión queda fija
 * cuando produjo su ratificación o cuando su trámite fue aceptado; antes (un trámite retirado, rechazado o cancelado) se
 * puede decidir de nuevo. En un externo manda el acto más reciente: cada verificación, adopción o retiro deja su
 * evidencia inmutable y reescribe la decisión.
 *
 * Con la revisión abierta, cada acto la lee con `FOR SHARE` (una vez: la pasa a `registrarDecision`): el cierre (que la
 * toma `FOR UPDATE`) espera al acto, o el acto la ve ya cerrada y sigue sin registrar nada. Cualquier otro fallo al
 * registrar la decisión hace fallar el acto: una decisión perdida en silencio sería peor evidencia que un acto que se
 * reintenta.
 *
 * Lo importan `aplicarPublicacion` y `deshacerCargaEn` (admin.ts) y los actos. Con admin.ts forma un ciclo de
 * importaciones benigno (cada lado usa al otro solo dentro de funciones); por lo demás depende de tipos y de `comun.ts`,
 * para no cerrar otro a través de los avisos y la estructura.
 */
import type { TransactionSql } from "postgres";
import { registrarAuditoria } from "@/db/consultas/admin";
import type { Etapa, TipoSolicitud } from "@/lib/tramites/tipos";
import type { Decision } from "@/lib/vigencia/tipos";
import { ETAPAS_QUE_NO_FIJAN, PENDIENTE } from "./comun";

export type Enlaces = { ratificacionId: number | null; verificacionId: number | null; tramiteId: number | null };

export type FilaDecision = Enlaces & {
  id: number;
  codigo: string;
  /** La versión de la fila: la vigente al abrir, o la que adoptó un externo. */
  versionId: number;
  decision: Decision;
  usuarioId: number | null;
  tramiteEtapa: Etapa | null;
};

export type NuevaDecision = {
  documentoId: number;
  versionId: number;
  decision: "ratificar" | "actualizar" | "eliminar" | "reciente";
  /** Nulo cuando la registra el sistema. */
  usuarioId: number | null;
  ratificacionId?: number;
  verificacionId?: number;
  tramiteId?: number;
  /** La adopción mueve la fila a la versión adoptada; los demás actos no tocan la versión. */
  moverVersion?: boolean;
  ahora: Date;
};

export type RevisionBloqueada = { id: number; anio: number };

const id = (v: unknown) => (v === null || v === undefined ? null : Number(v));

/** La revisión abierta, leída con `FOR SHARE`: el cierre y la prórroga esperan a quien escribe en ella. */
export async function revisionAbiertaBloqueada(tx: TransactionSql): Promise<RevisionBloqueada | null> {
  const [r] = await tx`SELECT id, anio FROM revisiones_anuales WHERE estado = 'abierta' FOR SHARE`;
  return r ? { id: Number(r.id), anio: Number(r.anio) } : null;
}

/** `abierta`, si ya se leyó; si no, la lee. */
async function laAbierta(tx: TransactionSql, abierta: RevisionBloqueada | null | undefined): Promise<RevisionBloqueada | null> {
  return abierta === undefined ? revisionAbiertaBloqueada(tx) : abierta;
}

/** La revisión abierta que tiene al documento en su foto; nula si no hay o no lo tiene. `abierta`, si ya se leyó. */
export async function revisionQueIncluye(
  tx: TransactionSql,
  documentoId: number,
  abierta?: RevisionBloqueada | null,
): Promise<RevisionBloqueada | null> {
  const r = await laAbierta(tx, abierta);
  if (!r) return null;
  const [f] = await tx`SELECT 1 FROM revision_anual_decisiones WHERE revision_id = ${r.id} AND documento_id = ${documentoId}`;
  return f ? r : null;
}

/** La fila de decisión del documento en la revisión, bloqueada; nula si no está en su foto. */
export async function filaDeDecision(tx: TransactionSql, revisionId: number, documentoId: number): Promise<FilaDecision | null> {
  const [f] = await tx`SELECT rad.id, d.codigo, rad.version_id, rad.decision, rad.usuario_id, rad.ratificacion_id, rad.verificacion_id,
      rad.tramite_id, t.etapa AS tramite_etapa
    FROM revision_anual_decisiones rad
    JOIN documentos d ON d.id = rad.documento_id
    LEFT JOIN tramites t ON t.id = rad.tramite_id
    WHERE rad.revision_id = ${revisionId} AND rad.documento_id = ${documentoId}
    FOR UPDATE OF rad`;
  if (!f) return null;
  return {
    id: Number(f.id),
    codigo: f.codigo as string,
    versionId: Number(f.version_id),
    decision: f.decision as Decision,
    usuarioId: id(f.usuario_id),
    ratificacionId: id(f.ratificacion_id),
    verificacionId: id(f.verificacion_id),
    tramiteId: id(f.tramite_id),
    tramiteEtapa: (f.tramite_etapa as Etapa | null) ?? null,
  };
}

/**
 * Produjo su ratificación, o su trámite fue aceptado (spec 13C §9.3). La verificación de un externo no la fija: el acto
 * siguiente sobre él la reescribe.
 */
export function quedoFija(f: FilaDecision): boolean {
  if (f.ratificacionId !== null) return true;
  return f.tramiteId !== null && f.tramiteEtapa !== null && !ETAPAS_QUE_NO_FIJAN.includes(f.tramiteEtapa);
}

/** Lo que la bitácora guarda de una decisión. */
function enBitacora(f: Pick<FilaDecision, "decision" | "usuarioId" | "versionId"> & Enlaces) {
  return {
    decision: f.decision,
    usuarioId: f.usuarioId,
    versionId: f.versionId,
    ratificacionId: f.ratificacionId,
    verificacionId: f.verificacionId,
    tramiteId: f.tramiteId,
  };
}

/**
 * Escribe la decisión nueva sobre la fila, con antes y después en la bitácora (la pendiente es «sin decisión»); con
 * `moverVersion`, también la versión. Nada cambia si ya dice lo mismo con los mismos enlaces y la misma versión: así la
 * adopción que sigue a la publicación de un externo nuevo no escribe dos veces. `versionId` es la del acto (nula si el
 * documento ya no tiene vigente).
 */
export async function escribirDecision(
  tx: TransactionSql,
  revision: RevisionBloqueada,
  actual: FilaDecision,
  d: { documentoId: number; versionId: number | null; decision: Decision; usuarioId: number | null; moverVersion?: boolean; ahora: Date } & Enlaces,
): Promise<void> {
  const versionNueva = d.moverVersion && d.versionId !== null ? d.versionId : actual.versionId;
  const igual =
    actual.decision === d.decision &&
    actual.ratificacionId === d.ratificacionId &&
    actual.verificacionId === d.verificacionId &&
    actual.tramiteId === d.tramiteId &&
    actual.versionId === versionNueva;
  if (igual) return;
  await tx`UPDATE revision_anual_decisiones SET decision = ${d.decision}, usuario_id = ${d.usuarioId}, version_id = ${versionNueva},
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
      despues: enBitacora({ ...d, versionId: versionNueva }),
    },
  });
}

/**
 * Registra la decisión de un documento en la revisión abierta, dentro de la transacción del acto que la produce. Sin
 * revisión abierta, o si el documento no está en su foto, no hace nada y devuelve `null`. Si la decisión que tiene quedó
 * fija, no la toca. La llaman `alRatificar`, la verificación y el retiro de un externo, `alAdoptar` y `alSolicitar`.
 * `revision`: la abierta, si el acto ya la leyó (nula si no hay).
 */
export async function registrarDecision(
  tx: TransactionSql,
  d: NuevaDecision,
  revision?: RevisionBloqueada | null,
): Promise<{ revisionId: number } | null> {
  const abierta = await laAbierta(tx, revision);
  if (!abierta) return null;
  const actual = await filaDeDecision(tx, abierta.id, d.documentoId);
  if (!actual) return null;
  if (quedoFija(actual)) return { revisionId: abierta.id };
  await escribirDecision(tx, abierta, actual, {
    ...d,
    ratificacionId: d.ratificacionId ?? null,
    verificacionId: d.verificacionId ?? null,
    tramiteId: d.tramiteId ?? null,
  });
  return { revisionId: abierta.id };
}

/**
 * Desde `crearSolicitud`, en su transacción: pedir la modificación o la eliminación de un documento de la foto es su
 * decisión «actualizar» o «eliminar», enlazada al trámite, a nombre de quien pide. Una creación no tiene documento.
 */
export async function alSolicitar(
  tx: TransactionSql,
  d: { tipo: TipoSolicitud; documentoId: number; tramiteId: number; usuarioId: number; ahora: Date },
  revision?: RevisionBloqueada | null,
): Promise<void> {
  if (d.tipo === "crear") return;
  const abierta = await laAbierta(tx, revision);
  if (!abierta) return;
  const [vigente] = await tx`SELECT id FROM documento_versiones WHERE documento_id = ${d.documentoId} AND estado = 'vigente'`;
  if (!vigente) return;
  await registrarDecision(
    tx,
    {
      documentoId: d.documentoId,
      versionId: Number(vigente.id),
      decision: d.tipo === "eliminar" ? "eliminar" : "actualizar",
      usuarioId: d.usuarioId,
      tramiteId: d.tramiteId,
      ahora: d.ahora,
    },
    abierta,
  );
}

/** El proceso propietario de hoy de un documento, si es activo. */
async function procesoPropietario(tx: TransactionSql, documentoId: number): Promise<{ procesoId: number; activo: boolean; codigo: string } | null> {
  const [f] = await tx`SELECT COALESCE(dp.proceso_id, s.proceso_id) AS proceso_id, p.activo, d.codigo
    FROM documento_proceso dp
    JOIN documentos d ON d.id = dp.documento_id
    LEFT JOIN subprocesos s ON s.id = dp.subproceso_id
    JOIN procesos p ON p.id = COALESCE(dp.proceso_id, s.proceso_id)
    WHERE dp.documento_id = ${documentoId} AND dp.es_principal`;
  return f ? { procesoId: Number(f.proceso_id), activo: f.activo as boolean, codigo: f.codigo as string } : null;
}

/**
 * Desde `aplicarPublicacion`: un documento que entra a la foto después de abrir (una creación publicada, una carga
 * nueva, un externo adoptado por primera vez) gana su fila como «revisado recientemente», a nombre del sistema, y suma
 * al conteo de su proceso. El que ya estaba conserva su decisión: la de su trámite (cuyo estado se lee al cerrar), o la
 * que deje la adopción (`alAdoptar`, que corre después en la misma transacción). `revision`: la abierta, si ya se leyó.
 */
export async function alPublicarDuranteRevision(
  tx: TransactionSql,
  documentoId: number,
  versionId: number,
  ahora: Date,
  revision?: RevisionBloqueada | null,
): Promise<void> {
  const abierta = await laAbierta(tx, revision);
  if (!abierta) return;
  const [ya] = await tx`SELECT 1 FROM revision_anual_decisiones WHERE revision_id = ${abierta.id} AND documento_id = ${documentoId}`;
  if (ya) return;
  const dueno = await procesoPropietario(tx, documentoId);
  // Como al abrir: sin proceso propietario activo no está en la foto.
  if (!dueno?.activo) return;
  await tx`INSERT INTO revision_anual_decisiones (revision_id, documento_id, version_id, decision, creado_en, actualizado_en)
    VALUES (${abierta.id}, ${documentoId}, ${versionId}, 'reciente', ${ahora}, ${ahora})`;
  await tx`INSERT INTO revision_anual_procesos (revision_id, proceso_id, documentos)
    VALUES (${abierta.id}, ${dueno.procesoId}, 1)
    ON CONFLICT (revision_id, proceso_id) DO UPDATE SET documentos = revision_anual_procesos.documentos + 1`;
  await registrarAuditoria(tx, {
    usuarioId: null,
    accion: "revision_anual_decision",
    entidad: "revision_anual",
    entidadId: abierta.id,
    detalle: {
      anio: abierta.anio,
      documentoId,
      codigo: dueno.codigo,
      versionId,
      antes: null,
      despues: { decision: "reciente", usuarioId: null, versionId, ratificacionId: null, verificacionId: null, tramiteId: null },
    },
  });
}

/**
 * Saca a un documento de la foto de la revisión abierta (una carga deshecha: el documento no debió estar): borra su fila,
 * descuenta su proceso y, si el proceso queda sin documentos y sin el normograma confirmado, borra también la fila del
 * proceso. La revisión va primero, con `FOR SHARE` (el orden de candados de siempre). Queda en la bitácora con su
 * decisión de antes (nula si estaba pendiente), `despues: null` y el motivo. Sin revisión abierta o sin su fila, nada.
 */
export async function sacarDeLaFoto(
  tx: TransactionSql,
  d: { documentoId: number; usuarioId: number | null; motivo: string },
  revision?: RevisionBloqueada | null,
): Promise<void> {
  const abierta = await laAbierta(tx, revision);
  if (!abierta) return;
  const actual = await filaDeDecision(tx, abierta.id, d.documentoId);
  if (!actual) return;
  await tx`DELETE FROM revision_anual_decisiones WHERE id = ${actual.id}`;
  const dueno = await procesoPropietario(tx, d.documentoId);
  if (dueno) {
    const [proceso] = await tx`UPDATE revision_anual_procesos SET documentos = GREATEST(documentos - 1, 0)
      WHERE revision_id = ${abierta.id} AND proceso_id = ${dueno.procesoId}
      RETURNING id, documentos, normograma_resultado`;
    if (proceso && Number(proceso.documentos) === 0 && proceso.normograma_resultado === null) {
      await tx`DELETE FROM revision_anual_procesos WHERE id = ${proceso.id}`;
    }
  }
  await registrarAuditoria(tx, {
    usuarioId: d.usuarioId,
    accion: "revision_anual_decision",
    entidad: "revision_anual",
    entidadId: abierta.id,
    detalle: {
      anio: abierta.anio,
      documentoId: d.documentoId,
      codigo: actual.codigo,
      versionId: actual.versionId,
      antes: actual.decision === PENDIENTE ? null : enBitacora(actual),
      despues: null,
      motivo: d.motivo,
    },
  });
}
