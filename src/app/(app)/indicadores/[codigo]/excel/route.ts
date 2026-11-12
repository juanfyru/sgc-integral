import { type NextRequest, NextResponse } from "next/server";
import { obtenerSql } from "@/db/cliente";
import { registrarAuditoria } from "@/db/consultas/admin";
import { obtenerMarcaSegura } from "@/db/consultas/entidad";
import { indicadorPorCodigo } from "@/db/consultas/indicadores/fichas";
import { impresionDelAnio } from "@/db/consultas/indicadores/impresion";
import { puedeVerIndicador } from "@/lib/alcance";
import { LARGO_CODIGO_INDICADOR, PATRON_CODIGO_INDICADOR } from "@/lib/esquemas/indicadores";
import { construirExcelDeIndicador } from "@/lib/indicadores/excel";
import { anioDeConsulta } from "@/lib/indicadores/rutas";
import { crearLimitador } from "@/lib/limite";
import { sesionDePeticion } from "@/lib/sesion-actual";
import { fechaEnZona } from "@/lib/tramites/plazos";
import { fechaHoraLocal, zonaHoraria } from "@/lib/zona-horaria";

export const dynamic = "force-dynamic";

const permitirExcel = crearLimitador({ limite: 10, ventanaMs: 60_000 });

const noEncontrado = () => NextResponse.json({ error: "No encontrado" }, { status: 404 });

/**
 * El Excel de un indicador (spec §13): la hoja «Ficha» y la hoja «Resultados <año>» del año de `?anio=` (por omisión, el
 * en curso). Lo descarga quien ve el indicador; para los demás, y para un año que no se puede pedir, no existe (404).
 */
export async function GET(peticion: NextRequest, { params }: { params: Promise<{ codigo: string }> }): Promise<Response> {
  const sesion = await sesionDePeticion(peticion);
  if (!sesion) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { codigo } = await params;
  const ahora = new Date();
  const anio = anioDeConsulta(peticion.nextUrl.searchParams.get("anio"), Number(fechaEnZona(ahora, zonaHoraria()).slice(0, 4)));
  if (anio === null || codigo.length > LARGO_CODIGO_INDICADOR || !PATRON_CODIGO_INDICADOR.test(codigo)) return noEncontrado();
  const indicador = await indicadorPorCodigo(codigo);
  if (!indicador || !(await puedeVerIndicador(indicador.id, sesion))) return noEncontrado();
  if (!permitirExcel(String(sesion.usuarioId))) {
    return NextResponse.json(
      { error: "Demasiadas peticiones, intente de nuevo en un momento" },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const [d, marca] = await Promise.all([impresionDelAnio(sesion, indicador.codigo, anio, { ahora }), obtenerMarcaSegura()]);
  if (!d) return noEncontrado();
  const nombre = d.ficha.contenido.nombre ?? d.codigo;
  const buffer = await construirExcelDeIndicador(d, {
    hospital: marca.nombre,
    generadoEn: fechaHoraLocal(ahora),
    detalle: `${d.codigo} · ${nombre} · Año ${anio} · Ficha versión ${d.ficha.numero}`,
  });

  await registrarAuditoria(obtenerSql(), {
    usuarioId: sesion.usuarioId,
    accion: "exporto_ficha_indicador",
    entidad: "indicador",
    entidadId: d.indicadorId,
    detalle: { codigo: d.codigo, anio },
  });

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${d.codigo.replace(/[^A-Za-z0-9-]/g, "")}-${anio}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
