import { type NextRequest, NextResponse } from "next/server";
import { archivoDeLote } from "@/db/consultas/indicadores/importacion";
import { crearLimitador } from "@/lib/limite";
import { puede } from "@/lib/permisos";
import { respuesta404, respuestaArchivo } from "@/lib/servir-archivo";
import { sesionDePeticion } from "@/lib/sesion-actual";

export const dynamic = "force-dynamic";

const permitirArchivo = crearLimitador({ limite: 60, ventanaMs: 60_000 });

/**
 * La plantilla que se subió a un lote de importación (spec 14A §5.7: el soporte del lote), a quien administra
 * indicadores. Siempre como descarga, con el MIME guardado, `nosniff` y `no-store`; un lote sin plantilla, 404.
 */
export async function GET(peticion: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const sesion = await sesionDePeticion(peticion);
  if (!sesion) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!puede(sesion, "indicadores.administrar")) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  if (!permitirArchivo(String(sesion.usuarioId))) {
    return NextResponse.json(
      { error: "Demasiadas peticiones, intente de nuevo en un momento" },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const { id } = await params;
  if (!/^\d{1,9}$/.test(id)) return respuesta404();
  const archivo = await archivoDeLote(sesion, Number(id));
  if (!archivo) return respuesta404();
  return respuestaArchivo(archivo, true);
}
