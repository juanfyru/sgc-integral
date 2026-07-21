import { type NextRequest, NextResponse } from "next/server";
import { obtenerSql } from "@/db/cliente";
import { registrarAuditoria } from "@/db/consultas/admin";
import { obtenerListadoMaestro } from "@/db/consultas/maestro";
import { construirExcelMaestro } from "@/lib/maestro-excel";
import { requerirSesion } from "@/lib/sesion-actual";

export const dynamic = "force-dynamic";

function formatoFecha(d: Date): string {
  return d.toISOString().slice(0, 16).replace("T", " ");
}

export async function GET(peticion: NextRequest): Promise<Response> {
  let sesion;
  try {
    sesion = await requerirSesion();
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const incluir =
    peticion.nextUrl.searchParams.get("incluir") === "todos" ? "todos" : "vigentes";
  const filas = await obtenerListadoMaestro({ incluir });
  const ahora = new Date();
  const buffer = await construirExcelMaestro(filas, {
    hospital: "ESE Hospital Nuestra Señora de Fátima de Suaza",
    generadoEn: formatoFecha(ahora),
    alcance: incluir === "todos" ? "Todos los documentos" : "Documentos vigentes",
    total: filas.length,
  });

  await registrarAuditoria(obtenerSql(), {
    usuarioId: sesion.usuarioId,
    accion: "exporto_maestro",
    entidad: "listado_maestro",
    entidadId: null,
    detalle: { formato: "excel", incluir, total: filas.length },
  });

  const nombre = `listado-maestro-${ahora.toISOString().slice(0, 10).replace(/-/g, "")}.xlsx`;
  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombre}"`,
      "Cache-Control": "no-store",
    },
  });
}
