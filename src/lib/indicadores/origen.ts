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

/** `alguienMide` para quien solo leyó las letras propias de la versión (las tareas y los cálculos, por SQL). */
export const alguienMideCon = (origenDato: OrigenDato, propias: readonly string[]): boolean =>
  alguienMide({ origenDato, variables: propias.map((letra) => ({ letra, origen: "propia" as const })) });

/**
 * ¿La medición está en «Falta un dato»? Espera un valor que no digita quien la mide, y entonces no es tarea de nadie ni
 * vence: en un automático, su foto mientras no está reportada (anexo 14B, §4); en una ficha manual, un valor ajeno con lo
 * propio ya reportado o, si nadie la mide, lo que sea (anexo 14C, §3.1: `faltaSegunOrigen`). Un «No aplica» no espera
 * nada, ni un histórico de una ficha manual, que se registra completo (§3.6). `faltanAjenas` es falso si la versión no
 * tiene variables ajenas. Es la única regla: la usan la lectura, la lista, las tareas y el cierre.
 */
export function esperaUnDato(d: {
  origenDato: OrigenDato;
  mide: boolean;
  noAplica: boolean;
  historica: boolean;
  reportada: boolean;
  faltanAjenas: boolean;
}): boolean {
  if (d.noAplica) return false;
  if (d.origenDato === "automatico") return !d.reportada;
  if (d.historica) return false;
  return faltaSegunOrigen({ mide: d.mide, reportada: d.reportada, faltanAjenas: d.faltanAjenas, analisisCompleto: true }) === "dato";
}

/** Qué le falta a una medición: su reporte, un dato ajeno o el análisis. */
export function faltaSegunOrigen(d: { mide: boolean; reportada: boolean; faltanAjenas: boolean; analisisCompleto: boolean }): "reporte" | "dato" | "analisis" {
  if (d.mide && !d.reportada) return "reporte";
  if (d.faltanAjenas || !d.reportada) return "dato";
  if (!d.analisisCompleto) return "analisis";
  return "reporte";
}
