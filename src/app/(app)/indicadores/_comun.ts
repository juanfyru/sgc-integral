import { notFound } from "next/navigation";
import { versionesVisibles, type VersionVisible } from "@/db/consultas/indicadores/aprobacion";
import { indicadorPorCodigo } from "@/db/consultas/indicadores/fichas";
import { puedeVerIndicador } from "@/lib/alcance";
import { LARGO_CODIGO_INDICADOR, PATRON_CODIGO_INDICADOR } from "@/lib/esquemas/indicadores";
import type { EstadoIndicador } from "@/lib/indicadores/tipos";
import type { SesionValida } from "@/lib/sesion";

type IndicadorDePagina = { id: number; codigo: string; estado: EstadoIndicador };

/**
 * El indicador del segmento `[codigo]`, sin distinguir mayúsculas. Quien no lo ve recibe «no encontrado», nunca «sin
 * permiso» (spec §6.4, F13C-DC39): un borrador o un restringido ajeno no existen para él.
 */
export async function exigirIndicador(sesion: SesionValida, codigo: string): Promise<IndicadorDePagina> {
  if (codigo.length > LARGO_CODIGO_INDICADOR || !PATRON_CODIGO_INDICADOR.test(codigo)) notFound();
  const indicador = await indicadorPorCodigo(codigo);
  if (!indicador || !(await puedeVerIndicador(indicador.id, sesion))) notFound();
  return indicador;
}

/**
 * La regla de `exigirIndicador` para la página del indicador, más la de spec §6.4: quien debe aprobar la ficha por
 * aprobar la abre aunque el indicador todavía no exista para él (`ve` falso: solo esa versión). Para los demás, «no
 * encontrado».
 */
export async function exigirFichaDeIndicador(
  sesion: SesionValida,
  codigo: string,
): Promise<{ indicador: IndicadorDePagina; ve: boolean; versiones: VersionVisible[] }> {
  if (codigo.length > LARGO_CODIGO_INDICADOR || !PATRON_CODIGO_INDICADOR.test(codigo)) notFound();
  const indicador = await indicadorPorCodigo(codigo);
  if (!indicador) notFound();
  const { ve, versiones } = await versionesVisibles(sesion, indicador.id);
  if (!ve && versiones.length === 0) notFound();
  return { indicador, ve, versiones };
}

/** La página de un indicador. */
export const rutaDeIndicador = (codigo: string) => `/indicadores/${encodeURIComponent(codigo)}`;

/** La página de edición de la ficha de un indicador. */
export const rutaDeEdicion = (codigo: string) => `/indicadores/${encodeURIComponent(codigo)}/editar`;
