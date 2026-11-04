import { type NextRequest, NextResponse } from "next/server";
import { plantillaCsv } from "@/lib/lote-usuarios";
import { puede } from "@/lib/permisos";
import { sesionDePeticion } from "@/lib/sesion-actual";

export const dynamic = "force-dynamic";

export async function GET(peticion: NextRequest): Promise<Response> {
  const sesion = await sesionDePeticion(peticion);
  if (!sesion) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!puede(sesion, "usuarios.administrar")) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }
  return new Response(plantillaCsv(), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="plantilla-usuarios.csv"',
      "Cache-Control": "no-store",
    },
  });
}
