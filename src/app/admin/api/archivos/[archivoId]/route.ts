import { unlink } from "node:fs/promises";
import { type NextRequest, NextResponse } from "next/server";
import {
  eliminarArchivoBorrador,
  obtenerArchivoAdmin,
} from "@/db/consultas/admin";
import { resolverRutaAlmacen } from "@/lib/almacen";
import { origenValido } from "@/lib/origen";
import { respuesta404, respuestaArchivo } from "@/lib/servir-archivo";
import { puede } from "@/lib/permisos";
import { sesionDePeticion } from "@/lib/sesion-actual";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ archivoId: string }> };

// Vista previa del admin: sirve archivos de CUALQUIER estado (borradores para
// revisar antes de publicar, obsoletos para consulta histórica). La ruta
// pública sigue siendo la única para funcionarios y solo sirve vigentes.
export async function GET(peticion: NextRequest, { params }: Params) {
  const sesion = await sesionDePeticion(peticion);
  if (!sesion) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!puede(sesion, "documentos.ver_historial")) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }
  const id = Number((await params).archivoId);
  if (!Number.isInteger(id) || id <= 0) return respuesta404();
  const archivo = await obtenerArchivoAdmin(id);
  if (!archivo) return respuesta404();
  const esDescarga = peticion.nextUrl.searchParams.get("descarga") === "1";
  return respuestaArchivo(archivo, esDescarga);
}

export async function DELETE(peticion: NextRequest, { params }: Params) {
  if (!origenValido(peticion.headers)) {
    return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  }
  const sesion = await sesionDePeticion(peticion);
  if (!sesion) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!puede(sesion, "documentos.administrar")) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
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
