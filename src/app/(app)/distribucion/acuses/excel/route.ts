import { type NextRequest, NextResponse } from "next/server";
import { obtenerSql } from "@/db/cliente";
import { registrarAuditoria } from "@/db/consultas/admin";
import { resumenAcuses } from "@/db/consultas/distribucion/acuses";
import { obtenerMarcaSegura } from "@/db/consultas/entidad";
import { construirExcelAcuses } from "@/lib/distribucion/acuses-excel";
import { periodoDeAcuses } from "@/lib/distribucion/periodo-acuses";
import { puede } from "@/lib/permisos";
import { sesionDePeticion } from "@/lib/sesion-actual";
import { fechaCompactaLocal, fechaHoraLocal } from "@/lib/zona-horaria";

export const dynamic = "force-dynamic";

export async function GET(peticion: NextRequest): Promise<Response> {
  const sesion = await sesionDePeticion(peticion);
  if (!sesion) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!puede(sesion, "distribucion.ver")) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });

  const q = peticion.nextUrl.searchParams;
  const ahora = new Date();
  const periodo = periodoDeAcuses({ desde: q.get("desde"), hasta: q.get("hasta"), proceso: q.get("proceso") }, ahora);
  const [{ versiones }, marca] = await Promise.all([
    resumenAcuses(sesion, { desde: periodo.desde, hasta: periodo.hasta, procesoId: periodo.procesoId }),
    obtenerMarcaSegura(),
  ]);
  const buffer = await construirExcelAcuses(versiones, {
    hospital: marca.nombre,
    generadoEn: fechaHoraLocal(ahora),
    periodo: `${periodo.desdeTexto} a ${periodo.hastaTexto}`,
    total: versiones.length,
  });

  await registrarAuditoria(obtenerSql(), {
    usuarioId: sesion.usuarioId,
    accion: "exporto_acuses",
    entidad: "acuses",
    entidadId: null,
    detalle: { formato: "excel", desde: periodo.desdeTexto, hasta: periodo.hastaTexto, procesoId: periodo.procesoId ?? null, total: versiones.length },
  });

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="acuses-${fechaCompactaLocal(ahora)}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
