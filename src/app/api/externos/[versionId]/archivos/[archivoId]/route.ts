import { unlink } from "node:fs/promises";
import { type NextRequest, NextResponse } from "next/server";
import { eliminarArchivoBorrador } from "@/db/consultas/admin";
import { ErrorTramite } from "@/db/consultas/flujo/contrato";
import { archivoDeEdicion, autorizarArchivoDeEdicion, NO_BORRADOR } from "@/db/consultas/vigencia/externos";
import { resolverRutaAlmacen } from "@/lib/almacen";
import { crearLimitador } from "@/lib/limite";
import { origenValido } from "@/lib/origen";
import { puede } from "@/lib/permisos";
import { sesionDePeticion } from "@/lib/sesion-actual";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ versionId: string; archivoId: string }> };

// El mismo tope de la subida: reemplazar un archivo es quitarlo y volver a subirlo.
const permitirCambio = crearLimitador({ limite: 30, ventanaMs: 60_000 });

function error(estado: number, mensaje: string) {
  return NextResponse.json({ error: mensaje }, { status: estado });
}

/** Quita un archivo de la edición en borrador de un externo, con las mismas comprobaciones de la subida. */
export async function DELETE(peticion: NextRequest, { params }: Params) {
  const sesion = await sesionDePeticion(peticion);
  if (!sesion) return error(401, "No autorizado");
  if (!puede(sesion, "externos.gestionar")) return error(403, "Sin permiso");
  if (!origenValido(peticion.headers)) return error(403, "Origen no permitido");
  if (!permitirCambio(String(sesion.usuarioId))) {
    return error(429, "Demasiados cambios seguidos. Espere un minuto.");
  }

  const { versionId, archivoId } = await params;
  if (!/^\d{1,15}$/.test(versionId) || !/^\d{1,15}$/.test(archivoId)) return error(404, "El archivo no existe");
  const permiso = await autorizarArchivoDeEdicion(Number(versionId), sesion);
  if (!permiso.ok) return permiso.estado === 409 ? error(409, NO_BORRADOR) : error(404, "El archivo no existe");
  // Solo un archivo de esta edición: el id de otra versión no se borra pasando una que sí se gestiona.
  if (!(await archivoDeEdicion(Number(versionId), Number(archivoId)))) return error(404, "El archivo no existe");

  try {
    const { ruta } = await eliminarArchivoBorrador(Number(archivoId), sesion.usuarioId);
    const absoluta = resolverRutaAlmacen(ruta);
    if (absoluta) await unlink(absoluta).catch(() => {});
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ErrorTramite) return error(409, err.message);
    console.error("Fallo al quitar un archivo de una edición externa:", err);
    return error(500, "No se pudo quitar el archivo");
  }
}
