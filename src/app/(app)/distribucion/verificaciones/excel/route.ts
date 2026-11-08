import { type NextRequest, NextResponse } from "next/server";
import { obtenerSql } from "@/db/cliente";
import { registrarAuditoria } from "@/db/consultas/admin";
import { historialVerificaciones } from "@/db/consultas/distribucion/verificaciones-resumen";
import { obtenerMarcaSegura } from "@/db/consultas/entidad";
import { filtroDeVerificaciones } from "@/lib/distribucion/filtro-verificaciones";
import { construirExcelVerificaciones } from "@/lib/distribucion/verificaciones-excel";
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
  const { filtro, desdeTexto, hastaTexto } = filtroDeVerificaciones(
    { punto: q.get("punto"), desde: q.get("desde"), hasta: q.get("hasta"), resultado: q.get("resultado") },
    ahora,
  );
  const [{ filas }, marca] = await Promise.all([historialVerificaciones(sesion, filtro), obtenerMarcaSegura()]);
  const buffer = await construirExcelVerificaciones(filas, {
    hospital: marca.nombre,
    generadoEn: fechaHoraLocal(ahora),
    periodo: `${desdeTexto} a ${hastaTexto}`,
    total: filas.length,
  });

  await registrarAuditoria(obtenerSql(), {
    usuarioId: sesion.usuarioId,
    accion: "exporto_verificaciones",
    entidad: "verificaciones",
    entidadId: null,
    detalle: {
      formato: "excel",
      desde: desdeTexto,
      hasta: hastaTexto,
      puntoId: filtro.puntoId ?? null,
      resultado: filtro.resultado ?? null,
      total: filas.length,
    },
  });

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="verificaciones-${fechaCompactaLocal(ahora)}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
