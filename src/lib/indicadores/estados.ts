/**
 * Estados de una medición (spec §8.5), el análisis que se exige y el incumplimiento repetido. Funciones puras.
 * Sin Node ni BD.
 */
import type { EstadoMedicion, Semaforo } from "./tipos";

export type EstadoVisible = "por_reportar" | "falta_dato" | "falta_analisis" | "reportada" | "cerrada";

export const ETIQUETA_ESTADO: Record<EstadoVisible, string> = {
  por_reportar: "Por reportar",
  falta_dato: "Falta un dato",
  falta_analisis: "Falta el análisis",
  reportada: "Reportada",
  cerrada: "Cerrada",
};

/** «Vencida» no es un estado: acompaña al que falte. Un histórico nunca está vencido. */
export function estadoVisible(
  m: { estado: EstadoMedicion; vence: Date; historica: boolean; datosCompletos: boolean; faltaDatoAjeno: boolean; faltaAnalisis: boolean },
  ahora: Date,
): { estado: EstadoVisible; vencida: boolean } {
  if (m.estado === "cerrada") return { estado: "cerrada", vencida: false };
  if (m.estado === "reportada") return { estado: "reportada", vencida: false };
  const vencida = !m.historica && ahora.getTime() > m.vence.getTime();
  if (m.faltaDatoAjeno) return { estado: "falta_dato", vencida };
  if (m.datosCompletos) return { estado: m.faltaAnalisis ? "falta_analisis" : "reportada", vencida: m.faltaAnalisis ? vencida : false };
  return { estado: "por_reportar", vencida };
}

/**
 * Un periodo que no cumple la meta pide un análisis, aunque su color sea Bien (spec 14A §3.1); Crítico, o un
 * incumplimiento repetido, pide dos partes (causa y acción). Históricos, «no aplica» y sin semáforo, ninguno.
 */
export function analisisExigido(m: {
  semaforo: Semaforo | null;
  cumple: boolean | null;
  repetido: boolean;
  historica: boolean;
  noAplica: boolean;
}): AnalisisExigido {
  if (m.historica || m.noAplica || m.semaforo === null || m.cumple !== false) return "ninguno";
  return m.semaforo === "critico" || m.repetido ? "dos_partes" : "simple";
}

/** `anteriores` (si cumplieron) va del más reciente al más antiguo, ya sin «no aplica», «sin dato» ni históricos. */
export function esRepetido(anteriores: (boolean | null)[], actual: boolean | null, n: number): boolean {
  if (actual !== false || anteriores.length < n - 1) return false;
  return anteriores.slice(0, n - 1).every((c) => c === false);
}

/**
 * `cumpleDeFila` sobre una fila de `mediciones` tal como la devuelve la base. Solo un `cumple` nulo (una fila anterior a la
 * 0012) se deriva del semáforo; que la columna falte es un error de la consulta, no una fila vieja.
 */
export function cumpleDeMedicion(m: Record<string, unknown>): boolean | null {
  if (m.cumple === undefined) throw new Error("La consulta de la medición no trae la columna `cumple`");
  return cumpleDeFila({ cumple: m.cumple as boolean | null, semaforo: (m.semaforo as Semaforo | null | undefined) ?? null });
}

/**
 * Si una medición cumplió la meta. Las filas escritas antes de la migración 0012 no tienen `cumple`: para ellas Bien es
 * cumplir (su regla no tenía otra forma de no cumplir en verde).
 */
export function cumpleDeFila(f: { cumple: boolean | null; semaforo: Semaforo | null }): boolean | null {
  return f.cumple ?? (f.semaforo === null ? null : f.semaforo === "bien");
}

/** Lo mínimo que lleva cada parte exigida del análisis (spec §8.4), sin contar los espacios de los extremos. */
export const MINIMO_ANALISIS = 10;

/** Lo que se exige del análisis de una medición (spec §8.4). */
export type AnalisisExigido = "ninguno" | "simple" | "dos_partes";

/**
 * ¿La medición tiene el análisis que se le exige (spec §8.4)? El simple lo satisface el análisis o la causa con la acción
 * propuesta; las dos partes, solo la causa y la acción propuesta. Cada parte exigida lleva al menos `MINIMO_ANALISIS`
 * caracteres: es la única regla, y la usan el estado guardado, la tabla del año y `analizar`.
 */
export function analisisCompleto(
  exigido: AnalisisExigido,
  a: { analisis: string | null; causa: string | null; accionPropuesta: string | null },
): boolean {
  const lleno = (t: string | null) => t !== null && t.trim().length >= MINIMO_ANALISIS;
  const dosPartes = lleno(a.causa) && lleno(a.accionPropuesta);
  if (exigido === "ninguno") return true;
  return exigido === "simple" ? dosPartes || lleno(a.analisis) : dosPartes;
}
