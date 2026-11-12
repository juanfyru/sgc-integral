import { type NextRequest, NextResponse } from "next/server";
import { obtenerSql } from "@/db/cliente";
import { registrarAuditoria } from "@/db/consultas/admin";
import { obtenerMarcaSegura } from "@/db/consultas/entidad";
import { filtroDeConsulta, opcionesDeLista } from "@/db/consultas/indicadores/lista";
import { resultadosDeLaLista } from "@/db/consultas/indicadores/matriz";
import { construirExcelDeResultados, detalleDeFiltros } from "@/lib/indicadores/excel";
import { anioDeConsulta } from "@/lib/indicadores/rutas";
import { crearLimitador } from "@/lib/limite";
import { sesionDePeticion } from "@/lib/sesion-actual";
import { fechaEnZona } from "@/lib/tramites/plazos";
import { fechaHoraLocal, zonaHoraria } from "@/lib/zona-horaria";

export const dynamic = "force-dynamic";

const permitirExcel = crearLimitador({ limite: 10, ventanaMs: 60_000 });

/**
 * El Excel de resultados (spec §13): una fila por indicador que la persona ve y que la lista deja con los filtros de la
 * consulta (los nombres de `filtroDeConsulta`), con los doce meses y el año de `?anio=` (por omisión, el en curso; otro
 * formato o un año que no ha llegado, 404, como la matriz).
 */
export async function GET(peticion: NextRequest): Promise<Response> {
  const sesion = await sesionDePeticion(peticion);
  if (!sesion) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const ahora = new Date();
  const q = peticion.nextUrl.searchParams;
  const anio = anioDeConsulta(q.get("anio"), Number(fechaEnZona(ahora, zonaHoraria()).slice(0, 4)));
  if (anio === null) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  if (!permitirExcel(String(sesion.usuarioId))) {
    return NextResponse.json(
      { error: "Demasiadas peticiones, intente de nuevo en un momento" },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const filtro = filtroDeConsulta(Object.fromEntries([...new Set(q.keys())].map((k) => [k, q.getAll(k)])));
  const [filas, opciones, marca] = await Promise.all([resultadosDeLaLista(sesion, filtro, anio, { ahora }), opcionesDeLista(sesion), obtenerMarcaSegura()]);
  const buffer = await construirExcelDeResultados(filas, anio, {
    hospital: marca.nombre,
    generadoEn: fechaHoraLocal(ahora),
    detalle: `${detalleDeFiltros(anio, filtro, opciones)} — Total: ${filas.length}`,
  });

  await registrarAuditoria(obtenerSql(), {
    usuarioId: sesion.usuarioId,
    accion: "exporto_resultados_indicadores",
    entidad: "indicador",
    entidadId: null,
    detalle: { anio, filtros: filtro },
  });

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="resultados-indicadores-${anio}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
