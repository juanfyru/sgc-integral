import { type NextRequest, NextResponse } from "next/server";
import { obtenerSql } from "@/db/cliente";
import { registrarAuditoria } from "@/db/consultas/admin";
import { filasDePlanDeAccion } from "@/db/consultas/mejoramiento/filas-de-plan";
import { construirExcelDelEnte } from "@/lib/mejoramiento/excel-ente";
import { NO_CUENTAN_PARA_PLAN } from "@/lib/mejoramiento/planes";
import { crearLimitador } from "@/lib/limite";
import { puede } from "@/lib/permisos";
import { sesionDePeticion } from "@/lib/sesion-actual";
import { fechaCompactaLocal } from "@/lib/zona-horaria";

export const dynamic = "force-dynamic";

const permitirExcel = crearLimitador({ limite: 10, ventanaMs: 60_000 });

const NO_ENCONTRADO = () => NextResponse.json({ error: "No encontrado" }, { status: 404 });

/**
 * El Excel para el ente de un plan de mejoramiento (anexo 15B §4): lo exporta quien ve todo (`mejora.ver_todo`); quien no, y un
 * plan que no existe, reciben el mismo 404. Trae los hallazgos del plan que cuentan, una fila por actividad.
 */
export async function GET(peticion: NextRequest, contexto: { params: Promise<{ id: string }> }): Promise<Response> {
  const sesion = await sesionDePeticion(peticion);
  if (!sesion) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { id } = await contexto.params;
  if (!puede(sesion, "mejora.ver_todo") || !/^\d{1,15}$/.test(id)) return NO_ENCONTRADO();
  if (!permitirExcel(String(sesion.usuarioId))) {
    return NextResponse.json(
      { error: "Demasiadas peticiones, intente de nuevo en un momento" },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const sql = obtenerSql();
  const [plan] = await sql`SELECT id, codigo, nombre, vigencia FROM mejora_planes WHERE id = ${Number(id)}`;
  if (!plan) return NO_ENCONTRADO();

  const ahora = new Date();
  const hallazgos = await sql`SELECT h.id FROM mejora_clasificacion cl JOIN mejora_hallazgos h ON h.id = cl.hallazgo_id
    WHERE cl.plan_id = ${plan.id} AND h.estado <> ALL(${sql.array([...NO_CUENTAN_PARA_PLAN])}::text[])`;
  const filas = await filasDePlanDeAccion(sql, hallazgos.map((h) => Number(h.id)), ahora);
  const buffer = await construirExcelDelEnte({ nombre: plan.nombre as string, vigencia: Number(plan.vigencia) }, filas);

  await registrarAuditoria(sql, {
    usuarioId: sesion.usuarioId,
    accion: "mejora_exporto_plan_ente",
    entidad: "mejora_plan",
    entidadId: Number(plan.id),
    detalle: { codigo: plan.codigo, hallazgos: hallazgos.length },
  });

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${plan.codigo}-seguimiento-${fechaCompactaLocal(ahora)}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
