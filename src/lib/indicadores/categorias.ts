/**
 * Las categorías de un indicador desagregado y su total (anexo 14C). Reglas puras, sin Node ni BD.
 */
import { analizar, type Nodo } from "./formula/analizar";
import { sumar, CERO, type Fraccion } from "./formula/fraccion";
import { calcular, type FichaDeCalculo } from "./calculo";
import { fichaDeCalculo, leerValores, reglaDeTexto, type CalculoEnTexto, type ReglaEnTexto, type VariableDeCaptura } from "./reporte";
import type { Regla } from "./semaforo";
import { textoValor, type Unidad } from "./textos";
import { ETIQUETA_SEMAFORO, NO_ALCANZA_LA_META, sinAlcanzarLaMeta, type EstadoDePunto, type Forma, type Semaforo } from "./tipos";

export type CategoriaDeMedicion = { id: number; nombre: string; orden: number; noAplica: string | null };

/**
 * Las categorías que cuentan en un periodo: creadas antes de que termine y activas o desactivadas después de que empezó, en
 * el orden del maestro (y por id con el mismo orden).
 */
export function listaDelPeriodo(
  maestro: readonly { id: number; nombre: string; orden: number; activo: boolean; creadoEn: Date; desactivadaEn: Date | null }[],
  periodo: { desde: Date; hasta: Date },
): CategoriaDeMedicion[] {
  return maestro
    .filter((c) => c.creadoEn.getTime() < periodo.hasta.getTime() && (c.activo || (c.desactivadaEn !== null && c.desactivadaEn.getTime() > periodo.desde.getTime())))
    .sort((a, b) => a.orden - b.orden || a.id - b.id)
    .map((c) => ({ id: c.id, nombre: c.nombre, orden: c.orden, noAplica: null }));
}

export type EstadoDeFila = "completa" | "sin_casos" | "no_aplica" | "incompleta";

/** Sin meta: solo importa si la fórmula se puede calcular. */
const SIN_REGLA: Regla = { tendencia: "ascendente", meta: null, metaMax: null, modo: null, umbralPct: null, limite: null, tolerancia: null };

/**
 * Una fila con todos sus valores está completa aunque su fórmula no dé resultado por una cifra intermedia fuera de rango: sus
 * valores son válidos y suman al total (anexo 14C, §5.5); solo le falta la cifra propia. «Sin casos» es solo la división por
 * cero.
 */
export function estadoDeFila(c: CategoriaDeMedicion, valores: Readonly<Record<string, Fraccion>>, calculo: FichaDeCalculo): EstadoDeFila {
  if (c.noAplica !== null) return "no_aplica";
  const r = calcular(calculo, valores, SIN_REGLA);
  if (!r.completo) return "incompleta";
  return r.sinResultado === "division_por_cero" ? "sin_casos" : "completa";
}

/**
 * El total de las categorías: la suma de cada letra en las que aplican (una sin casos suma sus ceros). Con alguna
 * incompleta dice cuáles faltan; si todas son «No aplica», ninguna aplica. Una lista vacía no es «ninguna aplica» (dejaría la
 * medición «No aplica» sin que nadie lo decidiera): faltan categorías, sin nombres.
 */
export function totalDeCategorias(
  filas: readonly { categoria: CategoriaDeMedicion; valores: Readonly<Record<string, Fraccion>> }[],
  calculo: FichaDeCalculo,
): { clase: "total"; valores: Record<string, Fraccion> } | { clase: "faltan"; categorias: string[] } | { clase: "ninguna_aplica" } {
  if (filas.length === 0) return { clase: "faltan", categorias: [] };
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

/**
 * El estado de una categoría en texto y como punto de una gráfica (anexo 14C, §5.6): su semáforo, con «Bien · no alcanza la
 * meta» como el total; «Sin meta» si tiene cifra y no hay meta; «Sin casos» (0 ÷ 0), «No aplica», o «Sin dato» si le faltan
 * valores o su cifra no se pudo calcular.
 */
export function estadoDeCategoria(f: { estado: EstadoDeFila; semaforo: Semaforo | null; cumple: boolean | null; conResultado: boolean }): {
  punto: EstadoDePunto;
  texto: string;
} {
  if (f.estado === "no_aplica") return { punto: "no-aplica", texto: "No aplica" };
  if (f.estado === "sin_casos") return { punto: "sin-dato", texto: "Sin casos" };
  if (f.semaforo) {
    return { punto: f.semaforo, texto: sinAlcanzarLaMeta(f.semaforo, f.cumple) ? `${ETIQUETA_SEMAFORO[f.semaforo]} · ${NO_ALCANZA_LA_META}` : ETIQUETA_SEMAFORO[f.semaforo] };
  }
  return f.conResultado ? { punto: "sin-meta", texto: "Sin meta" } : { punto: "sin-dato", texto: "Sin dato" };
}

/** Una fila de la rejilla mientras se digita (`rejillaEnVivo`). */
export type FilaEnVivo = {
  id: number;
  nombre: string;
  estado: EstadoDeFila;
  /** El error de cada celda que no sirve, por letra. */
  errores: Record<string, string>;
  /** Tiene todo lo propio y le falta solo lo ajeno: el dato por categoría que aún no llega (anexo 14C, §5.7). */
  esperaDato: boolean;
  resultado: Fraccion | null;
  /** «55 %», sin contradecir el color. */
  texto: string | null;
  semaforo: Semaforo | null;
  cumple: boolean | null;
};

/** Lo que da el total mientras se digita: la suma, qué categorías faltan, «ninguna aplica» o la espera de un dato ajeno. */
export type TotalEnVivo =
  | { clase: "total"; valores: Record<string, Fraccion> }
  | { clase: "faltan"; categorias: string[] }
  | { clase: "ninguna_aplica" }
  | { clase: "espera" };

/**
 * La rejilla de un desagregado mientras se digita (anexo 14C, §5.4 y §5.5), con las mismas funciones puras que deciden en el
 * servidor, que es quien manda: cada fila con sus valores leídos con los límites de captura de su celda (`variables`; a lo
 * ajeno no lo limitan las reglas de quien mide), su estado y, completa, su cifra y su color con la regla de la medición; el
 * total, que suma las filas que aplican (`totalDeCategorias`) cuando todas están completas, «Sin casos» o «No aplica», o qué
 * categorías faltan (las que no tienen todo lo propio), o la espera si a alguna solo le falta lo ajeno; y las categorías
 * completas en Crítico, en el orden de la lista.
 */
export function rejillaEnVivo(
  d: { calculo: CalculoEnTexto; regla: ReglaEnTexto; unidad: Unidad; variables: readonly (VariableDeCaptura & { ajena: boolean })[] },
  filas: readonly { id: number; nombre: string; noAplica: boolean; textos: Readonly<Record<string, string | undefined>> }[],
): { filas: FilaEnVivo[]; total: TotalEnVivo; enCritico: FilaEnVivo[] } {
  const ficha = fichaDeCalculo(d.calculo);
  const regla = reglaDeTexto(d.regla);
  const propias = d.variables.filter((v) => !v.ajena).map((v) => v.letra);
  const leidas = filas.map((f) => {
    const categoria: CategoriaDeMedicion = { id: f.id, nombre: f.nombre, orden: 0, noAplica: f.noAplica ? f.nombre : null };
    const base: FilaEnVivo = { id: f.id, nombre: f.nombre, estado: "no_aplica", errores: {}, esperaDato: false, resultado: null, texto: null, semaforo: null, cumple: null };
    if (f.noAplica) return { categoria, valores: {}, fila: base };
    const { valores: todos, errores } = leerValores(d.variables, f.textos);
    const valores: Record<string, Fraccion> = {};
    for (const [letra, v] of Object.entries(todos)) if (v !== null) valores[letra] = v;
    const estado = ficha ? estadoDeFila(categoria, valores, ficha) : "incompleta";
    const esperaDato = estado === "incompleta" && Object.keys(errores).length === 0 && propias.every((l) => valores[l] !== undefined);
    if (estado !== "completa" || !ficha) return { categoria, valores, fila: { ...base, estado, errores, esperaDato } };
    const r = resultadoDeCategoria(valores, ficha, regla);
    const texto = r.resultado ? textoValor(r.resultado, d.unidad, regla) : null;
    return { categoria, valores, fila: { ...base, estado, errores, resultado: r.resultado, texto, semaforo: r.semaforo, cumple: r.cumple } };
  });
  const enVivo = leidas.map((x) => x.fila);
  const faltan = enVivo.filter((f) => f.estado === "incompleta" && !f.esperaDato).map((f) => f.nombre);
  let total: TotalEnVivo;
  if (faltan.length > 0 || !ficha) total = { clase: "faltan", categorias: faltan };
  else if (enVivo.some((f) => f.esperaDato)) total = { clase: "espera" };
  else total = totalDeCategorias(leidas, ficha);
  return { filas: enVivo, total, enCritico: enVivo.filter((f) => f.estado === "completa" && f.semaforo === "critico") };
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
