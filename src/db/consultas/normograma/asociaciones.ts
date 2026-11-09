/**
 * Las asociaciones del normograma (spec 13C §10.3): norma–proceso, con el requisito que la norma le impone, y
 * norma–documento (los internos que la implementan y los externos que la referencian, en la misma tabla). Las edita
 * quien tiene `normograma.procesos` sobre el proceso (`puedeAsociarNorma`): el Admin SGC todos, el líder los suyos; el
 * enlace de un documento, sobre su proceso propietario y si la persona lo ve.
 */
import type { TransactionSql } from "postgres";
import { obtenerSql, type Cliente } from "@/db/cliente";
import { registrarAuditoria } from "@/db/consultas/admin";
import { enTransaccion, type SesionFlujo } from "@/db/consultas/flujo/contrato";
import { propietarioDeDocumento } from "@/db/consultas/tramites";
import { alcanceProcesos, puedeAccederDocumento, puedeAsociarNorma } from "@/lib/alcance";
import { ErrorNormograma, opcionalAcotado } from "@/lib/normograma/tipos";
import { ErrorPermiso, puede } from "@/lib/permisos";
import { nombreSql } from "./busqueda";
import { filasDeNormas, NORMA_NO_EXISTE, type FilaNorma } from "./normas";

type Opciones = { sql?: Cliente; ahora?: Date };

const DOCUMENTO_NO_EXISTE = "El documento no existe";

function exigirPermiso(sesion: SesionFlujo): void {
  if (!puede(sesion, "normograma.procesos")) throw new ErrorPermiso();
}

/** La norma, bloqueada para compartir (un borrado o un retiro concurrente esperan); una retirada no admite cambios. */
async function normaAbierta(tx: TransactionSql, normaId: number): Promise<string> {
  const [n] = await tx`SELECT n.estado, ${nombreSql(tx)} AS nombre
    FROM normas n JOIN tipos_norma tn ON tn.id = n.tipo_norma_id WHERE n.id = ${normaId} FOR SHARE OF n`;
  if (!n) throw new ErrorNormograma(NORMA_NO_EXISTE);
  if (n.estado === "retirada") throw new ErrorNormograma(`${n.nombre} está retirada`);
  return n.nombre as string;
}

/** Asociar exige un proceso activo; quitar una asociación, no (el Admin SGC limpia la de un proceso desactivado). */
async function exigirProceso(tx: TransactionSql, sesion: SesionFlujo, procesoId: number, soloActivo: boolean): Promise<string> {
  const [p] = await tx`SELECT nombre, activo FROM procesos WHERE id = ${procesoId}`;
  if (!p || (soloActivo && !p.activo)) throw new ErrorNormograma("El proceso no existe");
  if (!puedeAsociarNorma(sesion, procesoId, await alcanceProcesos(sesion, { sql: tx }))) {
    throw new ErrorNormograma("Solo puede asociar normas a los procesos que lidera");
  }
  return p.nombre as string;
}

/** Asocia la norma al proceso o, si ya lo está, actualiza su requisito; el mismo requisito no escribe nada. */
export async function asociarProceso(
  sesion: SesionFlujo,
  d: { normaId: number; procesoId: number; requisito: string | null },
  opciones?: Opciones,
): Promise<void> {
  exigirPermiso(sesion);
  const requisito = opcionalAcotado(d.requisito, "El requisito", 2000);
  const ahora = opciones?.ahora ?? new Date();
  await enTransaccion(opciones?.sql ?? obtenerSql(), async (tx) => {
    const nombre = await normaAbierta(tx, d.normaId);
    const proceso = await exigirProceso(tx, sesion, d.procesoId, true);
    const [actual] = await tx`SELECT id, requisito FROM norma_procesos
      WHERE norma_id = ${d.normaId} AND proceso_id = ${d.procesoId} FOR UPDATE`;
    if (actual && (actual.requisito ?? null) === requisito) return;
    if (actual) {
      await tx`UPDATE norma_procesos SET requisito = ${requisito}, actualizado_por = ${sesion.usuarioId}, actualizado_en = ${ahora}
        WHERE id = ${actual.id}`;
    } else {
      // Dos asociaciones simultáneas: la segunda no inserta otra fila y actualiza el requisito.
      await tx`INSERT INTO norma_procesos (norma_id, proceso_id, requisito, creado_por, creado_en)
        VALUES (${d.normaId}, ${d.procesoId}, ${requisito}, ${sesion.usuarioId}, ${ahora})
        ON CONFLICT (norma_id, proceso_id)
        DO UPDATE SET requisito = EXCLUDED.requisito, actualizado_por = ${sesion.usuarioId}, actualizado_en = ${ahora}`;
    }
    await registrarAuditoria(tx, {
      usuarioId: sesion.usuarioId,
      accion: actual ? "norma_requisito_editado" : "norma_asociada",
      entidad: "norma",
      entidadId: d.normaId,
      detalle: actual
        ? { nombre, procesoId: d.procesoId, proceso, antes: actual.requisito ?? null, despues: requisito }
        : { nombre, procesoId: d.procesoId, proceso, requisito },
    });
  });
}

export async function desasociarProceso(sesion: SesionFlujo, d: { normaId: number; procesoId: number }, opciones?: Opciones): Promise<void> {
  exigirPermiso(sesion);
  await enTransaccion(opciones?.sql ?? obtenerSql(), async (tx) => {
    const [n] = await tx`SELECT ${nombreSql(tx)} AS nombre FROM normas n JOIN tipos_norma tn ON tn.id = n.tipo_norma_id WHERE n.id = ${d.normaId}`;
    if (!n) throw new ErrorNormograma(NORMA_NO_EXISTE);
    const proceso = await exigirProceso(tx, sesion, d.procesoId, false);
    const [quitada] = await tx`DELETE FROM norma_procesos WHERE norma_id = ${d.normaId} AND proceso_id = ${d.procesoId} RETURNING requisito`;
    if (!quitada) throw new ErrorNormograma("La norma no está asociada a ese proceso");
    await registrarAuditoria(tx, {
      usuarioId: sesion.usuarioId,
      accion: "norma_desasociada",
      entidad: "norma",
      entidadId: d.normaId,
      detalle: { nombre: n.nombre, procesoId: d.procesoId, proceso, requisito: quitada.requisito ?? null },
    });
  });
}

/**
 * El documento, si la persona lo ve, y el derecho sobre su proceso propietario. Quien no lo ve no sabe que existe;
 * quien lo ve pero no tiene su proceso, recibe el motivo.
 */
async function documentoGestionable(tx: TransactionSql, sesion: SesionFlujo, documentoId: number, verbo: string) {
  if (!(await puedeAccederDocumento(documentoId, sesion, { sql: tx }))) throw new ErrorNormograma(DOCUMENTO_NO_EXISTE);
  const [d] = await tx`SELECT codigo FROM documentos WHERE id = ${documentoId}`;
  const propietario = await propietarioDeDocumento(documentoId, { sql: tx });
  if (!d || !propietario) throw new ErrorNormograma(DOCUMENTO_NO_EXISTE);
  if (!puedeAsociarNorma(sesion, propietario.procesoId, await alcanceProcesos(sesion, { sql: tx }))) {
    throw new ErrorNormograma(`Solo puede ${verbo} documentos de los procesos que lidera`);
  }
  return { codigo: d.codigo as string };
}

/** Enlaza un documento interno o externo a la norma (spec 13C §10.3): un cambio de la norma le abrirá un impacto. */
export async function enlazarDocumento(sesion: SesionFlujo, d: { normaId: number; documentoId: number }, opciones?: Opciones): Promise<void> {
  exigirPermiso(sesion);
  const ahora = opciones?.ahora ?? new Date();
  await enTransaccion(opciones?.sql ?? obtenerSql(), async (tx) => {
    const nombre = await normaAbierta(tx, d.normaId);
    const { codigo } = await documentoGestionable(tx, sesion, d.documentoId, "enlazar");
    const [nuevo] = await tx`INSERT INTO norma_documentos (norma_id, documento_id, creado_por, creado_en)
      VALUES (${d.normaId}, ${d.documentoId}, ${sesion.usuarioId}, ${ahora})
      ON CONFLICT (norma_id, documento_id) DO NOTHING
      RETURNING id`;
    if (!nuevo) throw new ErrorNormograma("El documento ya está enlazado a esta norma");
    await registrarAuditoria(tx, {
      usuarioId: sesion.usuarioId,
      accion: "norma_documento_enlazado",
      entidad: "norma",
      entidadId: d.normaId,
      detalle: { nombre, documentoId: d.documentoId, codigo },
    });
  });
}

export async function desenlazarDocumento(sesion: SesionFlujo, d: { normaId: number; documentoId: number }, opciones?: Opciones): Promise<void> {
  exigirPermiso(sesion);
  await enTransaccion(opciones?.sql ?? obtenerSql(), async (tx) => {
    const [n] = await tx`SELECT ${nombreSql(tx)} AS nombre FROM normas n JOIN tipos_norma tn ON tn.id = n.tipo_norma_id WHERE n.id = ${d.normaId}`;
    if (!n) throw new ErrorNormograma(NORMA_NO_EXISTE);
    const { codigo } = await documentoGestionable(tx, sesion, d.documentoId, "quitar el enlace de");
    const [quitado] = await tx`DELETE FROM norma_documentos WHERE norma_id = ${d.normaId} AND documento_id = ${d.documentoId} RETURNING id`;
    if (!quitado) throw new ErrorNormograma("El documento no está enlazado a esta norma");
    await registrarAuditoria(tx, {
      usuarioId: sesion.usuarioId,
      accion: "norma_documento_desenlazado",
      entidad: "norma",
      entidadId: d.normaId,
      detalle: { nombre: n.nombre, documentoId: d.documentoId, codigo },
    });
  });
}

/**
 * El normograma del proceso (spec 13C §10.6 y §9.4): las normas no retiradas asociadas a él, con su requisito.
 * `documentos` cuenta los que la persona ve.
 */
export async function normasDeProceso(
  procesoId: number,
  sesion: SesionFlujo,
  opciones?: Opciones,
): Promise<(FilaNorma & { requisito: string | null })[]> {
  const sql = opciones?.sql ?? obtenerSql();
  const filas = await filasDeNormas(
    sql,
    sql`n.estado <> 'retirada' AND EXISTS (SELECT 1 FROM norma_procesos pnp WHERE pnp.norma_id = n.id AND pnp.proceso_id = ${procesoId})`,
    sesion,
    procesoId,
  );
  return filas.map((f) => ({ ...f.fila, requisito: f.requisito }));
}

/**
 * Todas las normas enlazadas a un documento, en cualquier estado (el control de un externo muestra una sola; resolución
 * 10 de la Tarea 8); ninguna si la persona no ve el documento.
 */
export async function normasDeDocumento(documentoId: number, sesion: SesionFlujo, opciones?: Opciones): Promise<FilaNorma[]> {
  const sql = opciones?.sql ?? obtenerSql();
  if (!(await puedeAccederDocumento(documentoId, sesion, { sql }))) return [];
  const filas = await filasDeNormas(
    sql,
    sql`EXISTS (SELECT 1 FROM norma_documentos dnd WHERE dnd.norma_id = n.id AND dnd.documento_id = ${documentoId})`,
    sesion,
  );
  return filas.map((f) => f.fila);
}
