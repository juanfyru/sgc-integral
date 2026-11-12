import { type NextRequest, NextResponse } from "next/server";
import { soporteServible } from "@/db/consultas/indicadores/soportes";
import { crearLimitador } from "@/lib/limite";
import { respuesta404, respuestaArchivo } from "@/lib/servir-archivo";
import { sesionDePeticion } from "@/lib/sesion-actual";

export const dynamic = "force-dynamic";

const permitirArchivo = crearLimitador({ limite: 60, ventanaMs: 60_000 });

/**
 * Entrega el soporte de una medición a quien ve los soportes del indicador (spec 14 §6.4): Admin SGC, Gerencia, Control
 * Interno, el líder del proceso y los designados. Para los demás, aunque vean el indicador, y si el archivo no es un soporte
 * de una medición de ese indicador, 404. Siempre como descarga (un `.xlsx` no se interpreta en el navegador), con el MIME
 * guardado, `nosniff` y `no-store`. El último segmento es cosmético.
 */
export async function GET(
  peticion: NextRequest,
  { params }: { params: Promise<{ codigo: string; archivoId: string; nombre?: string[] }> },
) {
  const sesion = await sesionDePeticion(peticion);
  if (!sesion) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!permitirArchivo(String(sesion.usuarioId))) {
    return NextResponse.json(
      { error: "Demasiadas peticiones, intente de nuevo en un momento" },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const { codigo, archivoId } = await params;
  if (!/^\d{1,15}$/.test(archivoId)) return respuesta404();
  const archivo = await soporteServible(sesion, codigo, Number(archivoId));
  if (!archivo) return respuesta404();

  return respuestaArchivo(archivo, true);
}
