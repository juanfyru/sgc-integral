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

/** Atención pide un análisis; Crítico, o Atención repetida, pide dos partes (causa y acción). Históricos y «no aplica», ninguno. */
export function analisisExigido(m: {
  semaforo: Semaforo | null;
  repetido: boolean;
  historica: boolean;
  noAplica: boolean;
}): "ninguno" | "simple" | "dos_partes" {
  if (m.historica || m.noAplica || m.semaforo === null || m.semaforo === "bien") return "ninguno";
  return m.semaforo === "critico" || m.repetido ? "dos_partes" : "simple";
}

/** `anteriores` va del más reciente al más antiguo, ya sin «no aplica», «sin dato» ni históricos. */
export function esRepetido(anteriores: (Semaforo | null)[], actual: Semaforo | null, n: number): boolean {
  if (actual === null || actual === "bien" || anteriores.length < n - 1) return false;
  return anteriores.slice(0, n - 1).every((s) => s !== null && s !== "bien");
}
