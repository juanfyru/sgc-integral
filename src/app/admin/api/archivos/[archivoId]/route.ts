import { unlink } from "node:fs/promises";
import { type NextRequest, NextResponse } from "next/server";
import {
  eliminarArchivoBorrador,
  obtenerArchivoAdmin,
} from "@/db/consultas/admin";
import { puedeAccederDocumento, type SujetoVisibilidad } from "@/lib/alcance";
import { resolverRutaAlmacen } from "@/lib/almacen";
import { origenValido } from "@/lib/origen";
import { respuesta404, respuestaArchivo } from "@/lib/servir-archivo";
import { puede } from "@/lib/permisos";
import { sesionDePeticion } from "@/lib/sesion-actual";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ archivoId: string }> };

async function puedeVerArchivo(
  archivo: { estadoVersion: string; documentoId: number },
  sesion: SujetoVisibilidad,
): Promise<boolean> {
  if (archivo.estadoVersion === "borrador" || archivo.estadoVersion === "descartado") {
    return puede(sesion, "documentos.administrar");
  }
  return puede(sesion, "documentos.ver_historial") && puedeAccederDocumento(archivo.documentoId, sesion);
}

// Vista previa del panel, autorizada por el estado de la versión (spec 13A §12):
// borradores y descartadas para quien administra; vigentes, obsoletas y anuladas
// con historial y la regla de acceso. Quien no puede ver el archivo recibe 404,
// igual que si no existiera. La ruta pública sigue siendo la única para
// funcionarios y solo sirve vigentes.
export async function GET(peticion: NextRequest, { params }: Params) {
  const sesion = await sesionDePeticion(peticion);
  if (!sesion) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const id = Number((await params).archivoId);
  if (!Number.isInteger(id) || id <= 0) return respuesta404();
  const archivo = await obtenerArchivoAdmin(id);
  if (!archivo || !(await puedeVerArchivo(archivo, sesion))) return respuesta404();
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
