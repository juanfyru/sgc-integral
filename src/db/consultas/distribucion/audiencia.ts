import { obtenerSql, type Cliente } from "@/db/cliente";
import { registrarAuditoria } from "@/db/consultas/admin";
import { enTransaccion } from "@/db/consultas/flujo/contrato";
import { usuariosDeListas } from "@/db/consultas/distribucion/listas";
import { filtroAccesoDe } from "@/lib/alcance";
import { ErrorDistribucion } from "@/lib/distribucion/tipos";

type Opciones = { sql?: Cliente };

/**
 * A quién debe llegar el documento: las personas activas con alguno de sus procesos (el propietario y
 * «donde aplica»; un subproceso cuenta por su proceso) más las que alcanzan las listas activas asignadas,
 * y de ellas solo quien puede ver el documento: una lista no abre un restringido.
 */
export async function audienciaDeDocumento(sql: Cliente, documentoId: number): Promise<number[]> {
  const filas = await sql`
    SELECT u.id
    FROM usuarios u
    JOIN documentos d ON d.id = ${documentoId}
    WHERE u.activo AND ${filtroAccesoDe(sql, sql`u.id`)}
      AND u.id IN (
        SELECT up.usuario_id
        FROM documento_proceso dp
        LEFT JOIN subprocesos s ON s.id = dp.subproceso_id
        JOIN procesos p ON p.id = COALESCE(dp.proceso_id, s.proceso_id) AND p.activo
        JOIN usuario_procesos up ON up.proceso_id = p.id
        WHERE dp.documento_id = ${documentoId}
        UNION
        SELECT r.id FROM (${usuariosDeListas(
          sql,
          sql`m.lista_id IN (
            SELECT dl.lista_id FROM documento_listas dl
            JOIN listas_distribucion ld ON ld.id = dl.lista_id AND ld.activa
            WHERE dl.documento_id = ${documentoId})`,
        )}) r
      )
    ORDER BY u.id`;
  return filas.map((f) => Number(f.id));
}

export async function listasDeDocumento(
  sql: Cliente,
  documentoId: number,
): Promise<{ id: number; nombre: string; activa: boolean }[]> {
  const filas = await sql`
    SELECT l.id, l.nombre, l.activa FROM documento_listas dl
    JOIN listas_distribucion l ON l.id = dl.lista_id
    WHERE dl.documento_id = ${documentoId} ORDER BY l.id`;
  return filas.map((f) => ({ id: Number(f.id), nombre: f.nombre as string, activa: f.activa as boolean }));
}

export async function leerAudiencia(
  sql: Cliente,
  documentoId: number,
): Promise<{ listas: { id: number; nombre: string; activa: boolean }[]; lecturaObligatoriaIngreso: boolean }> {
  const [d] = await sql`SELECT lectura_obligatoria_ingreso FROM documentos WHERE id = ${documentoId}`;
  return {
    listas: await listasDeDocumento(sql, documentoId),
    lecturaObligatoriaIngreso: (d?.lectura_obligatoria_ingreso as boolean | undefined) ?? false,
  };
}

/** Reescribe las listas del documento y la marca de lectura obligatoria al ingresar; audita solo si cambió. */
export async function guardarAudiencia(
  documentoId: number,
  d: { listaIds: number[]; lecturaObligatoriaIngreso: boolean },
  actorId: number,
  opciones?: Opciones,
): Promise<void> {
  const sql = opciones?.sql ?? obtenerSql();
  const listaIds = [...new Set(d.listaIds)].sort((a, b) => a - b);
  await enTransaccion(sql, async (tx) => {
    const [doc] = await tx`SELECT lectura_obligatoria_ingreso FROM documentos WHERE id = ${documentoId} FOR UPDATE`;
    if (!doc) throw new ErrorDistribucion("El documento no existe");
    if (listaIds.length > 0) {
      const existentes = await tx`SELECT id FROM listas_distribucion WHERE id IN ${tx(listaIds)}`;
      if (existentes.length !== listaIds.length) throw new ErrorDistribucion("La lista elegida no existe");
    }
    const antes = {
      listas: (await listasDeDocumento(tx, documentoId)).map((l) => l.id),
      lecturaObligatoriaIngreso: doc.lectura_obligatoria_ingreso as boolean,
    };
    const despues = { listas: listaIds, lecturaObligatoriaIngreso: d.lecturaObligatoriaIngreso };
    if (JSON.stringify(antes) === JSON.stringify(despues)) return;
    await tx`DELETE FROM documento_listas WHERE documento_id = ${documentoId}`;
    for (const listaId of listaIds) {
      await tx`INSERT INTO documento_listas (documento_id, lista_id) VALUES (${documentoId}, ${listaId})`;
    }
    await tx`UPDATE documentos SET lectura_obligatoria_ingreso = ${d.lecturaObligatoriaIngreso}, actualizado_en = now()
      WHERE id = ${documentoId}`;
    await registrarAuditoria(tx, {
      usuarioId: actorId, accion: "editar_documento", entidad: "documento", entidadId: documentoId,
      detalle: { antes, despues },
    });
  });
}
