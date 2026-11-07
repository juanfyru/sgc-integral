import { type NextRequest, NextResponse } from "next/server";
import { evidenciaServible } from "@/db/consultas/distribucion/evidencias";
import { obtenerJornada } from "@/db/consultas/distribucion/jornadas";
import { crearLimitador } from "@/lib/limite";
import { respuesta404, respuestaArchivo } from "@/lib/servir-archivo";
import { sesionDePeticion } from "@/lib/sesion-actual";

export const dynamic = "force-dynamic";

const permitirArchivo = crearLimitador({ limite: 60, ventanaMs: 60_000 });

/**
 * Sirve una evidencia de la jornada a quien puede ver la evidencia (Admin SGC, Gerencia, Control Interno y el
 * líder de sus procesos). Sin marca de agua: no es una copia del documento. Quien no la ve recibe 404; el
 * último segmento es cosmético.
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
  const jornada = await obtenerJornada(Number(id), sesion);
  if (!jornada?.puedeVerEvidencia) return respuesta404();
  const archivo = await evidenciaServible("jornada", Number(id), Number(archivoId));
  if (!archivo) return respuesta404();

  return respuestaArchivo(archivo, peticion.nextUrl.searchParams.get("descarga") === "1");
}
