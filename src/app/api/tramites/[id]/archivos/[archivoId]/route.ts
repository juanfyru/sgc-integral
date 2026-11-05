import { unlink } from "node:fs/promises";
import { type NextRequest, NextResponse } from "next/server";
import { eliminarArchivoBorrador } from "@/db/consultas/admin";
import { archivoDeTramite, autorizarArchivoDeTramite } from "@/db/consultas/tramites-archivos";
import { resolverRutaAlmacen } from "@/lib/almacen";
import { crearLimitador } from "@/lib/limite";
import { origenValido } from "@/lib/origen";
import { puede } from "@/lib/permisos";
import { sesionDePeticion } from "@/lib/sesion-actual";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; archivoId: string }> };

// El mismo tope de la subida: reemplazar un archivo es quitarlo y volver a subirlo.
const permitirCambio = crearLimitador({ limite: 30, ventanaMs: 60_000 });

function error(estado: number, mensaje: string) {
  return NextResponse.json({ error: mensaje }, { status: estado });
}

/** Quita un archivo del borrador del trámite, con las mismas comprobaciones de la subida. */
export async function DELETE(peticion: NextRequest, { params }: Params) {
  const sesion = await sesionDePeticion(peticion);
  if (!sesion) return error(401, "No autorizado");
  if (!puede(sesion, "tramites.participar")) return error(403, "Sin permiso");
  if (!origenValido(peticion.headers)) return error(403, "Origen no permitido");
  if (!permitirCambio(String(sesion.usuarioId))) {
    return error(429, "Demasiados cambios seguidos. Espere un minuto.");
  }

  const { id, archivoId } = await params;
  if (!/^\d{1,15}$/.test(id) || !/^\d{1,15}$/.test(archivoId)) return error(404, "El archivo no existe");
  const permiso = await autorizarArchivoDeTramite(Number(id), sesion, "escribir");
  if (!permiso.ok) {
    return permiso.estado === 409
      ? error(409, "Este trámite ya no está en elaboración")
      : error(404, "El archivo no existe");
  }
  if (!(await archivoDeTramite(Number(id), Number(archivoId)))) return error(404, "El archivo no existe");

  try {
    const { ruta } = await eliminarArchivoBorrador(Number(archivoId), sesion.usuarioId);
    const absoluta = resolverRutaAlmacen(ruta);
    if (absoluta) await unlink(absoluta).catch(() => {});
    return NextResponse.json({ ok: true });
  } catch (err) {
    return error(409, (err as Error).message);
  }
}
