import { type NextRequest, NextResponse } from "next/server";
import { obtenerSql } from "@/db/cliente";
import { registrarAuditoria } from "@/db/consultas/admin";
import { listarJornadasParaExcel } from "@/db/consultas/distribucion/jornadas";
import { obtenerMarcaSegura } from "@/db/consultas/entidad";
import { periodoDeAcuses } from "@/lib/distribucion/periodo-acuses";
import { construirExcelSocializaciones } from "@/lib/distribucion/socializaciones-excel";
import { crearLimitador } from "@/lib/limite";
import { puede } from "@/lib/permisos";
import { sesionDePeticion } from "@/lib/sesion-actual";
import { fechaCompactaLocal, fechaHoraLocal } from "@/lib/zona-horaria";

export const dynamic = "force-dynamic";

const permitirExcel = crearLimitador({ limite: 10, ventanaMs: 60_000 });

/** Las jornadas del periodo y el proceso de la pantalla (`?desde=`, `?hasta=`, `?proceso=`) que la persona ve. */
export async function GET(peticion: NextRequest): Promise<Response> {
  const sesion = await sesionDePeticion(peticion);
  if (!sesion) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!puede(sesion, "distribucion.ver")) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  if (!permitirExcel(String(sesion.usuarioId))) {
    return NextResponse.json(
      { error: "Demasiadas peticiones, intente de nuevo en un momento" },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const q = peticion.nextUrl.searchParams;
  const ahora = new Date();
  const periodo = periodoDeAcuses({ desde: q.get("desde"), hasta: q.get("hasta"), proceso: q.get("proceso") }, ahora);
  const [jornadas, marca] = await Promise.all([
    listarJornadasParaExcel(sesion, { desde: periodo.desde, hasta: periodo.hasta, procesoId: periodo.procesoId }),
    obtenerMarcaSegura(),
  ]);
  const buffer = await construirExcelSocializaciones(jornadas, {
    hospital: marca.nombre,
    generadoEn: fechaHoraLocal(ahora),
    periodo: `${periodo.desdeTexto} a ${periodo.hastaTexto}`,
    total: jornadas.length,
  });

  await registrarAuditoria(obtenerSql(), {
    usuarioId: sesion.usuarioId,
    accion: "exporto_socializaciones",
    entidad: "socializaciones",
    entidadId: null,
    detalle: {
      formato: "excel",
      desde: periodo.desdeTexto,
      hasta: periodo.hastaTexto,
      procesoId: periodo.procesoId ?? null,
      total: jornadas.length,
    },
  });

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="socializaciones-${fechaCompactaLocal(ahora)}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
