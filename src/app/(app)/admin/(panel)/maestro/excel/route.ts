import { type NextRequest, NextResponse } from "next/server";
import { obtenerSql } from "@/db/cliente";
import { registrarAuditoria } from "@/db/consultas/admin";
import { obtenerListadoMaestro } from "@/db/consultas/maestro";
import { construirExcelMaestro } from "@/lib/maestro-excel";
import { alcanceMaestro, puede } from "@/lib/permisos";
import { sesionDePeticion } from "@/lib/sesion-actual";
import { fechaCompactaLocal, fechaHoraLocal } from "@/lib/zona-horaria";

export const dynamic = "force-dynamic";

export async function GET(peticion: NextRequest): Promise<Response> {
  const sesion = await sesionDePeticion(peticion);
  if (!sesion) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!puede(sesion, "maestro.exportar")) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const incluir = alcanceMaestro(sesion, peticion.nextUrl.searchParams.get("incluir"));
  const filas = await obtenerListadoMaestro({ incluir });
  const ahora = new Date();
  const buffer = await construirExcelMaestro(filas, {
    hospital: "ESE Hospital Nuestra Señora de Fátima de Suaza",
    generadoEn: fechaHoraLocal(ahora),
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

  const nombre = `listado-maestro-${fechaCompactaLocal(ahora)}.xlsx`;
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
