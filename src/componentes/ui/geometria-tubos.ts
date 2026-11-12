/**
 * Geometría pura de las gráficas en estilo «Tubos» (Fase 14A, spec §11): la escala, la altura de un valor, un tubo por
 * periodo y los trazos de la tendencia en miniatura. Trabaja sobre números: quien la usa convierte antes las fracciones
 * con `aDecimal`. Sin React, sin Node ni BD: la usan los componentes de servidor de las gráficas.
 */

import type { EstadoDePunto, PuntoDeSerie } from "@/lib/indicadores/tipos";

// Los tipos viven con los del módulo (los arman las lecturas de la BD); se reexportan para los componentes.
export type { EstadoDePunto, PuntoDeSerie };

export type Geometria = { ancho: number; alto: number; margen: { izq: number; der: number; arriba: number; abajo: number } };
export type Escala = { min: number; max: number };
export type Tubo = { x: number; ancho: number; yRelleno: number; altoRelleno: number; centro: number };

/** El tubo más ancho; con muchos periodos, cada uno ocupa menos de la mitad de su franja. */
export const ANCHO_MAXIMO_TUBO = 24;
const PROPORCION_TUBO = 0.48;
/** Techos redondos de la escala (por cada potencia de diez). */
const PASOS = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
/** El aire sobre el mayor valor o referencia cuando la unidad no es un porcentaje. */
const AIRE = 1.1;

const limpio = (n: number) => Number(n.toPrecision(12));

function techoRedondo(x: number): number {
  const potencia = 10 ** Math.floor(Math.log10(x));
  for (const paso of PASOS) {
    const techo = limpio(paso * potencia);
    if (techo >= x) return techo;
  }
  return limpio(10 * potencia);
}

/**
 * La escala de una gráfica: un porcentaje va de 0 a 100 y crece de 25 en 25 si un valor o una referencia (la meta, el
 * límite, la franja) lo pasa; otra unidad sube hasta un número redondo con aire sobre el mayor. Con negativos, baja de
 * la misma manera y la marca del medio es el cero.
 */
export function escala(valores: number[], referencias: number[], esPorcentaje: boolean): Escala & { marcas: number[] } {
  const todos = [...valores, ...referencias].filter(Number.isFinite);
  const mayor = Math.max(0, ...todos);
  const menor = Math.min(0, ...todos);
  const hacia = (n: number) => (esPorcentaje ? Math.ceil(n / 25) * 25 : techoRedondo(n * AIRE));
  const max = esPorcentaje && mayor <= 100 ? 100 : mayor > 0 ? hacia(mayor) : 1;
  const min = menor < 0 ? -hacia(-menor) : 0;
  return { min, max, marcas: min < 0 ? [min, 0, max] : [0, max / 2, max] };
}

/** La altura en el lienzo de un valor; lo que se sale de la escala se queda en su borde. */
export function yDe(valor: number, g: Geometria, e: Escala): number {
  const base = g.alto - g.margen.abajo;
  const tope = g.margen.arriba;
  if (!(e.max > e.min) || !Number.isFinite(valor)) return base;
  const v = Math.min(Math.max(valor, e.min), e.max);
  return base - ((v - e.min) / (e.max - e.min)) * (base - tope);
}

/**
 * El ancho del lienzo de una gráfica de tubos: un paso fijo por columna más los márgenes (Tarea 19, D-2). Crece con los
 * periodos y nunca se impone un ancho fijo: cuatro trimestres caben en un teléfono y doce meses se desplazan.
 */
export function anchoDeLienzo(periodos: number, margen: { izq: number; der: number }, paso: number): number {
  return margen.izq + margen.der + Math.max(periodos, 1) * paso;
}

/**
 * La columna en que arranca una gráfica que se desplaza: la del último periodo con valor (no un periodo por venir, que
 * queda al final). Sin ningún valor, `null`: arranca donde arranca, en lo más reciente.
 */
export function columnaInicial(serie: readonly Pick<PuntoDeSerie, "valor">[]): number | null {
  for (let i = serie.length - 1; i >= 0; i--) if (serie[i].valor !== null) return i;
  return null;
}

/** El ancho de la franja de cada periodo: toda ella es el área sensible de la columna. */
export function anchoDeFranja(periodos: number, g: Geometria): number {
  return (g.ancho - g.margen.izq - g.margen.der) / Math.max(periodos, 1);
}

/**
 * Un tubo por punto, todos del mismo ancho y centrados en su franja. El relleno parte del cero cuando la escala lo
 * incluye (un positivo sube, un negativo baja, el cero no tiene relleno) y, si no, de la base. `yRelleno` es siempre el
 * borde de arriba del relleno.
 */
export function calcularTubos(serie: PuntoDeSerie[], g: Geometria, e: Escala): Tubo[] {
  const franja = anchoDeFranja(serie.length, g);
  const ancho = Math.min(ANCHO_MAXIMO_TUBO, franja * PROPORCION_TUBO);
  const origen = e.min <= 0 && e.max >= 0 ? yDe(0, g, e) : g.alto - g.margen.abajo;
  return serie.map((p, i) => {
    const centro = g.margen.izq + franja * (i + 0.5);
    const y = p.valor === null ? origen : yDe(p.valor, g, e);
    return { x: centro - ancho / 2, ancho, yRelleno: Math.min(y, origen), altoRelleno: Math.abs(origen - y), centro };
  });
}

/** Dónde empieza cada año de una serie que abarca más de uno (por la clave, `AAAA…`); con un solo año, ninguno. */
export function cambiosDeAnio(claves: string[]): { indice: number; anio: string }[] {
  const cambios: { indice: number; anio: string }[] = [];
  claves.forEach((clave, indice) => {
    const anio = /^(\d{4})/.exec(clave)?.[1];
    if (anio !== undefined && anio !== cambios.at(-1)?.anio) cambios.push({ indice, anio });
  });
  return cambios.length > 1 ? cambios : [];
}

type Punto = { x: number; y: number };

/**
 * Los trazos de la tendencia en miniatura: un periodo sin dato corta la línea. El punto final es el del último periodo,
 * y no hay si ese periodo no tiene dato. Todo igual queda en una línea plana al medio.
 */
export function puntosDeTendencia(
  valores: (number | null)[],
  g: { ancho: number; alto: number; margen: number },
): { tramos: Punto[][]; ultimo: Punto | null } {
  const conDato = valores.filter((v): v is number => v !== null && Number.isFinite(v));
  const mayor = Math.max(...conDato);
  const menor = Math.min(...conDato);
  const alto = g.alto - 2 * g.margen;
  const paso = valores.length > 1 ? (g.ancho - 2 * g.margen) / (valores.length - 1) : 0;
  const punto = (v: number, i: number): Punto => ({
    x: valores.length > 1 ? g.margen + i * paso : g.ancho / 2,
    y: mayor > menor ? g.margen + ((mayor - v) / (mayor - menor)) * alto : g.alto / 2,
  });
  const tramos: Punto[][] = [];
  let actual: Punto[] = [];
  valores.forEach((v, i) => {
    if (v === null || !Number.isFinite(v)) {
      if (actual.length > 0) tramos.push(actual);
      actual = [];
    } else actual.push(punto(v, i));
  });
  if (actual.length > 0) tramos.push(actual);
  const final = valores.at(-1);
  return { tramos, ultimo: final === null || final === undefined || !Number.isFinite(final) ? null : tramos.at(-1)!.at(-1)! };
}

const MESES_CORTOS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

/** El rótulo del eje: el mes en tres letras; un bimestre, trimestre o semestre por su clave (T2); el año, tal cual. */
export function rotuloCorto(clave: string, etiqueta: string): string {
  const m = /^\d{4}(?:-(?:(\d{2})|([BTS]\d)))?$/.exec(clave);
  if (!m) return etiqueta;
  if (m[1] !== undefined) return MESES_CORTOS[Number(m[1]) - 1] ?? etiqueta;
  return m[2] ?? clave;
}

/** El nombre de cada estado, para lo que no trae el suyo (el acumulado). */
export const NOMBRE_DE_ESTADO: Record<EstadoDePunto, string> = {
  bien: "Bien",
  atencion: "Atención",
  critico: "Crítico",
  "sin-meta": "Sin meta",
  "sin-dato": "Sin dato",
  "no-aplica": "No aplica",
  futuro: "Por reportar",
};

/** La clase del relleno de un tubo según su estado; sin valor, `null` (la pista queda vacía). */
export function claseDeRelleno(estado: EstadoDePunto): "tubo-bien" | "tubo-atencion" | "tubo-critico" | "tubo-neutro" | null {
  if (estado === "bien" || estado === "atencion" || estado === "critico") return `tubo-${estado}`;
  return estado === "sin-meta" ? "tubo-neutro" : null;
}
