/**
 * De dónde sale cada variable de una ficha y qué falta según eso (anexo 14C). Reglas puras, sin Node ni BD.
 */
import type { OrigenDato, OrigenVariable } from "./tipos";

export type VariableConOrigen = { letra: string; origen: OrigenVariable };

/** Las letras que digita quien mide este indicador. */
export const letrasPropias = (vs: readonly VariableConOrigen[]): string[] => vs.filter((v) => v.origen === "propia").map((v) => v.letra);

/** ¿Ese origen es ajeno, de otro lado (un dato compartido o un indicador)? Acepta lo que traiga una fila de la base. */
export const esAjena = (origen: unknown): boolean => origen === "compartida" || origen === "indicador";

/** Las letras que llegan de otro lado: un dato compartido o un indicador. */
export const letrasAjenas = (vs: readonly VariableConOrigen[]): string[] => vs.filter((v) => esAjena(v.origen)).map((v) => v.letra);

/** ¿Alguien digita algo en este indicador? Una ficha manual con alguna variable propia. */
export function alguienMide(v: { origenDato: OrigenDato; variables: readonly VariableConOrigen[] }): boolean {
  return v.origenDato === "manual" && letrasPropias(v.variables).length > 0;
}

/** Qué le falta a una medición: su reporte, un dato ajeno o el análisis. */
export function faltaSegunOrigen(d: { mide: boolean; reportada: boolean; faltanAjenas: boolean; analisisCompleto: boolean }): "reporte" | "dato" | "analisis" {
  if (d.mide && !d.reportada) return "reporte";
  if (d.faltanAjenas || !d.reportada) return "dato";
  if (!d.analisisCompleto) return "analisis";
  return "reporte";
}
