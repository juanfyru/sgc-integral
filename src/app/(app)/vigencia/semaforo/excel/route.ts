import { type NextRequest, NextResponse } from "next/server";
import { obtenerSql } from "@/db/cliente";
import { registrarAuditoria } from "@/db/consultas/admin";
import { obtenerMarcaSegura } from "@/db/consultas/entidad";
import { listarSemaforo, procesosDelSemaforo } from "@/db/consultas/vigencia/semaforo";
import { crearLimitador } from "@/lib/limite";
import { puede } from "@/lib/permisos";
import { sesionDePeticion } from "@/lib/sesion-actual";
import { construirExcelSemaforo } from "@/lib/vigencia/semaforo-excel";
import { filtroDeConsulta, textoDelFiltro } from "@/lib/vigencia/filtro-semaforo";
import { fechaCompactaLocal, fechaHoraLocal, zonaHoraria } from "@/lib/zona-horaria";

export const dynamic = "force-dynamic";

const permitirExcel = crearLimitador({ limite: 10, ventanaMs: 60_000 });

/** El semáforo con los filtros de la pantalla. Quien no ve la pestaña recibe «no encontrado» (spec 13C §6.4). */
export async function GET(peticion: NextRequest): Promise<Response> {
  const sesion = await sesionDePeticion(peticion);
  if (!sesion) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!puede(sesion, "vigencia.ver")) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  if (!permitirExcel(String(sesion.usuarioId))) {
    return NextResponse.json(
      { error: "Demasiadas peticiones, intente de nuevo en un momento" },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const ahora = new Date();
  const q = peticion.nextUrl.searchParams;
  const filtro = filtroDeConsulta({ estado: q.get("estado"), proceso: q.get("proceso"), origen: q.get("origen") });
  const sql = obtenerSql();
  const [filas, marca, procesos] = await Promise.all([
    listarSemaforo(sesion, filtro, { ahora }),
    obtenerMarcaSegura(),
    filtro.procesoId === undefined ? Promise.resolve([]) : procesosDelSemaforo(sesion),
  ]);
  // El nombre sale del catálogo, no de las filas: un filtro sin filas también dice qué proceso se pidió.
  const nombreProceso = procesos.find((p) => p.id === filtro.procesoId)?.nombre;
  const buffer = await construirExcelSemaforo(filas, {
    hospital: marca.nombre,
    generadoEn: fechaHoraLocal(ahora),
    filtro: textoDelFiltro(filtro, nombreProceso),
    total: filas.length,
    zona: zonaHoraria(),
  });

  await registrarAuditoria(sql, {
    usuarioId: sesion.usuarioId,
    accion: "exporto_semaforo",
    entidad: "documentos",
    entidadId: null,
    detalle: { formato: "excel", estado: filtro.estado, procesoId: filtro.procesoId ?? null, origen: filtro.origen, total: filas.length },
  });

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="semaforo-${fechaCompactaLocal(ahora)}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
