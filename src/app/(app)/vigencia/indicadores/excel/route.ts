import { type NextRequest, NextResponse } from "next/server";
import { obtenerSql } from "@/db/cliente";
import { registrarAuditoria } from "@/db/consultas/admin";
import { obtenerMarcaSegura } from "@/db/consultas/entidad";
import { indicadoresDocumentales } from "@/db/consultas/vigencia/indicadores";
import { procesosDelSemaforo } from "@/db/consultas/vigencia/semaforo";
import { crearLimitador } from "@/lib/limite";
import { puede } from "@/lib/permisos";
import { sesionDePeticion } from "@/lib/sesion-actual";
import { construirExcelIndicadores } from "@/lib/vigencia/indicadores-excel";
import { filtroDeConsulta } from "@/lib/vigencia/filtro-semaforo";
import { fechaCompactaLocal, fechaHoraLocal, zonaHoraria } from "@/lib/zona-horaria";

export const dynamic = "force-dynamic";

const permitirExcel = crearLimitador({ limite: 10, ventanaMs: 60_000 });

/**
 * Los indicadores con el periodo y el proceso de la pantalla (`?periodo=`, `?proceso=`). Quien no tiene la pestaña, o
 * pide un proceso fuera de su alcance, recibe «no encontrado» (spec 13C §6.4).
 */
export async function GET(peticion: NextRequest): Promise<Response> {
  const sesion = await sesionDePeticion(peticion);
  if (!sesion) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!puede(sesion, "documentos.indicadores")) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  if (!permitirExcel(String(sesion.usuarioId))) {
    return NextResponse.json(
      { error: "Demasiadas peticiones, intente de nuevo en un momento" },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const ahora = new Date();
  const q = peticion.nextUrl.searchParams;
  const { procesoId } = filtroDeConsulta({ proceso: q.get("proceso") });
  const [r, marca, procesos] = await Promise.all([
    indicadoresDocumentales(sesion, { periodo: q.get("periodo") ?? "", procesoId }, { ahora }),
    obtenerMarcaSegura(),
    procesoId === undefined ? Promise.resolve([]) : procesosDelSemaforo(sesion),
  ]);
  if (!r) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  // El nombre sale del catálogo de la persona: un proceso sin documentos también dice cuál se pidió.
  const proceso = r.procesoId === null ? "todos" : (procesos.find((p) => p.id === r.procesoId)?.nombre ?? "no disponible");
  const buffer = await construirExcelIndicadores(r, { hospital: marca.nombre, generadoEn: fechaHoraLocal(ahora), proceso, zona: zonaHoraria() });

  await registrarAuditoria(obtenerSql(), {
    usuarioId: sesion.usuarioId,
    accion: "exporto_indicadores",
    entidad: "documentos",
    entidadId: null,
    detalle: { formato: "excel", periodo: r.periodo.clave, procesoId: r.procesoId },
  });

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="indicadores-${fechaCompactaLocal(ahora)}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
