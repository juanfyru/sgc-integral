/**
 * Las categorías de un indicador desagregado y su total (anexo 14C). Reglas puras, sin Node ni BD.
 */
import { analizar, type Nodo } from "./formula/analizar";
import { sumar, CERO, type Fraccion } from "./formula/fraccion";
import { calcular, type FichaDeCalculo } from "./calculo";
import type { Regla } from "./semaforo";
import type { Forma, Semaforo } from "./tipos";

export type CategoriaDeMedicion = { id: number; nombre: string; orden: number; noAplica: string | null };

/** Las categorías que cuentan en un periodo: creadas antes de que termine y activas o desactivadas después de que empezó. */
export function listaDelPeriodo(
  maestro: readonly { id: number; nombre: string; orden: number; activo: boolean; creadoEn: Date; desactivadaEn: Date | null }[],
  periodo: { desde: Date; hasta: Date },
): CategoriaDeMedicion[] {
  return maestro
    .filter((c) => c.creadoEn.getTime() < periodo.hasta.getTime() && (c.activo || (c.desactivadaEn !== null && c.desactivadaEn.getTime() > periodo.desde.getTime())))
    .sort((a, b) => a.orden - b.orden)
    .map((c) => ({ id: c.id, nombre: c.nombre, orden: c.orden, noAplica: null }));
}

export type EstadoDeFila = "completa" | "sin_casos" | "no_aplica" | "incompleta";

/** Sin meta: solo importa si la fórmula se puede calcular. */
const SIN_REGLA: Regla = { tendencia: "ascendente", meta: null, metaMax: null, modo: null, umbralPct: null, limite: null, tolerancia: null };

export function estadoDeFila(c: CategoriaDeMedicion, valores: Readonly<Record<string, Fraccion>>, calculo: FichaDeCalculo): EstadoDeFila {
  if (c.noAplica !== null) return "no_aplica";
  const r = calcular(calculo, valores, SIN_REGLA);
  if (!r.completo) return "incompleta";
  return r.sinResultado === "division_por_cero" ? "sin_casos" : "completa";
}

/**
 * El total de las categorías: la suma de cada letra en las que aplican (una sin casos suma sus ceros). Con alguna
 * incompleta dice cuáles faltan; si todas son «No aplica» (o no hay ninguna), ninguna aplica.
 */
export function totalDeCategorias(
  filas: readonly { categoria: CategoriaDeMedicion; valores: Readonly<Record<string, Fraccion>> }[],
  calculo: FichaDeCalculo,
): { clase: "total"; valores: Record<string, Fraccion> } | { clase: "faltan"; categorias: string[] } | { clase: "ninguna_aplica" } {
  const conEstado = filas.map((f) => ({ ...f, estado: estadoDeFila(f.categoria, f.valores, calculo) }));
  const faltan = conEstado.filter((f) => f.estado === "incompleta").map((f) => f.categoria.nombre);
  if (faltan.length > 0) return { clase: "faltan", categorias: faltan };
  const aplican = conEstado.filter((f) => f.estado !== "no_aplica");
  if (aplican.length === 0) return { clase: "ninguna_aplica" };
  const valores: Record<string, Fraccion> = {};
  for (const letra of calculo.letras) valores[letra] = aplican.reduce((suma, f) => sumar(suma, f.valores[letra]), CERO);
  return { clase: "total", valores };
}

export function resultadoDeCategoria(
  valores: Readonly<Record<string, Fraccion>>,
  calculo: FichaDeCalculo,
  regla: Regla,
): { resultado: Fraccion | null; semaforo: Semaforo | null; cumple: boolean | null } {
  const r = calcular(calculo, valores, regla);
  return { resultado: r.resultado, semaforo: r.semaforo, cumple: r.cumple };
}

function usaFuncion(n: Nodo): boolean {
  switch (n.t) {
    case "fn":
      return true;
    case "neg":
      return usaFuncion(n.a);
    case "op":
      return usaFuncion(n.a) || usaFuncion(n.b);
    default:
      return false;
  }
}

export const FORMULA_NO_DESAGREGABLE = "Una fórmula con min, max o abs no se puede desagregar";

/** Con min, max o abs el total no se puede sumar por categoría: se dice por el árbol, no por el texto. */
export function errorDeDesagregacion(d: { forma: Forma; formula: string | null }): string | null {
  if (d.forma !== "libre" || d.formula === null) return null;
  const a = analizar(d.formula);
  return a.ok && usaFuncion(a.arbol) ? FORMULA_NO_DESAGREGABLE : null;
}
