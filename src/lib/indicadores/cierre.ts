/**
 * Lo puro del cierre del mes (spec 14 §8.7 y §9): el patrón de un mes, los límites de la justificación de una reapertura
 * y los meses que se proponen cerrar. Sin BD: lo importan las consultas, los esquemas, la página y los componentes de
 * cliente.
 */
import { periodoDe } from "@/lib/indicadores-documentales/periodo";
import { cuenta } from "@/lib/plural";
import { zonaHoraria } from "@/lib/zona-horaria";
import { anterior, periodoQueContiene } from "./periodos";

/** Un mes, `AAAA-MM`. */
export const PATRON_MES = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Lo mínimo y lo máximo de la justificación de una reapertura, sin los espacios de los extremos (spec §8.7). */
export const JUSTIFICACION_MINIMA = 10;
export const JUSTIFICACION_MAXIMA = 1000;

/** El mes en curso en la zona (`AAAA-MM`). */
const mesEnCurso = (ahora: Date, zona: string) => periodoQueContiene("mensual", ahora, zona).clave;

/** El mes que sigue a `mes` (`AAAA-MM`). */
const mesSiguiente = (mes: string, zona: string) => periodoQueContiene("mensual", new Date(periodoDe(mes, zona)!.hasta.getTime() + 1), zona).clave;

/**
 * El mes que se propone cerrar (spec §9.1): el siguiente al último cerrado o, sin cierres, el anterior al mes en curso;
 * `null` si ese mes todavía no ha terminado.
 */
export function mesPorOmisionDe(ultimo: string | null, ahora: Date, zona: string): string | null {
  const actual = mesEnCurso(ahora, zona);
  const candidato = ultimo ? mesSiguiente(ultimo, zona) : anterior(actual);
  return candidato < actual ? candidato : null;
}

/** Los meses que tiene sentido cerrar: del de por omisión al último que terminó. */
export function mesesParaCerrar(porOmision: string | null, ahora: Date, zona: string): string[] {
  if (!porOmision || !PATRON_MES.test(porOmision)) return [];
  const actual = mesEnCurso(ahora, zona);
  const salida: string[] = [];
  for (let mes = porOmision; mes < actual; mes = mesSiguiente(mes, zona)) salida.push(mes);
  return salida;
}

/** «Marzo de 2026». */
export function etiquetaDeMes(mes: string): string {
  const etiqueta = periodoDe(mes, zonaHoraria())?.etiqueta ?? mes;
  return etiqueta.charAt(0).toUpperCase() + etiqueta.slice(1);
}

/** ¿`mes` es un mes (`AAAA-MM`) que ya terminó? */
export function esMesTerminado(mes: unknown, ahora: Date): mes is string {
  const periodo = typeof mes === "string" && PATRON_MES.test(mes) ? periodoDe(mes, zonaHoraria()) : null;
  return periodo !== null && periodo.hasta.getTime() < ahora.getTime();
}

/**
 * Las líneas de «No se cierran» (F14-DC3), con concordancia: lo que sigue en plazo y los históricos sin registrar. Un
 * grupo en cero no tiene línea; sin ninguna, la caja no se muestra.
 */
export function frasesDeNoSeCierran(r: { enPlazo: number; historicosSinRegistrar: number }): string[] {
  const frases: string[] = [];
  if (r.enPlazo > 0) {
    frases.push(
      r.enPlazo === 1
        ? "1 medición sigue dentro de su plazo de reporte: queda para el siguiente cierre."
        : `${r.enPlazo} mediciones siguen dentro de su plazo de reporte: quedan para el siguiente cierre.`,
    );
  }
  if (r.historicosSinRegistrar > 0) {
    frases.push(
      r.historicosSinRegistrar === 1
        ? "1 histórico sin registrar sigue abierto hasta que se registre."
        : `${r.historicosSinRegistrar} históricos sin registrar siguen abiertos hasta que se registren.`,
    );
  }
  return frases;
}

/** Lo que va a pasar al confirmar el cierre (spec §9.3), con singular y plural: «Se cerrará 1 medición: 1 reportada, …». */
export function fraseDelCierre(r: { aCerrar: number; reportadas: number; sinDato: number; noAplica: number; sinAnalisis: number }): string {
  if (r.aCerrar === 0) return "No hay mediciones que cerrar: el mes queda cerrado igual y el siguiente cierre empieza después de él.";
  return `Se ${r.aCerrar === 1 ? "cerrará" : "cerrarán"} ${cuenta(r.aCerrar, "medición", "mediciones")}: ${cuenta(r.reportadas, "reportada", "reportadas")}, ${r.sinDato} sin dato, ${r.noAplica} «No aplica» y ${r.sinAnalisis} sin análisis.`;
}
