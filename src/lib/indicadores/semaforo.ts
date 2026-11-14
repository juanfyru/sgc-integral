/**
 * Meta y semáforo de un indicador (spec §7.5). Todo se decide con fracciones exactas, nunca con el número
 * redondeado. Sin Node ni BD: lo importan componentes de cliente.
 */
import { aDecimal, CERO, CIEN, comparar, dividir, entero, fraccion, multiplicar, restar, sumar, UNO, type Fraccion } from "./formula/fraccion";
import { errorDeRangos, limiteDeRangos, semaforoDeRangos, type FilaDeRango, type Rangos } from "./rangos";
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
  /** Los rangos escritos por estado; solo con `modo === "rangos"`. */
  rangos?: Rangos | null;
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
  if (r.modo === "rangos") return r.rangos ? limiteDeRangos(r.rangos, r.tendencia) : null;
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
  if (r.modo === "rangos") return r.rangos ? semaforoDeRangos(resultado, r.rangos, r.tendencia) : null;
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
  if (r.tendencia === "constante" && r.metaMax !== null && comparar(r.metaMax, r.meta) < 0 && r.modo === "rangos") {
    return "El máximo del rango no puede quedar por debajo del mínimo";
  }
  if (r.modo === "rangos") return r.rangos ? errorDeRangos(r.rangos, r.tendencia, r.meta, r.metaMax) : "Escriba los rangos del semáforo";
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
    if (r.tendencia === "ascendente" && comparar(r.meta, CERO) <= 0) {
      return "Con meta 0 o negativa en tendencia ascendente, escriba los rangos del semáforo";
    }
    if (r.tendencia === "descendente" && comparar(r.meta, CERO) < 0) {
      return "Con meta negativa en tendencia descendente, escriba los rangos del semáforo";
    }
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
  if (r.meta === null) return null;
  if (r.modo === "rangos") return r.rangos ? rangosEscritos(r.rangos, u) : null;
  if (errorDeRegla(r) !== null) return null;
  const n = (a: Fraccion) => numeroExacto(a, u.decimales);
  const con = (a: Fraccion) => `${n(a)}${u.sufijo}`;
  const esPorcentaje = u.sufijo.trim() === "%";
  if (r.tendencia === "constante") {
    const maximo = r.metaMax ?? r.meta;
    const tolerancia = r.tolerancia ?? CERO;
    const bien = comparar(maximo, r.meta) === 0 ? `Bien en ${con(r.meta)}` : `Bien de ${n(r.meta)} a ${con(maximo)}`;
    return comparar(tolerancia, CERO) === 0
      ? `${bien} · Fuera del rango, Crítico`
      : `${bien} · Atención hasta ${esPorcentaje ? `${n(tolerancia)} ${n(tolerancia) === "1" ? "punto" : "puntos"}` : con(tolerancia)} fuera del rango · Crítico más allá`;
  }
  const limite = limiteDeCritico(r);
  if (limite === null) return null;
  if (r.tendencia === "ascendente") {
    // Con la meta en la cuadrícula de decimales de la unidad, lo último que se ve en Atención es la meta menos un paso;
    // fuera de ella, un valor entre ese y la meta se vería en Atención, así que se dice «menos de».
    const enCuadricula = multiplicar(r.meta, entero(10 ** u.decimales)).d === BigInt(1);
    const tope = enCuadricula ? `a ${con(restar(r.meta, dividir(UNO, entero(10 ** u.decimales))!))}` : `a menos de ${con(r.meta)}`;
    return `Bien desde ${con(r.meta)} · Atención de ${n(limite)} ${tope} · Crítico por debajo de ${con(limite)}`;
  }
  return `Bien hasta ${con(r.meta)} · Atención de más de ${n(r.meta)} a ${con(limite)} · Crítico por encima de ${con(limite)}`;
}

/** Una fila como se escribió: «≥ 91 %», «41 a 90 %». */
function filaEnPalabras(f: FilaDeRango, u: Unidad): string {
  const n = (a: Fraccion) => numeroExacto(a, u.decimales);
  if (f.signo === "entre") return `${n(f.valor)} a ${n(f.hasta ?? f.valor)}${u.sufijo}`;
  const signo = { ">=": "≥", ">": ">", "<=": "≤", "<": "<" }[f.signo];
  return `${signo} ${n(f.valor)}${u.sufijo}`;
}

/** «Bien: ≥ 91 % · Atención: 41 a 90 % · Crítico: ≤ 40 %»; sin Atención, ese tramo no se escribe. */
function rangosEscritos(r: Rangos, u: Unidad): string {
  const tramo = (nombre: string, filas: FilaDeRango[]) => (filas.length === 0 ? null : `${nombre}: ${filas.map((f) => filaEnPalabras(f, u)).join(" y ")}`);
  return [tramo("Bien", r.bien), tramo("Atención", r.atencion), tramo("Crítico", r.critico)].filter((t) => t !== null).join(" · ");
}

/** «Cumple» es alcanzar la meta (spec 14A §3.1), no el color. `null` sin meta. */
export function cumpleMeta(v: Fraccion, r: Regla): boolean | null {
  if (r.meta === null) return null;
  if (r.tendencia === "ascendente") return comparar(v, r.meta) >= 0;
  if (r.tendencia === "descendente") return comparar(v, r.meta) <= 0;
  return comparar(v, r.meta) >= 0 && comparar(v, r.metaMax ?? r.meta) <= 0;
}

/** Los rangos que dan los mismos colores que una regla relativa o fija (la regla de una versión ya aprobada). */
export function rangosEquivalentes(r: Regla): Rangos | null {
  if (r.modo === "rangos") return r.rangos ?? null;
  if (r.meta === null) return null;
  const fila = (signo: FilaDeRango["signo"], valor: Fraccion, hasta: Fraccion | null = null): FilaDeRango => ({ signo, valor, hasta });
  if (r.tendencia === "constante") {
    const maximo = r.metaMax ?? r.meta;
    const t = r.tolerancia ?? CERO;
    const hayAtencion = comparar(t, CERO) > 0;
    const abajo = restar(r.meta, t);
    const arriba = sumar(maximo, t);
    return {
      bien: [fila("entre", r.meta, maximo)],
      atencion: hayAtencion ? [fila("entre", abajo, r.meta), fila("entre", maximo, arriba)] : [],
      critico: [fila("<", abajo), fila(">", arriba)],
    };
  }
  const limite = limiteDeCritico(r);
  if (limite === null) return null;
  return r.tendencia === "ascendente"
    ? { bien: [fila(">=", r.meta)], atencion: [fila(">=", limite)], critico: [fila("<", limite)] }
    : { bien: [fila("<=", r.meta)], atencion: [fila("<=", limite)], critico: [fila(">", limite)] };
}
