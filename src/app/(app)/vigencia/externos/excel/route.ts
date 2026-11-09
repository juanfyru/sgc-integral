import { type NextRequest, NextResponse } from "next/server";
import { obtenerSql } from "@/db/cliente";
import { registrarAuditoria } from "@/db/consultas/admin";
import { obtenerMarcaSegura } from "@/db/consultas/entidad";
import { esResponsableTecnico, listarExternos } from "@/db/consultas/vigencia/externos";
import { crearLimitador } from "@/lib/limite";
import { puede } from "@/lib/permisos";
import { sesionDePeticion } from "@/lib/sesion-actual";
import { construirExcelExternos } from "@/lib/vigencia/externos-excel";
import { filtroDeExternos, textoDelFiltroExternos } from "@/lib/vigencia/filtro-externos";
import { fechaCompactaLocal, fechaHoraLocal, zonaHoraria } from "@/lib/zona-horaria";

export const dynamic = "force-dynamic";

const permitirExcel = crearLimitador({ limite: 10, ventanaMs: 60_000 });

/**
 * La matriz de externos con los filtros de la pantalla (spec 13C §8.6). La descarga quien ve la pestaña: con
 * `vigencia.ver` (sus procesos) o el responsable técnico, que recibe solo los suyos; los demás, «no encontrado».
 */
export async function GET(peticion: NextRequest): Promise<Response> {
  const sesion = await sesionDePeticion(peticion);
  if (!sesion) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!puede(sesion, "vigencia.ver") && !(await esResponsableTecnico(sesion.usuarioId))) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }
  if (!permitirExcel(String(sesion.usuarioId))) {
    return NextResponse.json(
      { error: "Demasiadas peticiones, intente de nuevo en un momento" },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const ahora = new Date();
  const q = peticion.nextUrl.searchParams;
  const filtro = filtroDeExternos({ estado: q.get("estado"), proceso: q.get("proceso"), responsable: q.get("responsable"), q: q.get("q") });
  const [filas, marca] = await Promise.all([listarExternos(sesion, filtro, { ahora }), obtenerMarcaSegura()]);
  // Los nombres salen de las filas que la persona ve: un id ajeno no se nombra.
  const buffer = await construirExcelExternos(filas, {
    hospital: marca.nombre,
    generadoEn: fechaHoraLocal(ahora),
    filtro: textoDelFiltroExternos(filtro, {
      proceso: filas.find((f) => f.proceso.id === filtro.procesoId)?.proceso.nombre,
      responsable: filas.find((f) => f.responsableId === filtro.responsableId)?.responsable,
    }),
    total: filas.length,
    zona: zonaHoraria(),
  });

  await registrarAuditoria(obtenerSql(), {
    usuarioId: sesion.usuarioId,
    accion: "exporto_externos",
    entidad: "documentos",
    entidadId: null,
    detalle: {
      formato: "excel",
      estado: filtro.estado,
      procesoId: filtro.procesoId ?? null,
      responsableId: filtro.responsableId ?? null,
      texto: filtro.q ?? null,
      total: filas.length,
    },
  });

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="externos-${fechaCompactaLocal(ahora)}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
