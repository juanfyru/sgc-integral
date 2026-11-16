import { type NextRequest, NextResponse } from "next/server";
import { soporteDeDatoServible } from "@/db/consultas/indicadores/datos-soporte";
import { crearLimitador } from "@/lib/limite";
import { respuesta404, respuestaArchivo } from "@/lib/servir-archivo";
import { sesionDePeticion } from "@/lib/sesion-actual";

export const dynamic = "force-dynamic";

const permitirArchivo = crearLimitador({ limite: 60, ventanaMs: 60_000 });

/**
 * Entrega el soporte de un periodo de un dato compartido (anexo 14C, §4.6) a quien ve el dato o los soportes de algún
 * indicador que lo cita (`puedeVerSoporteDeDato`). Para los demás, y si el archivo no es un soporte de ese dato, 404.
 * Siempre como descarga (un `.xlsx` no se interpreta en el navegador), con el MIME guardado, `nosniff` y `no-store`.
 */
export async function GET(peticion: NextRequest, { params }: { params: Promise<{ id: string; archivoId: string }> }) {
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
  const archivo = await soporteDeDatoServible(sesion, { datoId: Number(id), archivoId: Number(archivoId) });
  if (!archivo) return respuesta404();
  return respuestaArchivo(archivo, true);
}
