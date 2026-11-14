import { type NextRequest, NextResponse } from "next/server";
import { listasDePlantilla } from "@/db/consultas/indicadores/importacion";
import { plantillaDeImportacion } from "@/lib/indicadores/importacion/plantilla";
import { crearLimitador } from "@/lib/limite";
import { puede } from "@/lib/permisos";
import { sesionDePeticion } from "@/lib/sesion-actual";

export const dynamic = "force-dynamic";

const permitirPlantilla = crearLimitador({ limite: 10, ventanaMs: 60_000 });

/**
 * La plantilla de la importación de indicadores (spec 14A §5.2): la hoja «Indicadores», las instrucciones y las listas
 * desplegables de los maestros y del mapa de hoy. La descarga quien administra indicadores.
 */
export async function GET(peticion: NextRequest): Promise<Response> {
  const sesion = await sesionDePeticion(peticion);
  if (!sesion) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!puede(sesion, "indicadores.administrar")) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  if (!permitirPlantilla(String(sesion.usuarioId))) {
    return NextResponse.json(
      { error: "Demasiadas peticiones, intente de nuevo en un momento" },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const buffer = await plantillaDeImportacion(await listasDePlantilla());
  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="plantilla-importacion-indicadores.xlsx"',
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
    },
  });
}
