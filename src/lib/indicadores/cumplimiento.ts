/**
 * El porcentaje de cumplimiento de un resultado frente a su meta (anexo 14C): un número de 0 a 100 en fracción exacta.
 * Sin Node ni BD.
 */
import { CERO, CIEN, comparar, dividir, multiplicar, type Fraccion } from "./formula/fraccion";
import type { Tendencia } from "./tipos";

export function porcentajeDeCumplimiento(d: { resultado: Fraccion; cumple: boolean | null; meta: Fraccion | null; tendencia: Tendencia }): Fraccion | null {
  if (d.cumple === null) return null;
  if (d.cumple) return CIEN;
  if (d.meta === null || d.tendencia === "constante") return CERO;
  if (comparar(d.meta, CERO) <= 0) return CERO;
  let razon: Fraccion | null;
  if (d.tendencia === "ascendente") {
    if (comparar(d.resultado, CERO) < 0) return CERO;
    razon = dividir(d.resultado, d.meta);
  } else {
    razon = dividir(d.meta, d.resultado);
  }
  if (razon === null || comparar(razon, CERO) < 0) return CERO;
  const porciento = multiplicar(razon, CIEN);
  return comparar(porciento, CIEN) > 0 ? CIEN : porciento;
}
