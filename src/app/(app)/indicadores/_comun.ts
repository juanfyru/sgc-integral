import { notFound } from "next/navigation";
import { indicadorPorCodigo } from "@/db/consultas/indicadores/fichas";
import { puedeVerIndicador } from "@/lib/alcance";
import { LARGO_CODIGO_INDICADOR, PATRON_CODIGO_INDICADOR } from "@/lib/esquemas/indicadores";
import type { EstadoIndicador } from "@/lib/indicadores/tipos";
import type { SesionValida } from "@/lib/sesion";

/**
 * El indicador del segmento `[codigo]`, sin distinguir mayúsculas. Quien no lo ve recibe «no encontrado», nunca «sin
 * permiso» (spec §6.4, F13C-DC39): un borrador o un restringido ajeno no existen para él.
 */
export async function exigirIndicador(sesion: SesionValida, codigo: string): Promise<{ id: number; codigo: string; estado: EstadoIndicador }> {
  if (codigo.length > LARGO_CODIGO_INDICADOR || !PATRON_CODIGO_INDICADOR.test(codigo)) notFound();
  const indicador = await indicadorPorCodigo(codigo);
  if (!indicador || !(await puedeVerIndicador(indicador.id, sesion))) notFound();
  return indicador;
}

/** La página de edición de la ficha de un indicador. */
export const rutaDeEdicion = (codigo: string) => `/indicadores/${encodeURIComponent(codigo)}/editar`;
