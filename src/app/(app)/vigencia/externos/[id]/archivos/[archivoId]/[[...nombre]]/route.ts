import { type NextRequest, NextResponse } from "next/server";
import { archivoDeBorradorExterno } from "@/db/consultas/vigencia/externos";
import { crearLimitador } from "@/lib/limite";
import { sesionDePeticion } from "@/lib/sesion-actual";
import { respuesta404, respuestaArchivo } from "@/lib/servir-archivo";

export const dynamic = "force-dynamic";

// El mismo tope de las demás rutas de archivos.
const permitirArchivo = crearLimitador({ limite: 60, ventanaMs: 60_000 });

/**
 * Sirve un archivo de la edición en borrador de un externo a quien ve su página de control (spec 13C §8.8): quien
 * adopta abre lo que firma. Va sin marca de agua: no es una copia controlada. Quien no lo ve, un archivo de otro
 * externo o una edición que ya no está en borrador reciben 404. El último segmento es cosmético, como en la ficha.
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
  const archivo = await archivoDeBorradorExterno(Number(id), Number(archivoId), sesion);
  if (!archivo) return respuesta404();
  return respuestaArchivo(archivo, peticion.nextUrl.searchParams.get("descarga") === "1");
}
