import { unlink } from "node:fs/promises";
import { type NextRequest, NextResponse } from "next/server";
import {
  eliminarArchivoBorrador,
  obtenerArchivoAdmin,
} from "@/db/consultas/admin";
import { resolverRutaAlmacen } from "@/lib/almacen";
import { respuesta404, respuestaArchivo } from "@/lib/servir-archivo";
import { requerirSesion } from "@/lib/sesion-actual";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ archivoId: string }> };

// Vista previa del admin: sirve archivos de CUALQUIER estado (borradores para
// revisar antes de publicar, obsoletos para consulta histórica). La ruta
// pública sigue siendo la única para funcionarios y solo sirve vigentes.
export async function GET(peticion: NextRequest, { params }: Params) {
  try {
    await requerirSesion();
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const id = Number((await params).archivoId);
  if (!Number.isInteger(id) || id <= 0) return respuesta404();
  const archivo = await obtenerArchivoAdmin(id);
  if (!archivo) return respuesta404();
  const esDescarga = peticion.nextUrl.searchParams.get("descarga") === "1";
  return respuestaArchivo(archivo, esDescarga);
}

export async function DELETE(_peticion: NextRequest, { params }: Params) {
  let sesion;
  try {
    sesion = await requerirSesion();
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const id = Number((await params).archivoId);
  if (!Number.isInteger(id) || id <= 0) return respuesta404();
  try {
    const { ruta } = await eliminarArchivoBorrador(id, sesion.usuarioId);
    const absoluta = resolverRutaAlmacen(ruta);
    if (absoluta) await unlink(absoluta).catch(() => {});
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 409 });
  }
}
