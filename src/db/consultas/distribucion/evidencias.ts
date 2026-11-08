import { unlink } from "node:fs/promises";
import { obtenerSql, type Cliente } from "@/db/cliente";
import { registrarAuditoria } from "@/db/consultas/admin";
import { enTransaccion } from "@/db/consultas/flujo/contrato";
import { resolverRutaAlmacen } from "@/lib/almacen";
import type { ArchivoServible } from "@/lib/servir-archivo";
import type { ContextoEvidencia } from "@/lib/subida";
import { exigirVerificacionAbierta } from "./verificacion-abierta";

type Opciones = { sql?: Cliente };

export type Evidencia = {
  id: number;
  nombreOriginal: string;
  mime: string;
  tamanoBytes: number;
  hashSha256: string;
  creadoEn: Date;
};

/**
 * No decide quién ve: cada ruta que las sirve o las borra (jornadas, verificaciones) autoriza antes
 * de llamar, y una evidencia solo se alcanza por el contexto al que pertenece.
 */
export async function evidenciasDe(
  contexto: ContextoEvidencia,
  contextoId: number,
  opciones?: Opciones,
): Promise<Evidencia[]> {
  const sql = opciones?.sql ?? obtenerSql();
  const filas = await sql`SELECT id, nombre_original, mime, tamano_bytes, hash_sha256, creado_en
    FROM archivos WHERE contexto = ${contexto} AND contexto_id = ${contextoId} AND rol = 'evidencia'
    ORDER BY creado_en, id`;
  return filas.map((f) => ({
    id: Number(f.id), nombreOriginal: f.nombre_original, mime: f.mime,
    tamanoBytes: Number(f.tamano_bytes), hashSha256: f.hash_sha256, creadoEn: f.creado_en,
  }));
}

export async function evidenciaServible(
  contexto: ContextoEvidencia,
  contextoId: number,
  archivoId: number,
  opciones?: Opciones,
): Promise<ArchivoServible | null> {
  const sql = opciones?.sql ?? obtenerSql();
  const [f] = await sql`SELECT ruta, mime, nombre_original FROM archivos
    WHERE id = ${archivoId} AND contexto = ${contexto} AND contexto_id = ${contextoId} AND rol = 'evidencia'`;
  return f ? { ruta: f.ruta, mime: f.mime, nombreOriginal: f.nombre_original } : null;
}

/** Borra la fila (auditada) y luego el archivo; un archivo ya ausente no es un error. */
export async function eliminarEvidencia(
  contexto: ContextoEvidencia,
  contextoId: number,
  archivoId: number,
  usuarioId: number,
  opciones?: Opciones,
): Promise<void> {
  const ruta = await enTransaccion(opciones?.sql ?? obtenerSql(), async (tx) => {
    if (contexto === "verificacion_item") await exigirVerificacionAbierta(tx, contextoId);
    const [f] = await tx`SELECT ruta, nombre_original FROM archivos
      WHERE id = ${archivoId} AND contexto = ${contexto} AND contexto_id = ${contextoId} AND rol = 'evidencia'
      FOR UPDATE`;
    if (!f) throw new Error("La evidencia no existe");
    await tx`DELETE FROM archivos WHERE id = ${archivoId}`;
    await registrarAuditoria(tx, {
      usuarioId, accion: "eliminar_archivo", entidad: "archivo", entidadId: archivoId,
      detalle: { contexto, contextoId, nombre: f.nombre_original },
    });
    return f.ruta as string;
  });
  const absoluta = resolverRutaAlmacen(ruta);
  if (absoluta) await unlink(absoluta).catch(() => {});
}
