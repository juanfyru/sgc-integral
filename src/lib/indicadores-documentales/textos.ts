import type { IndicadorMedido } from "@/db/consultas/vigencia/indicadores";
import { SENTIDO } from "./metas";

const numero = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 });

/** «94 %», «24 días», «7»; sin dato si no hay con qué medirlo. Lo comparten las tarjetas y el Excel. */
export function textoValor(i: Pick<IndicadorMedido, "unidad" | "valor">): string {
  if (i.valor === null) return "Sin dato";
  if (i.unidad === "pct") return `${i.valor} %`;
  if (i.unidad === "dias") return `${numero.format(i.valor)} ${i.valor === 1 ? "día" : "días"}`;
  return numero.format(i.valor);
}

/** «≥ 95 %», «≤ 30 días», «0» (la meta de un conteo que no admite ninguno). */
export function textoMeta(i: Pick<IndicadorMedido, "clave" | "unidad" | "meta">): string {
  const signo = SENTIDO[i.clave] === "min" ? "≥" : "≤";
  if (i.unidad === "pct") return `${signo} ${i.meta} %`;
  if (i.unidad === "dias") return `${signo} ${i.meta} ${i.meta === 1 ? "día" : "días"}`;
  return i.meta === 0 ? "0" : `${signo} ${i.meta}`;
}

/** El cumplimiento con texto, nunca solo con color: sin valor no se puede decir si cumple. */
export function textoCumple(cumple: boolean | null): "cumple" | "no cumple" | "sin dato" {
  return cumple === null ? "sin dato" : cumple ? "cumple" : "no cumple";
}

/** La franja de la tarjeta y la insignia: verde si cumple, roja si no, gris sin dato. */
export function estadoDeCumple(cumple: boolean | null): "bien" | "critico" | "sin-dato" {
  return cumple === null ? "sin-dato" : cumple ? "bien" : "critico";
}
