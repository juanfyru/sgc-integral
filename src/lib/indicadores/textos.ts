/**
 * Textos de un resultado: cifra, meta, frase y comparación (spec §7.5 y §8.3). Funciones puras que usan el servidor
 * y los formularios del cliente. Sin Node ni BD.
 */
import { aDecimal, comparar, CERO, fraccion, restar, esNegativa, type Fraccion } from "./formula/fraccion";
import { periodicidadDe } from "./periodos";
import { cumpleMeta, numeroEs, numeroExacto, semaforoDe, type Regla } from "./semaforo";
import type { Semaforo, Tendencia } from "./tipos";

/** El sufijo lleva su espacio inicial cuando lo necesita (« %», « min»). */
export type Unidad = { sufijo: string; decimales: number };

const MAX_DECIMALES = 10;

/**
 * La cifra tal como se muestra: con los decimales de la unidad, sin ceros de relleno y con coma. Con `regla`, nunca
 * contradice el veredicto: si el redondeo cae en otro nivel del semáforo, o del otro lado de la meta (cumple o no), que
 * el valor exacto, se muestra truncado y, si aun así contradice, con los decimales que hagan falta (hasta 10).
 */
export function textoValor(v: Fraccion, u: Unidad, regla?: Regla): string {
  const redondeado = numeroEs(v, u.decimales, "redondear");
  const nivel = regla === undefined ? null : semaforoDe(v, regla);
  if (regla === undefined || nivel === null) return `${redondeado}${u.sufijo}`;
  const cumple = cumpleMeta(v, regla);
  const coincide = (decimal: string) => {
    const p = fraccion(decimal);
    return p === null || (semaforoDe(p, regla) === nivel && cumpleMeta(p, regla) === cumple);
  };
  if (coincide(aDecimal(v, u.decimales, "redondear"))) return `${redondeado}${u.sufijo}`;
  for (let k = u.decimales; k <= MAX_DECIMALES; k++) {
    if (coincide(aDecimal(v, k, "truncar")) || k === MAX_DECIMALES) return `${numeroEs(v, k, "truncar")}${u.sufijo}`;
  }
  return `${redondeado}${u.sufijo}`;
}

/** La meta sin el verbo: «90 %», «máximo 30 min», «98 a 100 %». `null` sin meta. */
function metaEnPalabras(r: Regla, u: Unidad): string | null {
  if (r.meta === null) return null;
  const n = (a: Fraccion) => numeroExacto(a, u.decimales);
  if (r.tendencia === "constante") {
    return r.metaMax === null || comparar(r.metaMax, r.meta) === 0 ? `${n(r.meta)}${u.sufijo}` : `${n(r.meta)} a ${n(r.metaMax)}${u.sufijo}`;
  }
  return `${r.tendencia === "descendente" ? "máximo " : ""}${n(r.meta)}${u.sufijo}`;
}

/** La meta en pocas palabras: «≥ 90 %», «≤ 30 min», «98 a 100 %», «sin meta». */
export function textoMeta(r: Regla, u: Unidad): string {
  if (r.meta === null) return "sin meta";
  const n = (a: Fraccion) => numeroExacto(a, u.decimales);
  if (r.tendencia === "ascendente") return `≥ ${n(r.meta)}${u.sufijo}`;
  if (r.tendencia === "descendente") return `≤ ${n(r.meta)}${u.sufijo}`;
  return metaEnPalabras(r, u)!;
}

/**
 * El resultado frente a la meta, sin el veredicto: «92 % frente a una meta de 90 %», «97 % fuera del rango de 98 a
 * 100 %». `null` sin resultado, sin semáforo o sin meta. Lo dicen `fraseDeResultado` y las alertas (spec §10.3).
 */
export function resultadoFrenteAMeta(m: { resultado: Fraccion | null; semaforo: Semaforo | null; cumple: boolean | null }, r: Regla, u: Unidad): string | null {
  const meta = metaEnPalabras(r, u);
  if (m.resultado === null || m.semaforo === null || meta === null) return null;
  if (r.tendencia === "constante" && r.metaMax !== null && comparar(r.metaMax, r.meta!) !== 0) {
    return `${textoValor(m.resultado, u, r)} ${m.cumple === true ? "dentro del" : "fuera del"} rango de ${meta}`;
  }
  return `${textoValor(m.resultado, u, r)} frente a una meta de ${meta}`;
}

/** Un motivo escrito por una persona, cerrado con punto si no termina ya en un signo de puntuación (Tarea 19, D-4). */
const conPunto = (texto: string) => (/[.!?…;:]["»”)]?$/.test(texto.trim()) ? texto.trim() : `${texto.trim()}.`);

/** La frase de una medición («Cumple: 92 % frente a una meta de 90 %.»). Cumplir es alcanzar la meta: el color dice el nivel. */
export function fraseDeResultado(
  m: { resultado: Fraccion | null; semaforo: Semaforo | null; cumple: boolean | null; noAplica: boolean; motivo: string | null },
  r: Regla,
  u: Unidad,
): string {
  if (m.noAplica) return m.motivo ? `No aplica: ${conPunto(m.motivo)}` : "No aplica en este periodo.";
  if (m.resultado === null) return m.motivo ? `Sin resultado: ${conPunto(m.motivo)}` : "Sin dato: no se reportó.";
  const frente = resultadoFrenteAMeta(m, r, u);
  if (frente === null) return `${textoValor(m.resultado, u)}, sin meta para este periodo.`;
  return `${m.cumple === true ? "Cumple" : "No cumple"}: ${frente}.`;
}

/** La cantidad de un cambio, con los decimales de la unidad o los que hagan falta para que no quede en «0». */
function cantidad(diferencia: Fraccion, u: Unidad): string {
  const abs = esNegativa(diferencia) ? restar(CERO, diferencia) : diferencia;
  let texto = numeroEs(abs, u.decimales, "redondear");
  for (let k = u.decimales + 1; texto === "0" && k <= u.decimales + 4; k++) texto = numeroEs(abs, k, "redondear");
  return texto;
}

/**
 * La confirmación que pide un salto grande frente al periodo anterior con resultado (spec §7.4), sin bloquear: «El
 * resultado baja 43,3 puntos frente al segundo trimestre de 2026. ¿Los datos son correctos?». `anterior.etiqueta` va en
 * minúscula; un mes o un año van sin artículo («frente a marzo de 2026»).
 */
export function fraseDeVariacion(actual: Fraccion, anterior: { valor: Fraccion; clave: string; etiqueta: string }, u: Unidad): string {
  const n = cantidad(restar(actual, anterior.valor), u);
  const palabra = u.sufijo.trim() === "%" ? (n === "1" ? "punto" : "puntos") : u.sufijo.trim();
  const p = periodicidadDe(anterior.clave);
  const frente = p === "mensual" || p === "anual" || p === null ? `a ${anterior.etiqueta}` : `al ${anterior.etiqueta}`;
  const verbo = comparar(actual, anterior.valor) > 0 ? "sube" : "baja";
  return `El resultado ${verbo} ${[n, palabra].filter(Boolean).join(" ")} frente ${frente}. ¿Los datos son correctos?`;
}

/** La flecha de un cambio (spec §8.3): decorativa, porque el texto ya dice hacia dónde fue. */
export const FLECHA_DE_CAMBIO: Record<"sube" | "baja" | "igual", string> = { sube: "▲", baja: "▼", igual: "=" };

type Referencia = { valor: Fraccion; etiqueta: string };

/**
 * Hacia dónde fue el valor frente al periodo anterior y al mismo del año anterior, y si eso es mejorar. La flecha es
 * contra el periodo anterior (o, sin él, contra el del año anterior); `mejora` es `null` si no cambió o la tendencia es
 * constante.
 */
export function comparacion(
  actual: Fraccion,
  previo: Referencia | null,
  anioAnterior: Referencia | null,
  tendencia: Tendencia,
  u: Unidad,
): { texto: string; flecha: "sube" | "baja" | "igual"; mejora: boolean | null } | null {
  const referencias = [previo, anioAnterior].filter((x): x is Referencia => x !== null);
  if (referencias.length === 0) return null;
  const esPorcentaje = u.sufijo.trim() === "%";
  const pieza = ({ valor, etiqueta }: Referencia): string => {
    const orden = comparar(actual, valor);
    if (orden === 0) return `igual que en ${etiqueta}`;
    const n = cantidad(restar(actual, valor), u);
    const palabra = esPorcentaje ? (n === "1" ? "punto" : "puntos") : u.sufijo.trim();
    return `${[n, palabra].filter(Boolean).join(" ")} ${orden > 0 ? "más" : "menos"} que en ${etiqueta}`;
  };
  const orden = comparar(actual, referencias[0].valor);
  const flecha = orden > 0 ? "sube" : orden < 0 ? "baja" : "igual";
  const mejora = orden === 0 || tendencia === "constante" ? null : (orden > 0) === (tendencia === "ascendente");
  return { texto: referencias.map(pieza).join("; "), flecha, mejora };
}
