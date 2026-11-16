/**
 * Piezas puras de las lecturas de resultados (spec §8.3, §8.10, §11 y §12.7): el nombre corto de un periodo, la etiqueta
 * de la comparación, las rachas de versiones del acumulado y su rótulo, el texto del límite de crítico y el reparto de los
 * doce meses de una fila de la matriz. Sin Node ni BD.
 */
import { MESES, periodoDe } from "@/lib/indicadores-documentales/periodo";
import type { Fraccion } from "./formula/fraccion";
import { mesesDe, periodicidadDe } from "./periodos";
import { limiteDeRangosCerrado } from "./rangos";
import { numeroExacto, type Regla } from "./semaforo";
import type { Unidad } from "./textos";
import type { Consolidacion, LimiteDeGrafica } from "./tipos";

/**
 * Por qué es parcial el acumulado de un compuesto (anexo 14C, §6.4): el de un componente no cubre todos sus periodos (empezó
 * a medirse después, cambió de fórmula o le falta un periodo). Sin nombrarlo.
 */
export const COMPONENTE_PARCIAL = "un componente no cubre todos los periodos";

/**
 * El rótulo de un compuesto con periodos medidos que se queda sin acumulado porque un componente no tiene resultado en
 * ninguno de ellos (anexo 14C, §6.4): no hay con qué juntarlo. Sin nombrarlo.
 */
export const SIN_ACUMULADO_POR_COMPONENTE = "Sin acumulado: un componente no tiene resultado en estos periodos";

/**
 * «acumulado de junio a diciembre»: desde el mes en que empieza el periodo `desde` (el primero que entró al acumulado de un
 * componente más fino) hasta el mes en que termina el periodo `periodo` del compuesto, sin año (anexo 14C, §6.3). Si son el
 * mismo mes, «acumulado solo de marzo».
 */
export function textoAcumulaDesde(desde: string, periodo: string): string {
  const inicio = MESES[mesesDe(desde)[0] - 1];
  const fin = MESES[mesesDe(periodo)[1] - 1];
  return inicio === fin ? `acumulado solo de ${inicio}` : `acumulado de ${inicio} a ${fin}`;
}

/** El año de una clave de periodo (`2026-T3` → 2026). */
export const anioDeClave = (clave: string): number => Number(clave.slice(0, 4));

/**
 * El periodo sin su año: «marzo», «tercer trimestre», «segundo bimestre»; un año entero es «año completo». La etiqueta no
 * depende de la zona: solo las fechas.
 */
export function nombreCorto(clave: string): string {
  if (periodicidadDe(clave) === "anual") return "año completo";
  const etiqueta = periodoDe(clave, "UTC")?.etiqueta ?? clave;
  return etiqueta.replace(/ de \d{4}$/, "");
}

/** Con su artículo cuando lo lleva: «el tercer trimestre», «el primer semestre»; un mes va solo («marzo»). */
export function conArticulo(clave: string, nombre: string): string {
  const p = periodicidadDe(clave);
  return p === "bimestral" || p === "trimestral" || p === "semestral" ? `el ${nombre}` : nombre;
}

/**
 * Cómo se nombra el periodo con el que se compara (spec §8.3): sin el año si es el de `anio` («el segundo trimestre»,
 * «marzo»), con él si no («abril de 2025», «el cuarto trimestre de 2025»); un año entero, por su número («2025»).
 */
export function etiquetaDeComparacion(clave: string, anio: number): string {
  if (periodicidadDe(clave) === "anual") return clave.slice(0, 4);
  const nombre = conArticulo(clave, nombreCorto(clave));
  return anioDeClave(clave) === anio ? nombre : `${nombre} de ${clave.slice(0, 4)}`;
}

/**
 * Lo que distingue una versión para el acumulado: la fórmula y las variables, con su consolidación (spec §8.10) y, la que sale
 * de otro indicador, de cuál y qué toma (anexo 14C, §6.4). Los tres campos de origen son obligatorios: un cargador que no los
 * traiga no compila, en lugar de firmar como antes en silencio.
 */
export type FirmaDeVersion = {
  id: number;
  numero: number;
  calculo: { formula: string };
  variables: readonly { letra: string; consolidacion: Consolidacion; origen: string; indicadorOrigenId: number | null; toma: string | null }[];
};

/**
 * La firma de la versión: «A/B*100|A:suma,B:suma». Una variable tomada de otro indicador añade su id y lo que toma
 * («A:ultimo:i7:valor»): cambiar el componente, o el valor por el cumplimiento, parte la racha. Las demás (propias, de un dato
 * compartido o del cálculo del sistema) firman como siempre: ninguna ficha de la 14A ni de la 14B cambia de racha.
 */
export const firmaDeVersion = (v: FirmaDeVersion): string =>
  `${v.calculo.formula.replace(/\s+/g, "")}|${[...v.variables]
    .map((x) => (x.origen === "indicador" ? `${x.letra}:${x.consolidacion}:i${x.indicadorOrigenId}:${x.toma}` : `${x.letra}:${x.consolidacion}`))
    .sort()
    .join(",")}`;

/**
 * La racha de cada versión: las versiones seguidas (por número) con la misma fórmula y las mismas variables forman una
 * sola, que se nombra por la primera. El acumulado se parte solo cuando cambian (spec §8.10; `firmaDeVersion`): un cambio
 * menor o de periodicidad no lo parte; cambiar de dónde sale una variable tomada, sí.
 */
export function rachasDe(versiones: readonly FirmaDeVersion[]): Map<number, { id: number; numero: number }> {
  const salida = new Map<number, { id: number; numero: number }>();
  let actual: { id: number; numero: number; firma: string } | null = null;
  for (const v of [...versiones].sort((a, b) => a.numero - b.numero)) {
    const f = firmaDeVersion(v);
    if (actual === null || actual.firma !== f) actual = { id: v.id, numero: v.numero, firma: f };
    salida.set(v.id, { id: actual.id, numero: actual.numero });
  }
  return salida;
}

/** «julio», «julio y agosto», «julio, agosto y septiembre»; con más de tres, cuántos. */
function enumerar(claves: readonly string[]): string {
  const nombres = claves.map((c) => conArticulo(c, nombreCorto(c)));
  if (nombres.length > 3) return `faltan ${nombres.length} periodos`;
  const lista = nombres.length === 1 ? nombres[0] : `${nombres.slice(0, -1).join(", ")} y ${nombres.at(-1)}`;
  return `falta ${lista}`;
}

/**
 * El rótulo del acumulado (spec §8.10): «Acumulado parcial: falta julio» si falta un periodo ya terminado; «Acumulado
 * desde julio, versión 2» si en el año rigieron fórmulas o variables distintas; los dos, juntos. `null` si no hace falta. En un
 * compuesto cuyo componente no cubre todos los periodos del tramo (`componenteParcial`, anexo 14C §6.4), «Acumulado parcial:
 * un componente no cubre todos los periodos», sin nombrarlo ni decir desde cuándo.
 */
export function rotuloDelAcumulado(faltan: readonly string[], desde: { clave: string; numero: number } | null, componenteParcial = false): string | null {
  const partes = [faltan.length > 0 ? enumerar(faltan) : null, componenteParcial ? COMPONENTE_PARCIAL : null].filter((p): p is string => p !== null);
  const parcial = partes.length > 0 ? partes.join("; ") : null;
  if (desde) {
    const inicio = `Acumulado desde ${conArticulo(desde.clave, nombreCorto(desde.clave))}, versión ${desde.numero}`;
    return parcial ? `${inicio}; parcial: ${parcial}` : inicio;
  }
  return parcial ? `Acumulado parcial: ${parcial}` : null;
}

/**
 * «Crítico por debajo de 63 %» (mayor es mejor) o «Crítico por encima de 40 min» (menor es mejor). Con los rangos
 * escritos, si el límite es de Crítico («Crítico ≤ 40»), «Crítico hasta 40 %» o, en menor es mejor, «Crítico desde 34 min».
 */
export function textoDelLimite(limite: Fraccion, regla: Pick<Regla, "tendencia"> & Partial<Pick<Regla, "modo" | "rangos">>, u: Unidad): string {
  const descendente = regla.tendencia === "descendente";
  const cerrado = regla.modo === "rangos" && regla.rangos ? limiteDeRangosCerrado(regla.rangos, regla.tendencia) : false;
  const lado = cerrado ? (descendente ? "desde" : "hasta") : descendente ? "por encima de" : "por debajo de";
  return `Crítico ${lado} ${numeroExacto(limite, u.decimales)}${u.sufijo}`;
}

/**
 * El límite de crítico de la gráfica a partir del de cada periodo (Tarea 19, D-7 y D-8): uno solo si todos los periodos
 * tienen el mismo; si no (una meta programada lo movió, o un periodo sin meta no lo tiene), uno por periodo. Sin ninguno,
 * `null`. Cada texto es el de `textoDelLimite`.
 */
export function limiteDeLaGrafica(porPeriodo: readonly ({ valor: number; texto: string } | null)[]): LimiteDeGrafica | null {
  const con = porPeriodo.filter((l): l is { valor: number; texto: string } => l !== null);
  const ultimo = con.at(-1);
  if (!ultimo) return null;
  if (con.length === porPeriodo.length && con.every((l) => l.valor === ultimo.valor)) return { valor: ultimo.valor, texto: ultimo.texto };
  return { porPeriodo: porPeriodo.map((l) => l?.valor ?? null), textos: porPeriodo.map((l) => l?.texto ?? null), texto: ultimo.texto };
}

/** «enero», «enero a marzo»: los meses de un tramo en palabras. */
export const mesesEnPalabras = (desde: number, hasta: number) => (desde === hasta ? MESES[desde - 1] : `${MESES[desde - 1]} a ${MESES[hasta - 1]}`);

/**
 * Reparte los doce meses de una fila de la matriz: cada candidata ocupa sus meses si están libres, de la de mayor
 * prioridad a la de menor (la periodicidad que rige pisa a la que quedó de otra); lo que queda libre se junta en tramos
 * vacíos (`vacio`). El resultado cubre de enero a diciembre, en orden, sin huecos ni solapes.
 */
export function repartirMeses<T extends { desdeMes: number; hastaMes: number }>(
  candidatas: readonly { celda: T; prioridad: number }[],
  vacio: (desdeMes: number, hastaMes: number) => T,
): T[] {
  const ocupados = new Array<boolean>(13).fill(false);
  const elegidas: T[] = [];
  for (const { celda } of [...candidatas].sort((a, b) => b.prioridad - a.prioridad)) {
    const meses = Array.from({ length: celda.hastaMes - celda.desdeMes + 1 }, (_, i) => celda.desdeMes + i);
    if (celda.desdeMes < 1 || celda.hastaMes > 12 || meses.some((m) => ocupados[m])) continue;
    for (const m of meses) ocupados[m] = true;
    elegidas.push(celda);
  }
  for (let m = 1; m <= 12; m++) {
    if (ocupados[m]) continue;
    let hasta = m;
    while (hasta < 12 && !ocupados[hasta + 1]) hasta++;
    elegidas.push(vacio(m, hasta));
    for (let k = m; k <= hasta; k++) ocupados[k] = true;
  }
  return elegidas.sort((a, b) => a.desdeMes - b.desdeMes);
}
