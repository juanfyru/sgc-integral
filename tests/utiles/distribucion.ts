/** Ayudantes de los tests de la distribución: todo corre dentro de una transacción que se revierte. */
import type { TransactionSql } from "postgres";
import { emitirCopia } from "@/db/consultas/distribucion/copias";
import type { SesionFlujo } from "@/db/consultas/tramites-flujo";
import type { DatosUsuario } from "@/db/consultas/usuarios";
import { documentoLibre, archivoPrincipal, type DocumentoLibre } from "./tramites";
import { pdfDePrueba } from "./pdf";

let consecutivo = 0;

/** Un punto de uso activo; `procesos` son siglas. El nombre no se repite entre corridas. */
export async function puntoDePrueba(
  tx: TransactionSql,
  d: { responsable: SesionFlujo; procesos?: string[]; nombre?: string; sede?: string },
): Promise<{ id: number; nombre: string }> {
  consecutivo += 1;
  const nombre = d.nombre ?? `zz_punto_${Date.now()}_${consecutivo}`;
  const [p] = await tx`INSERT INTO puntos_uso (nombre, sede, responsable_id)
    VALUES (${nombre}, ${d.sede ?? null}, ${d.responsable.usuarioId}) RETURNING id`;
  for (const sigla of d.procesos ?? []) {
    await tx`INSERT INTO punto_uso_procesos (punto_uso_id, proceso_id)
      SELECT ${p.id}, id FROM procesos WHERE sigla = ${sigla}`;
  }
  return { id: Number(p.id), nombre };
}

/**
 * Un documento vigente cuyo principal es un PDF real de dos páginas en el almacén (`ALMACEN_RUTA` debe
 * apuntar a una carpeta temporal). El test llama `limpiar` en un `finally`.
 */
export async function vigenteConPdf(
  tx: TransactionSql,
  d: { proceso: string; tipo: string; restringido?: boolean },
): Promise<{ documento: DocumentoLibre; versionId: number; hash: string; limpiar: () => Promise<void> }> {
  const documento = await documentoLibre(tx, { proceso: d.proceso, tipo: d.tipo });
  const [v] = await tx`SELECT id FROM documento_versiones WHERE documento_id = ${documento.id} AND estado = 'vigente'`;
  const versionId = Number(v.id);
  await tx`DELETE FROM archivos WHERE version_id = ${versionId} AND rol = 'principal'`;
  if (d.restringido) await tx`UPDATE documentos SET nivel_acceso = 'restringido' WHERE id = ${documento.id}`;
  const { hash, limpiar } = await archivoPrincipal(tx, versionId, await pdfDePrueba([[612, 792], [612, 792]]));
  return { documento, versionId, hash, limpiar };
}

/** Emite una copia con la función real. */
export function copiaDePrueba(
  tx: TransactionSql,
  d: { emisor: SesionFlujo; documento: DocumentoLibre; punto: { id: number }; ahora?: Date },
): Promise<{ copiaId: number; numero: number }> {
  return emitirCopia(d.emisor, { documentoId: d.documento.id, puntoUsoId: d.punto.id, nota: null }, { sql: tx, ahora: d.ahora });
}

/**
 * Para los documentos que `tramiteEn` crea con `documentoLibre`: cambia la fila falsa del principal de
 * la versión vigente de `codigo` por un PDF real (`ALMACEN_RUTA` debe ser una carpeta temporal) y
 * emite una copia con la función real.
 */
export async function copiaSobreVigente(
  tx: TransactionSql,
  d: { emisor: SesionFlujo; codigo: string; punto: { id: number }; ahora?: Date },
): Promise<{ copiaId: number; numero: number; limpiar: () => Promise<void> }> {
  const [v] = await tx`SELECT v.id, v.documento_id FROM documento_versiones v
    JOIN documentos doc ON doc.id = v.documento_id
    WHERE doc.codigo = ${d.codigo} AND v.estado = 'vigente'`;
  await tx`DELETE FROM archivos WHERE version_id = ${v.id} AND rol = 'principal'`;
  const { limpiar } = await archivoPrincipal(tx, Number(v.id), await pdfDePrueba([[612, 792]]));
  const { copiaId, numero } = await emitirCopia(
    d.emisor,
    { documentoId: Number(v.documento_id), puntoUsoId: d.punto.id, nota: null },
    { sql: tx, ahora: d.ahora },
  );
  return { copiaId, numero, limpiar };
}

/** La fila de la persona y sus procesos con la forma que recibe `editarUsuario`, para cambiar un solo campo. */
export async function datosDeUsuario(tx: TransactionSql, usuarioId: number): Promise<DatosUsuario> {
  const [u] = await tx`SELECT usuario, nombre, correo, rol, cargo_id, jefe_inmediato_id, ver_historial
    FROM usuarios WHERE id = ${usuarioId}`;
  const procesos = await tx`SELECT proceso_id FROM usuario_procesos WHERE usuario_id = ${usuarioId} ORDER BY proceso_id`;
  return {
    usuario: u.usuario,
    nombre: u.nombre,
    correo: u.correo,
    rol: u.rol,
    cargoId: u.cargo_id === null ? null : Number(u.cargo_id),
    jefeInmediatoId: u.jefe_inmediato_id === null ? null : Number(u.jefe_inmediato_id),
    procesoIds: procesos.map((p) => Number(p.proceso_id)),
    verHistorial: u.ver_historial,
  };
}
