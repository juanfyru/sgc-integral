import { type NextRequest, NextResponse } from "next/server";
import { evidenciaServible } from "@/db/consultas/distribucion/evidencias";
import { existeNorma } from "@/db/consultas/normograma/lectura";
import { crearLimitador } from "@/lib/limite";
import { respuesta404, respuestaArchivo } from "@/lib/servir-archivo";
import { sesionDePeticion } from "@/lib/sesion-actual";

export const dynamic = "force-dynamic";

// El mismo tope de las demás rutas de archivos.
const permitirArchivo = crearLimitador({ limite: 60, ventanaMs: 60_000 });

/**
 * Sirve el PDF de una norma (spec 13C §10.1 y §6.4) a toda persona con sesión, también el de una retirada (conserva su
 * ficha). Sin marca de agua: no es un documento del hospital. Un archivo de otra norma, o que no existe, responde 404;
 * el último segmento es cosmético.
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
  if (!(await existeNorma(Number(id)))) return respuesta404();
  const archivo = await evidenciaServible("norma", Number(id), Number(archivoId));
  if (!archivo) return respuesta404();
  return respuestaArchivo(archivo, peticion.nextUrl.searchParams.get("descarga") === "1");
}
