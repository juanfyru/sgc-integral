/**
 * Los rangos del semáforo escritos por estado (spec fase 14A §3.2 a §3.4): una fila por estado con un signo y uno o dos
 * valores. Todo con fracciones exactas. Sin Node ni BD, y sin importar `semaforo.ts` (que sí importa este archivo).
 */
import { aDecimal, comparar, dividir, entero, fraccion, multiplicar, restar, CIEN, type Fraccion } from "./formula/fraccion";
import type { Semaforo, Tendencia } from "./tipos";

export const SIGNOS = [">=", ">", "<=", "<", "entre"] as const;
export type Signo = (typeof SIGNOS)[number];

/** Una fila tal como se guarda: números en texto decimal (`hasta` solo con «entre»). */
export type FilaEnTexto = { signo: Signo; valor: string; hasta?: string };
export type RangosEnTexto = { bien: FilaEnTexto[]; atencion: FilaEnTexto[]; critico: FilaEnTexto[] };

export type FilaDeRango = { signo: Signo; valor: Fraccion; hasta: Fraccion | null };
export type Rangos = { bien: FilaDeRango[]; atencion: FilaDeRango[]; critico: FilaDeRango[] };

/** El texto decimal canónico de un número guardado: punto decimal, sin ceros de relleno («85.5», «33», «0»). */
function textoDeNumero(a: Fraccion): string {
  for (let k = 0; k <= 10; k++) {
    const t = aDecimal(a, k, "truncar");
    if (comparar(fraccion(t)!, a) === 0) return k === 0 ? t : t.replace(/0+$/, "").replace(/\.$/, "");
  }
  return aDecimal(a, 10, "truncar").replace(/0+$/, "").replace(/\.$/, "");
}

function filaDeTexto(f: FilaEnTexto): FilaDeRango | null {
  if (!(SIGNOS as readonly string[]).includes(f.signo)) return null;
  const valor = fraccion(f.valor);
  if (valor === null) return null;
  if (f.signo !== "entre") return { signo: f.signo, valor, hasta: null };
  const hasta = f.hasta === undefined ? null : fraccion(f.hasta);
  return hasta === null ? null : { signo: f.signo, valor, hasta };
}

/** `null` si un número o un signo no se lee. */
export function rangosDeTexto(t: RangosEnTexto): Rangos | null {
  const salida: Rangos = { bien: [], atencion: [], critico: [] };
  for (const estado of ESTADOS) {
    for (const f of t[estado]) {
      const fila = filaDeTexto(f);
      if (fila === null) return null;
      salida[estado].push(fila);
    }
  }
  return salida;
}

export function rangosATexto(r: Rangos): RangosEnTexto {
  const fila = (f: FilaDeRango): FilaEnTexto =>
    f.signo === "entre" && f.hasta !== null
      ? { signo: f.signo, valor: textoDeNumero(f.valor), hasta: textoDeNumero(f.hasta) }
      : { signo: f.signo, valor: textoDeNumero(f.valor) };
  return { bien: r.bien.map(fila), atencion: r.atencion.map(fila), critico: r.critico.map(fila) };
}

type Estado = "bien" | "atencion" | "critico";
const ESTADOS: Estado[] = ["bien", "atencion", "critico"];
const GRAVEDAD: Record<Estado, number> = { bien: 0, atencion: 1, critico: 2 };
const NOMBRE: Record<Estado, string> = { bien: "Bien", atencion: "Atención", critico: "Crítico" };

/** Un tramo del eje; `null` es infinito. */
type Tramo = { lo: Fraccion | null; loAb: boolean; hi: Fraccion | null; hiAb: boolean };
type Fila = { estado: Estado; fila: FilaDeRango; tramo: Tramo };

function tramoDe(f: FilaDeRango): Tramo {
  switch (f.signo) {
    case ">=":
      return { lo: f.valor, loAb: false, hi: null, hiAb: false };
    case ">":
      return { lo: f.valor, loAb: true, hi: null, hiAb: false };
    case "<=":
      return { lo: null, loAb: false, hi: f.valor, hiAb: false };
    case "<":
      return { lo: null, loAb: false, hi: f.valor, hiAb: true };
    default:
      return { lo: f.valor, loAb: false, hi: f.hasta ?? f.valor, hiAb: false };
  }
}

function filasDe(r: Rangos): Fila[] {
  return ESTADOS.flatMap((estado) => r[estado].map((fila) => ({ estado, fila, tramo: tramoDe(fila) })));
}

function contiene(t: Tramo, v: Fraccion): boolean {
  if (t.lo !== null) {
    const c = comparar(v, t.lo);
    if (c < 0 || (c === 0 && t.loAb)) return false;
  }
  if (t.hi !== null) {
    const c = comparar(v, t.hi);
    if (c > 0 || (c === 0 && t.hiAb)) return false;
  }
  return true;
}

function interseccion(a: Tramo, b: Tramo): Tramo {
  let lo = a.lo, loAb = a.loAb;
  if (b.lo !== null) {
    const c = a.lo === null ? -1 : comparar(a.lo, b.lo);
    if (c < 0) { lo = b.lo; loAb = b.loAb; } else if (c === 0) loAb = a.loAb || b.loAb;
  }
  let hi = a.hi, hiAb = a.hiAb;
  if (b.hi !== null) {
    const c = a.hi === null ? 1 : comparar(a.hi, b.hi);
    if (c > 0) { hi = b.hi; hiAb = b.hiAb; } else if (c === 0) hiAb = a.hiAb || b.hiAb;
  }
  return { lo, loAb, hi, hiAb };
}

function vacio(t: Tramo): boolean {
  if (t.lo === null || t.hi === null) return false;
  const c = comparar(t.lo, t.hi);
  return c > 0 || (c === 0 && (t.loAb || t.hiAb));
}

function esPunto(t: Tramo): boolean {
  return t.lo !== null && t.hi !== null && comparar(t.lo, t.hi) === 0 && !t.loAb && !t.hiAb;
}

/** `a` queda entero dentro de `b`. */
function contenido(a: Tramo, b: Tramo): boolean {
  if (b.lo !== null) {
    if (a.lo === null) return false;
    const c = comparar(a.lo, b.lo);
    if (c < 0 || (c === 0 && b.loAb && !a.loAb)) return false;
  }
  if (b.hi !== null) {
    if (a.hi === null) return false;
    const c = comparar(a.hi, b.hi);
    if (c > 0 || (c === 0 && b.hiAb && !a.hiAb)) return false;
  }
  return true;
}

/** Una fila de un solo signo que se abre hacia el lado mejor (spec §3.2): llega hasta donde empieza la fila mejor. */
function seAbreHaciaLoMejor(f: FilaDeRango, tendencia: Tendencia): boolean {
  if (tendencia === "ascendente") return f.signo === ">=" || f.signo === ">";
  if (tendencia === "descendente") return f.signo === "<=" || f.signo === "<";
  return false;
}

/** Los tramos con esa regla aplicada: lo que cada fila cubre de verdad sobre el eje. */
function efectivas(r: Rangos, tendencia: Tendencia): Fila[] {
  const filas = filasDe(r);
  return filas.map((x) => {
    if (x.estado === "bien" || !seAbreHaciaLoMejor(x.fila, tendencia)) return x;
    const mejores = filas.filter((y) => GRAVEDAD[y.estado] < GRAVEDAD[x.estado]);
    const t = { ...x.tramo };
    if (tendencia === "ascendente" && t.lo !== null) {
      for (const y of mejores) {
        if (y.tramo.lo !== null && comparar(y.tramo.lo, t.lo) >= 0 && (t.hi === null || comparar(y.tramo.lo, t.hi) < 0)) {
          t.hi = y.tramo.lo;
          t.hiAb = true;
        }
      }
    } else if (tendencia === "descendente" && t.hi !== null) {
      for (const y of mejores) {
        if (y.tramo.hi !== null && comparar(y.tramo.hi, t.hi) <= 0 && (t.lo === null || comparar(y.tramo.hi, t.lo) > 0)) {
          t.lo = y.tramo.hi;
          t.loAb = true;
        }
      }
    }
    return { ...x, tramo: t };
  });
}

/** Bien → Atención → Crítico; un valor en un hueco toma el color peor de sus vecinas; más allá de una punta, el de la punta. */
export function semaforoDeRangos(v: Fraccion, r: Rangos, tendencia: Tendencia): Semaforo {
  const filas = efectivas(r, tendencia);
  for (const estado of ESTADOS) {
    if (filas.some((x) => x.estado === estado && contiene(x.tramo, v))) return estado;
  }
  let abajo: Fila | null = null;
  let arriba: Fila | null = null;
  for (const x of filas) {
    if (x.tramo.hi !== null && comparar(x.tramo.hi, v) <= 0) {
      const c = abajo === null ? 1 : comparar(x.tramo.hi, abajo.tramo.hi!);
      if (c > 0 || (c === 0 && GRAVEDAD[x.estado] > GRAVEDAD[abajo!.estado])) abajo = x;
    }
    if (x.tramo.lo !== null && comparar(x.tramo.lo, v) >= 0) {
      const c = arriba === null ? -1 : comparar(x.tramo.lo, arriba.tramo.lo!);
      if (c < 0 || (c === 0 && GRAVEDAD[x.estado] > GRAVEDAD[arriba!.estado])) arriba = x;
    }
  }
  if (abajo !== null && arriba !== null) return GRAVEDAD[abajo.estado] >= GRAVEDAD[arriba.estado] ? abajo.estado : arriba.estado;
  return (abajo ?? arriba)?.estado ?? "critico";
}

const DENTRO = (a: string, b: string) => `El rango de ${a} queda dentro del de ${b}`;

/** El mensaje que le corresponde a unos rangos que no se pueden guardar, o `null` si sirven. */
export function errorDeRangos(r: Rangos, tendencia: Tendencia, meta: Fraccion, metaMax: Fraccion | null): string | null {
  if (r.bien.length === 0) return "Escriba el rango de Bien";
  if (r.critico.length === 0) return "Escriba el rango de Crítico";
  const constante = tendencia === "constante";
  if (!constante && ESTADOS.some((e) => r[e].length > 1)) return "Cada estado lleva una sola fila";
  const es = (f: FilaDeRango, ...signos: Signo[]) => signos.includes(f.signo);
  if (tendencia === "ascendente") {
    if (!es(r.bien[0], ">=", ">", "entre")) return "En «más es mejor», Bien va con ≥, > o «entre»";
    if (!es(r.critico[0], "<=", "<", "entre")) return "En «más es mejor», Crítico va con ≤, < o «entre»";
  } else if (tendencia === "descendente") {
    if (!es(r.bien[0], "<=", "<", "entre")) return "En «menos es mejor», Bien va con ≤, < o «entre»";
    if (!es(r.critico[0], ">=", ">", "entre")) return "En «menos es mejor», Crítico va con ≥, > o «entre»";
  } else {
    if (r.bien.length !== 1 || r.bien[0].signo !== "entre") return "Para mantenerse en un rango, Bien va con «entre»";
    const aBien = r.bien[0].valor;
    for (const e of ["atencion", "critico"] as const) {
      const abajo = r[e].filter((f) => (f.signo === "entre" ? comparar(f.valor, aBien) < 0 : f.signo === "<=" || f.signo === "<"));
      if (r[e].length > 2 || abajo.length > 1 || r[e].length - abajo.length > 1) {
        return "Para mantenerse en un rango, Atención y Crítico van a cada lado de Bien";
      }
    }
  }
  for (const e of ESTADOS) {
    for (const f of r[e]) {
      if (f.signo === "entre" && f.hasta !== null && comparar(f.valor, f.hasta) > 0) {
        return "En «entre», el primer número no puede ser mayor que el segundo";
      }
    }
  }
  const filas = filasDe(r);
  const parejas: [Fila, Fila][] = [];
  for (const peor of filas) {
    for (const mejor of filas) if (GRAVEDAD[peor.estado] > GRAVEDAD[mejor.estado]) parejas.push([peor, mejor]);
  }
  parejas.sort((a, b) => GRAVEDAD[b[0].estado] - GRAVEDAD[a[0].estado] || GRAVEDAD[b[1].estado] - GRAVEDAD[a[1].estado]);
  const dentro: [Fila, Fila][] = [];
  for (const [peor, mejor] of parejas) {
    const cruce = interseccion(peor.tramo, mejor.tramo);
    if (vacio(cruce) || esPunto(cruce)) continue;
    if (contenido(peor.tramo, mejor.tramo)) dentro.push([peor, mejor]);
    else if (!seAbreHaciaLoMejor(peor.fila, tendencia)) return `Los rangos de ${NOMBRE[peor.estado]} y ${NOMBRE[mejor.estado]} se cruzan`;
  }
  if (dentro.length > 0) return DENTRO(NOMBRE[dentro[0][0].estado], NOMBRE[dentro[0][1].estado]);
  const eje = efectivas(r, tendencia).sort((a, b) => {
    if (a.tramo.lo === null || b.tramo.lo === null) return a.tramo.lo === b.tramo.lo ? 0 : a.tramo.lo === null ? -1 : 1;
    return comparar(a.tramo.lo, b.tramo.lo) || (a.tramo.hi === null ? 1 : b.tramo.hi === null ? -1 : comparar(a.tramo.hi, b.tramo.hi));
  });
  for (let i = 0; i + 1 < eje.length; i++) {
    const p = eje[i], q = eje[i + 1];
    if (p.estado === q.estado || p.tramo.hi === null || q.tramo.lo === null) continue;
    if (comparar(restar(q.tramo.lo, p.tramo.hi), entero(1)) > 0) {
      const [peor, mejor] = GRAVEDAD[p.estado] > GRAVEDAD[q.estado] ? [p, q] : [q, p];
      return `Entre ${NOMBRE[peor.estado]} y ${NOMBRE[mejor.estado]} queda un hueco de más de una unidad`;
    }
  }
  const tramosBien = filasDe(r).filter((x) => x.estado === "bien").map((x) => x.tramo);
  for (const m of [meta, ...(constante && metaMax !== null ? [metaMax] : [])]) {
    if (!tramosBien.some((t) => contiene(t, m))) return "La meta debe quedar dentro del rango de Bien";
  }
  return null;
}

/** El borde de Crítico del lado mejor; `null` en «mantenerse en un rango» o si Crítico no lo tiene. */
export function limiteDeRangos(r: Rangos, tendencia: Tendencia): Fraccion | null {
  const f = r.critico[0];
  if (f === undefined || tendencia === "constante") return null;
  const t = tramoDe(f);
  return tendencia === "ascendente" ? t.hi : t.lo;
}

/** La regla general aprobada («Alerta ≥ 90 % de la meta», «≤ 110 %») escrita en filas (spec §5.5). */
export function rangosDeLaRegla(meta: Fraccion, tendencia: "ascendente" | "descendente", pctAscendente: number, pctDescendente: number): Rangos {
  const pct = entero(tendencia === "ascendente" ? pctAscendente : pctDescendente);
  const limite = dividir(multiplicar(meta, pct), CIEN)!;
  const sinAtencion = tendencia === "ascendente" ? comparar(limite, meta) >= 0 : comparar(limite, meta) <= 0;
  if (tendencia === "ascendente") {
    return {
      bien: [{ signo: ">=", valor: meta, hasta: null }],
      atencion: sinAtencion ? [] : [{ signo: ">=", valor: limite, hasta: null }],
      critico: [{ signo: "<", valor: sinAtencion ? meta : limite, hasta: null }],
    };
  }
  return {
    bien: [{ signo: "<=", valor: meta, hasta: null }],
    atencion: sinAtencion ? [] : [{ signo: "<=", valor: limite, hasta: null }],
    critico: [{ signo: ">", valor: sinAtencion ? meta : limite, hasta: null }],
  };
}
