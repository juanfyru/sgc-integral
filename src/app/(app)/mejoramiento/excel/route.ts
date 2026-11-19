import { type NextRequest, NextResponse } from "next/server";
import { obtenerSql } from "@/db/cliente";
import { registrarAuditoria } from "@/db/consultas/admin";
import { obtenerMarcaSegura } from "@/db/consultas/entidad";
import { filasParaExcel } from "@/db/consultas/mejoramiento/lectura";
import { nombresDelFiltro, procesosDelAlcance } from "@/db/consultas/mejoramiento/opciones";
import { construirExcelDeHallazgos } from "@/lib/mejoramiento/excel";
import { ESTADO_POR_OMISION, filtroDeConsulta, filtrosEnPalabras } from "@/lib/mejoramiento/filtro";
import { crearLimitador } from "@/lib/limite";
import { cuenta } from "@/lib/plural";
import { sesionDePeticion } from "@/lib/sesion-actual";
import { fechaCompactaLocal, fechaHoraLocal } from "@/lib/zona-horaria";

export const dynamic = "force-dynamic";

const permitirExcel = crearLimitador({ limite: 10, ventanaMs: 60_000 });

/**
 * El Excel de la lista de hallazgos (spec 15 §16.3): la matriz del SGC-FO-28 con todo lo que la lista muestra a la persona con los
 * filtros de la consulta (los nombres de `filtroDeConsulta`), sin página (Fase 15B, anexo §11.1), una fila por actividad
 * (`filasParaExcel`, con la regla de `filtroHallazgos`). Quien no ve ningún hallazgo recibe el libro sin filas. Cada descarga queda
 * en la bitácora con sus filtros y el estado que rigió: sin estado en la dirección, los abiertos (una fila sin estado, de antes de la
 * 15B, era de todos).
 */
export async function GET(peticion: NextRequest): Promise<Response> {
  const sesion = await sesionDePeticion(peticion);
  if (!sesion) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!permitirExcel(String(sesion.usuarioId))) {
    return NextResponse.json(
      { error: "Demasiadas peticiones, intente de nuevo en un momento" },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const ahora = new Date();
  const q = peticion.nextUrl.searchParams;
  const filtro = filtroDeConsulta(Object.fromEntries([...new Set(q.keys())].map((k) => [k, q.getAll(k)])));
  const [filas, procesos, marca, nombres] = await Promise.all([
    filasParaExcel(sesion, filtro, { ahora }),
    procesosDelAlcance(sesion),
    obtenerMarcaSegura(),
    nombresDelFiltro(sesion, filtro),
  ]);
  const filtros = filtrosEnPalabras(filtro, procesos, nombres);
  const buffer = await construirExcelDeHallazgos(filas, {
    hospital: marca.nombre,
    generadoEn: fechaHoraLocal(ahora),
    detalle: `${filtros.length > 0 ? filtros.join(" · ") : "Sin filtros"} — Total: ${cuenta(filas.length, "fila", "filas")}`,
  });

  await registrarAuditoria(obtenerSql(), {
    usuarioId: sesion.usuarioId,
    accion: "mejora_exporto_hallazgos",
    entidad: "mejora_hallazgo",
    entidadId: null,
    // Sin la página: el Excel no pagina, la dirección pudo traerla de la lista.
    detalle: { filtros: { ...filtro, pagina: undefined, estado: filtro.estado ?? ESTADO_POR_OMISION } },
  });

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="hallazgos-${fechaCompactaLocal(ahora)}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
