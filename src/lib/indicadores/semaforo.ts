/**
 * Meta y semáforo de un indicador (spec §7.5). Todo se decide con fracciones exactas, nunca con el número
 * redondeado. Sin Node ni BD: lo importan componentes de cliente.
 */
import { aDecimal, CERO, CIEN, comparar, dividir, entero, fraccion, multiplicar, restar, sumar, UNO, type Fraccion } from "./formula/fraccion";
import type { Semaforo, Tendencia, ModoSemaforo } from "./tipos";
import type { Unidad } from "./textos";

export type Regla = {
  tendencia: Tendencia;
  meta: Fraccion | null;
  metaMax: Fraccion | null;
  modo: ModoSemaforo | null;
  umbralPct: number | null;
  limite: Fraccion | null;
  tolerancia: Fraccion | null;
};

/** `aDecimal` sin ceros de relleno y con coma decimal: «89,9», «63», «-2,5». */
export function numeroEs(a: Fraccion, decimales: number, modo: "redondear" | "truncar"): string {
  const t = aDecimal(a, decimales, modo);
  const limpio = t.includes(".") ? t.replace(/0+$/, "").replace(/\.$/, "") : t;
  return limpio.replace(".", ",");
}

/** Una meta o un límite tal como se escribió: con los decimales de la unidad o los que haga falta (hasta 4 más). */
export function numeroExacto(a: Fraccion, decimales: number): string {
  for (let k = decimales; k <= decimales + 4; k++) {
    if (comparar(fraccion(aDecimal(a, k, "truncar"))!, a) === 0) return numeroEs(a, k, "truncar");
  }
  return numeroEs(a, decimales + 2, "truncar");
}

/** Desde aquí hacia el lado malo es «Crítico»; `null` si la regla no lo define (sin meta, constante o incompleta). */
export function limiteDeCritico(r: Regla): Fraccion | null {
  if (r.meta === null || r.tendencia === "constante" || r.modo === null) return null;
  if (r.modo === "fijo") return r.limite;
  if (r.umbralPct === null || !Number.isInteger(r.umbralPct) || r.umbralPct < 1 || r.umbralPct > 99) return null;
  const umbral = entero(r.umbralPct);
  return r.tendencia === "ascendente"
    ? dividir(multiplicar(r.meta, umbral), CIEN)
    : dividir(multiplicar(r.meta, CIEN), umbral);
}

/** `null` es «sin meta» (o una regla que no alcanza a decidir). */
export function semaforoDe(resultado: Fraccion, r: Regla): Semaforo | null {
  if (r.meta === null) return null;
  if (r.tendencia === "constante") {
    const maximo = r.metaMax ?? r.meta;
    const tolerancia = r.tolerancia ?? CERO;
    if (comparar(resultado, r.meta) < 0) {
      return comparar(restar(r.meta, resultado), tolerancia) <= 0 ? "atencion" : "critico";
    }
    if (comparar(resultado, maximo) > 0) {
      return comparar(restar(resultado, maximo), tolerancia) <= 0 ? "atencion" : "critico";
    }
    return "bien";
  }
  const limite = limiteDeCritico(r);
  if (limite === null) return null;
  if (r.tendencia === "ascendente") {
    if (comparar(resultado, r.meta) >= 0) return "bien";
    return comparar(resultado, limite) >= 0 ? "atencion" : "critico";
  }
  if (comparar(resultado, r.meta) <= 0) return "bien";
  return comparar(resultado, limite) <= 0 ? "atencion" : "critico";
}

/** El mensaje que le corresponde a una regla que no se puede guardar, o `null` si sirve (o no hay meta). */
export function errorDeRegla(r: Regla): string | null {
  if (r.meta === null) return null;
  if (r.tendencia === "constante") {
    if (r.metaMax !== null && comparar(r.metaMax, r.meta) < 0) return "El máximo del rango no puede quedar por debajo del mínimo";
    if (r.tolerancia !== null && comparar(r.tolerancia, CERO) < 0) return "La tolerancia no puede ser negativa";
    return null;
  }
  if (r.tendencia === "descendente" && comparar(r.meta, CERO) === 0 && r.modo !== "fijo") {
    return "Con meta 0 en tendencia descendente, escriba los rangos del semáforo";
  }
  if (r.modo === null) return "Elija el modo del semáforo";
  if (r.modo === "relativo") {
    if (r.umbralPct === null || !Number.isInteger(r.umbralPct) || r.umbralPct < 1 || r.umbralPct > 99) {
      return "El umbral de atención debe estar entre 1 y 99 %";
    }
    return null;
  }
  if (r.limite === null) return "Escriba el límite de crítico";
  if (r.tendencia === "ascendente" && comparar(r.limite, r.meta) >= 0) return "El límite de crítico debe quedar por debajo de la meta";
  if (r.tendencia === "descendente" && comparar(r.limite, r.meta) <= 0) return "El límite de crítico debe quedar por encima de la meta";
  return null;
}

/** Los rangos escritos en palabras («Bien desde 90 % · Atención de 63 a 89,9 % · Crítico por debajo de 63 %»). */
export function rangosEnPalabras(r: Regla, u: Unidad): string | null {
  if (r.meta === null || errorDeRegla(r) !== null) return null;
  const n = (a: Fraccion) => numeroExacto(a, u.decimales);
  const con = (a: Fraccion) => `${n(a)}${u.sufijo}`;
  if (r.tendencia === "constante") {
    const maximo = r.metaMax ?? r.meta;
    const tolerancia = r.tolerancia ?? CERO;
    const bien = comparar(maximo, r.meta) === 0 ? `Bien en ${con(r.meta)}` : `Bien de ${n(r.meta)} a ${con(maximo)}`;
    return comparar(tolerancia, CERO) === 0
      ? `${bien} · Fuera del rango, Crítico`
      : `${bien} · Atención hasta ${con(tolerancia)} fuera del rango · Crítico más allá`;
  }
  const limite = limiteDeCritico(r);
  if (limite === null) return null;
  const paso = dividir(UNO, entero(10 ** u.decimales))!;
  if (r.tendencia === "ascendente") {
    return `Bien desde ${con(r.meta)} · Atención de ${n(limite)} a ${con(restar(r.meta, paso))} · Crítico por debajo de ${con(limite)}`;
  }
  return `Bien hasta ${con(r.meta)} · Atención de ${n(sumar(r.meta, paso))} a ${con(limite)} · Crítico por encima de ${con(limite)}`;
}
