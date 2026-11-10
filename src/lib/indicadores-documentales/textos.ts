import { SENTIDO, cumple, type Indicador, type IndicadorMedido } from "./metas";

const numero = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 });

/** «Segundo semestre de 2026», «Cumple»: la primera letra en mayúscula. */
export function mayuscula(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** «1 día», «21,5 días». */
export function textoDias(n: number): string {
  return `${numero.format(n)} ${n === 1 ? "día" : "días"}`;
}

/**
 * La cifra de un porcentaje: el entero, salvo cuando el redondeo alcanzaría la meta y la razón exacta no (el único
 * desacuerdo posible, porque las metas son enteras). Entonces va con un decimal truncado hacia el lado que no cumple,
 * para que la cifra no contradiga el veredicto: 18 de 19 frente a «≥ 95 %» es «94,7 %», nunca «95 %» ni «95,0 %».
 */
export function textoPorcentaje(
  clave: Indicador,
  m: { valor: number | null; numerador: number; denominador: number; cumple: boolean | null },
  meta: number,
): string {
  if (m.valor === null) return "Sin dato";
  if (cumple(clave, m.valor, meta) === m.cumple) return `${m.valor} %`;
  const decimas = (m.numerador * 1000) / m.denominador;
  return `${numero.format((SENTIDO[clave] === "min" ? Math.floor(decimas) : Math.ceil(decimas)) / 10)} %`;
}

/** «94 %», «24 días», «7»; sin dato si no hay con qué medirlo. Lo comparten las tarjetas y el Excel. */
export function textoValor(i: IndicadorMedido): string {
  if (i.valor === null) return "Sin dato";
  if (i.unidad === "pct") return textoPorcentaje(i.clave, i, i.meta);
  if (i.unidad === "dias") return textoDias(i.valor);
  return numero.format(i.valor);
}

/** «≥ 95 %», «≤ 30 días», «0» (la meta de un conteo que no admite ninguno). */
export function textoMeta(i: Pick<IndicadorMedido, "clave" | "unidad" | "meta">): string {
  const signo = SENTIDO[i.clave] === "min" ? "≥" : "≤";
  if (i.unidad === "pct") return `${signo} ${i.meta} %`;
  if (i.unidad === "dias") return `${signo} ${textoDias(i.meta)}`;
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
