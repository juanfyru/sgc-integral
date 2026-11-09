import { type NextRequest, NextResponse } from "next/server";
import { evidenciaServible } from "@/db/consultas/distribucion/evidencias";
import { obtenerHallazgo } from "@/db/consultas/distribucion/hallazgos";
import { crearLimitador } from "@/lib/limite";
import { respuesta404, respuestaArchivo } from "@/lib/servir-archivo";
import { sesionDePeticion } from "@/lib/sesion-actual";

export const dynamic = "force-dynamic";

const permitirArchivo = crearLimitador({ limite: 60, ventanaMs: 60_000 });

/**
 * Sirve la foto de la corrección de un hallazgo a quien ve el hallazgo (quien ve su punto: Admin SGC, Gerencia, Control
 * Interno, el líder de los procesos del punto y su responsable). Para los demás, y si la foto no es de ese hallazgo, 404.
 * El último segmento es cosmético.
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
  const hallazgo = await obtenerHallazgo(Number(id), sesion);
  if (!hallazgo || !hallazgo.fotosCorreccion.some((f) => f.id === Number(archivoId))) return respuesta404();
  const archivo = await evidenciaServible("hallazgo", hallazgo.id, Number(archivoId));
  if (!archivo) return respuesta404();

  return respuestaArchivo(archivo, peticion.nextUrl.searchParams.get("descarga") === "1");
}
