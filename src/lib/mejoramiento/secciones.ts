/**
 * Qué secciones de una ronda pinta la página del hallazgo (spec 15 §6.3 y §16.2). Puro. Quien ve el hallazgo por una
 * actividad lee también, en texto, «3. Causa raíz» y «4. Plan de acción»; los adjuntos del análisis son solo de quien lo ve
 * completo. Las etapas que faltan no aparecen, salvo las de la ronda en curso mientras se formula.
 */
import { leerCriterios } from "./eficacia";
import type { EstadoHallazgo } from "./tipos";

export function seccionesDeLaRonda(
  h: { ve: "completo" | "actividad"; estado: EstadoHallazgo; ronda: number },
  r: { numero: number; analisis: readonly unknown[]; causas: readonly unknown[]; similares: boolean | null; acciones: readonly unknown[]; criterios: unknown },
): { causaRaiz: boolean; plan: boolean; adjuntos: boolean } {
  const formulandose = r.numero === h.ronda && h.estado === "por_formular";
  const causaRaiz = r.analisis.length > 0 || r.causas.length > 0 || r.similares !== null || formulandose;
  const plan = r.acciones.length > 0 || leerCriterios(r.criterios).length > 0 || formulandose;
  return { causaRaiz, plan, adjuntos: causaRaiz && h.ve === "completo" };
}
