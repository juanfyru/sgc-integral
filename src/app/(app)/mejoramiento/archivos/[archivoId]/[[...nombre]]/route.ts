import { type NextRequest, NextResponse } from "next/server";
import { archivoServible } from "@/db/consultas/mejoramiento/archivos";
import { crearLimitador } from "@/lib/limite";
import { respuesta404, respuestaArchivo } from "@/lib/servir-archivo";
import { sesionDePeticion } from "@/lib/sesion-actual";

export const dynamic = "force-dynamic";

const permitirArchivo = crearLimitador({ limite: 60, ventanaMs: 60_000 });

/**
 * Entrega un archivo de mejoramiento (spec 15 §12.2) a quien abre los de su dueño (`puedeAbrirArchivoDeMejora`); para los
 * demás, y ante un archivo que no es de este módulo, 404. Siempre como descarga, con el MIME guardado, `nosniff` y
 * `no-store`. El último segmento es cosmético.
 */
export async function GET(peticion: NextRequest, { params }: { params: Promise<{ archivoId: string; nombre?: string[] }> }) {
  const sesion = await sesionDePeticion(peticion);
  if (!sesion) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!permitirArchivo(String(sesion.usuarioId))) {
    return NextResponse.json(
      { error: "Demasiadas peticiones, intente de nuevo en un momento" },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }
  const { archivoId } = await params;
  if (!/^\d{1,15}$/.test(archivoId)) return respuesta404();
  const archivo = await archivoServible(sesion, Number(archivoId));
  if (!archivo) return respuesta404();
  return respuestaArchivo(archivo, true);
}
