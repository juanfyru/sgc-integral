import { type NextRequest, NextResponse } from "next/server";
import { obtenerSql } from "@/db/cliente";
import { registrarAuditoria } from "@/db/consultas/admin";
import { obtenerMarcaSegura } from "@/db/consultas/entidad";
import { filasDelExcel } from "@/db/consultas/normograma/lectura";
import { listarTiposNorma } from "@/db/consultas/normograma/tipos-norma";
import { procesosActivos } from "@/db/consultas/procesos";
import { crearLimitador } from "@/lib/limite";
import { filtroDeConsulta, filtroDeNormas, textoDelAlcance } from "@/lib/normograma/filtro-normas";
import { construirExcelNormograma } from "@/lib/normograma/normograma-excel";
import { puede } from "@/lib/permisos";
import { sesionDePeticion } from "@/lib/sesion-actual";
import { fechaCompactaLocal, fechaHoraLocal } from "@/lib/zona-horaria";

export const dynamic = "force-dynamic";

const permitirExcel = crearLimitador({ limite: 10, ventanaMs: 60_000 });

/**
 * El normograma en Excel (spec 13C §10.6), con los filtros de la pantalla: el institucional, o con `?proceso=<slug>`
 * el del proceso, con la columna «Requisito». Lo descarga toda sesión (el normograma se lee sin permiso); los
 * documentos enlazados que la persona no ve no se nombran. Un proceso que no existe responde «no encontrado».
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

  const q = peticion.nextUrl.searchParams;
  const filtro = filtroDeNormas(
    {
      tipo: q.get("tipo"),
      anio: q.get("anio"),
      emisor: q.get("emisor"),
      estado: q.get("estado"),
      proceso: q.get("proceso"),
      q: q.get("q"),
      retiradas: q.get("retiradas"),
    },
    puede(sesion, "normograma.administrar"),
  );
  const [procesos, tipos] = await Promise.all([
    filtro.proceso ? procesosActivos() : Promise.resolve([]),
    filtro.tipoNormaId !== undefined ? listarTiposNorma() : Promise.resolve([]),
  ]);
  const proceso = filtro.proceso ? procesos.find((p) => p.slug === filtro.proceso) : undefined;
  if (filtro.proceso && !proceso) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const ahora = new Date();
  const [filas, marca] = await Promise.all([filasDelExcel(filtroDeConsulta(filtro, proceso?.id), sesion), obtenerMarcaSegura()]);
  const alcance = proceso ? `Proceso: ${proceso.nombre}` : "Institucional";
  const buffer = await construirExcelNormograma(filas, {
    hospital: marca.nombre,
    generadoEn: fechaHoraLocal(ahora),
    alcance: textoDelAlcance(filtro, { proceso: proceso?.nombre, tipo: tipos.find((t) => t.id === filtro.tipoNormaId)?.nombre }),
    total: filas.length,
    conRequisito: proceso !== undefined,
  });

  await registrarAuditoria(obtenerSql(), {
    usuarioId: sesion.usuarioId,
    accion: "exporto_normograma",
    entidad: "norma",
    entidadId: null,
    detalle: {
      formato: "excel",
      alcance,
      procesoId: proceso?.id ?? null,
      tipoNormaId: filtro.tipoNormaId ?? null,
      anio: filtro.anio ?? null,
      emisor: filtro.emisor ?? null,
      estado: filtro.estado,
      texto: filtro.q ?? null,
      incluirRetiradas: filtro.incluirRetiradas,
      total: filas.length,
    },
  });

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="normograma-${fechaCompactaLocal(ahora)}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
