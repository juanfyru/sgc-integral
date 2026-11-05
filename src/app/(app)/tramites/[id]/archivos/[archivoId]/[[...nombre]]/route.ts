import { type NextRequest, NextResponse } from "next/server";
import { archivoDeTramite, autorizarArchivoDeTramite } from "@/db/consultas/tramites-archivos";
import { crearLimitador } from "@/lib/limite";
import { sesionDePeticion } from "@/lib/sesion-actual";
import { respuesta404, respuestaArchivo } from "@/lib/servir-archivo";

export const dynamic = "force-dynamic";

// El mismo tope de la ruta pública de archivos.
const permitirArchivo = crearLimitador({ limite: 60, ventanaMs: 60_000 });

/**
 * Sirve un archivo del borrador a quien ve el trámite, solo mientras está abierto (spec 13A
 * §6.5). Va sin marca de agua: no es una copia controlada, y la página muestra «EN TRÁMITE».
 * Quien no puede verlo recibe 404. El último segmento es cosmético, como en la ruta pública.
 */
export async function GET(
  peticion: NextRequest,
  { params }: { params: Promise<{ id: string; archivoId: string; nombre?: string[] }> },
) {
  const sesion = await sesionDePeticion(peticion);
  if (!sesion) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  if (!permitirArchivo(String(sesion.usuarioId))) {
    return NextResponse.json(
      { error: "Demasiadas peticiones, intente de nuevo en un momento" },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const { id, archivoId } = await params;
  if (!/^\d{1,15}$/.test(id) || !/^\d{1,15}$/.test(archivoId)) return respuesta404();
  const permiso = await autorizarArchivoDeTramite(Number(id), sesion, "leer");
  if (!permiso.ok) return respuesta404();
  const archivo = await archivoDeTramite(Number(id), Number(archivoId));
  if (!archivo) return respuesta404();

  return respuestaArchivo(archivo, peticion.nextUrl.searchParams.get("descarga") === "1");
}
