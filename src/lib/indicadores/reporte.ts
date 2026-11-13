/**
 * Lo que la pantalla de reporte (cliente) y `reportar` (servidor) comparten para leer los valores digitados y calcular
 * una medición (spec §7.4 y §8.2). Todo llega en texto, también los números de la BD: así viaja del servidor al
 * navegador sin `bigint`. Sin Node ni BD.
 */
import { calcular, variacionExcesiva, type FichaDeCalculo } from "./calculo";
import { analizar } from "./formula/analizar";
import type { Motivo } from "./formula/evaluar";
import { aDecimal, comparar, deTexto, esNegativa, fraccion, type Fraccion } from "./formula/fraccion";
import { rangosDeTexto, type RangosEnTexto } from "./rangos";
import { numeroExacto, type Regla } from "./semaforo";
import { fraseDeVariacion, textoValor, type Unidad } from "./textos";
import type { EstadoMedicion, ModoSemaforo, Semaforo, Tendencia } from "./tipos";

/** La regla del semáforo de una versión (o con la meta programada del periodo), con sus números en texto. */
export type ReglaEnTexto = {
  tendencia: Tendencia;
  meta: string | null;
  metaMax: string | null;
  modo: ModoSemaforo | null;
  umbralPct: number | null;
  limite: string | null;
  tolerancia: string | null;
  rangos?: RangosEnTexto | null;
};

/** La fórmula de una versión y sus límites del resultado. */
export type CalculoEnTexto = { formula: string; letras: string[]; resultadoMin: string | null; resultadoMax: string | null };

/** Lo que se valida de cada valor digitado (spec §7.4). */
export type VariableDeCaptura = {
  letra: string;
  nombre: string;
  capturaMin: string | null;
  capturaMax: string | null;
  admiteNegativos: boolean;
};

export const DIVISION_POR_CERO = "No se puede calcular: división por cero. Si no hubo casos, marque «No aplica en este periodo».";
/** El mismo caso en la tabla del año, donde «No aplica» se marca en la fila del histórico. */
export const DIVISION_POR_CERO_HISTORICO = "No se puede calcular: división por cero. Si no hubo casos, marque «No aplica» en esa fila.";
export const CIFRA_FUERA_DE_RANGO = "No se puede calcular: una cifra intermedia queda fuera de rango";

/** «El resultado (120 %) queda fuera de los límites del indicador». */
export const fueraDeLimites = (resultado: string) => `El resultado (${resultado}) queda fuera de los límites del indicador`;

const fr = (v: string | null) => (v === null ? null : fraccion(v));

export function reglaDeTexto(r: ReglaEnTexto): Regla {
  return {
    tendencia: r.tendencia,
    meta: fr(r.meta),
    metaMax: fr(r.metaMax),
    modo: r.modo,
    umbralPct: r.umbralPct,
    limite: fr(r.limite),
    tolerancia: fr(r.tolerancia),
    ...(r.rangos ? { rangos: rangosDeTexto(r.rangos) } : {}),
  };
}

/** `null` si la fórmula no se puede leer: una versión aprobada siempre la tiene válida. */
export function fichaDeCalculo(c: CalculoEnTexto): FichaDeCalculo | null {
  const a = analizar(c.formula);
  if (!a.ok) return null;
  return { arbol: a.arbol, letras: c.letras, resultadoMin: fr(c.resultadoMin), resultadoMax: fr(c.resultadoMax) };
}

const NUMERO = /^-?\d+(?:[.,]\d+)?$/;
const ACOTADO = /^-?\d{1,15}(?:[.,]\d{1,4})?$/;

/** Un valor digitado: vacío es `null` (no se digitó); si no sirve, el mensaje para la persona. */
export function leerValor(texto: string, v: VariableDeCaptura): { ok: true; valor: Fraccion | null } | { ok: false; error: string } {
  const t = texto.trim();
  if (t === "") return { ok: true, valor: null };
  const nombre = `«${v.nombre}»`;
  if (!NUMERO.test(t)) return { ok: false, error: `${nombre} debe ser un número` };
  if (!ACOTADO.test(t)) return { ok: false, error: `${nombre} admite hasta 15 cifras enteras y 4 decimales` };
  const valor = fraccion(t)!;
  if (esNegativa(valor) && !v.admiteNegativos) return { ok: false, error: `${nombre} no puede ser negativo` };
  const minimo = fr(v.capturaMin);
  const maximo = fr(v.capturaMax);
  if (minimo && comparar(valor, minimo) < 0) return { ok: false, error: `${nombre} no puede ser menor que ${numeroExacto(minimo, 0)}` };
  if (maximo && comparar(valor, maximo) > 0) return { ok: false, error: `${nombre} no puede pasar de ${numeroExacto(maximo, 0)}` };
  return { ok: true, valor };
}

/** Todos los valores de la ficha: los que sirven, por letra, y el error de cada uno que no sirve. */
export function leerValores(
  variables: readonly VariableDeCaptura[],
  textos: Readonly<Record<string, string | undefined>>,
): { valores: Record<string, Fraccion | null>; errores: Record<string, string> } {
  const valores: Record<string, Fraccion | null> = {};
  const errores: Record<string, string> = {};
  for (const v of variables) {
    const leido = leerValor(Object.hasOwn(textos, v.letra) ? (textos[v.letra] ?? "") : "", v);
    if (leido.ok) valores[v.letra] = leido.valor;
    else {
      valores[v.letra] = null;
      errores[v.letra] = leido.error;
    }
  }
  return { valores, errores };
}

function sinCeros(t: string): string {
  return t.includes(".") ? t.replace(/0+$/, "").replace(/\.$/, "") : t;
}

/** Un valor como se guarda y se compara: punto decimal y sin ceros de relleno («3.5», «5»). Admite 4 decimales. */
export const valorEnTexto = (v: Fraccion): string => sinCeros(aDecimal(v, 4, "truncar"));

/** Un resultado en el detalle de los eventos: punto decimal, hasta 10 decimales y sin ceros de relleno. */
export const decimalCorto = (v: Fraccion): string => sinCeros(aDecimal(v, 10, "redondear"));

/**
 * A dónde se vuelve tras reportar (Tarea 19, D-12): a `volver` (la página del indicador) y, si el periodo quedó abierto
 * pidiendo su análisis (Atención o Crítico), a su tabla del año con `foco=analisis`: la página lleva el foco al formulario
 * del análisis. Un periodo que no es una clave válida, o un `volver` que ya trae consulta, vuelve tal cual.
 */
export function destinoTrasReportar(volver: string, periodo: string, r: { estado: EstadoMedicion; semaforo: Semaforo | null }): string {
  const pideAnalisis = r.estado === "abierta" && (r.semaforo === "atencion" || r.semaforo === "critico");
  if (!pideAnalisis || !/^\d{4}(-(\d{2}|[BTS]\d))?$/.test(periodo) || volver.includes("?") || volver.includes("#")) return volver;
  return `${volver}?vista=resultados&anio=${periodo.slice(0, 4)}&foco=analisis#analisis`;
}

/** Lo que vuelve de `reportarAccion`: un error, un aviso o la confirmación que pide un salto grande (`confirmar`). */
export type EstadoReporte =
  | { ok: false; error: string; confirmar?: string; valores?: Record<string, string | string[]> }
  | { ok: true; aviso: string }
  | null;

/** Lo que la pantalla de reporte calcula mientras se digita: lo mismo que decide el servidor, que es quien manda. */
export type CalculoEnVivo = {
  /** El error de cada valor que no sirve, por letra. */
  errores: Record<string, string>;
  /** Todos los valores digitados y válidos. */
  completo: boolean;
  resultado: Fraccion | null;
  /** «60 %», sin contradecir el color. */
  texto: string | null;
  semaforo: Semaforo | null;
  sinResultado: Motivo | null;
  /** El mensaje de un resultado fuera de los límites del indicador. */
  fueraDeLimites: string | null;
  /** La pregunta por un salto grande frente a la medición anterior con resultado. */
  variacion: string | null;
};

export function calcularEnVivo(
  d: {
    calculo: CalculoEnTexto;
    regla: ReglaEnTexto;
    unidad: Unidad;
    variables: readonly VariableDeCaptura[];
    anterior: { clave: string; etiqueta: string; resultado: string } | null;
    variacionPct: number;
  },
  textos: Readonly<Record<string, string | undefined>>,
): CalculoEnVivo {
  const { valores, errores } = leerValores(d.variables, textos);
  const completo = Object.keys(errores).length === 0 && d.variables.every((v) => valores[v.letra] !== null);
  const ficha = fichaDeCalculo(d.calculo);
  const vacio: CalculoEnVivo = { errores, completo, resultado: null, texto: null, semaforo: null, sinResultado: null, fueraDeLimites: null, variacion: null };
  if (!completo || !ficha) return vacio;
  const regla = reglaDeTexto(d.regla);
  const r = calcular(ficha, Object.fromEntries(Object.entries(valores).map(([l, v]) => [l, v ?? undefined])), regla);
  if (!r.resultado) return { ...vacio, sinResultado: r.sinResultado };
  const anterior = d.anterior ? { ...d.anterior, valor: deTexto(d.anterior.resultado) } : null;
  return {
    ...vacio,
    resultado: r.resultado,
    texto: textoValor(r.resultado, d.unidad, regla),
    semaforo: r.semaforo,
    fueraDeLimites: r.fueraDeLimites ? fueraDeLimites(textoValor(r.resultado, d.unidad)) : null,
    variacion:
      anterior && variacionExcesiva(r.resultado, anterior.valor, d.variacionPct) ? fraseDeVariacion(r.resultado, anterior, d.unidad) : null,
  };
}
