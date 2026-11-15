/**
 * El grafo de dependencias entre indicadores: cada indicador y los componentes que toma (anexo 14C). Funciones puras,
 * sin Node ni BD. Las usan la ficha (ciclos y niveles) y la propagación de cambios.
 */
import { MAXIMO_NIVELES } from "./tipos";

/** Indicador → los indicadores que toma. */
export type Aristas = ReadonlyMap<number, readonly number[]>;

/**
 * El camino desde `desde` hasta el primer indicador que se repite en él (`[1, 2, 3, 1]`), o `null` si no hay ciclo
 * alcanzable.
 */
export function caminoDeCiclo(aristas: Aristas, desde: number): number[] | null {
  const camino: number[] = [];
  const enCamino = new Set<number>();
  const sinCiclo = new Set<number>();
  const visitar = (nodo: number): boolean => {
    camino.push(nodo);
    enCamino.add(nodo);
    for (const hijo of aristas.get(nodo) ?? []) {
      if (enCamino.has(hijo)) {
        camino.push(hijo);
        return true;
      }
      if (!sinCiclo.has(hijo) && visitar(hijo)) return true;
    }
    camino.pop();
    enCamino.delete(nodo);
    sinCiclo.add(nodo);
    return false;
  };
  return visitar(desde) ? camino : null;
}

/** Cuántos niveles de indicadores hay por debajo de `desde` (0 si no toma a nadie). Un ciclo no suma niveles. */
export function nivelesBajo(aristas: Aristas, desde: number): number {
  const memo = new Map<number, number>();
  const enCamino = new Set<number>();
  const profundidad = (nodo: number): number => {
    const guardado = memo.get(nodo);
    if (guardado !== undefined) return guardado;
    enCamino.add(nodo);
    let maximo = 0;
    for (const hijo of aristas.get(nodo) ?? []) if (!enCamino.has(hijo)) maximo = Math.max(maximo, 1 + profundidad(hijo));
    enCamino.delete(nodo);
    memo.set(nodo, maximo);
    return maximo;
  };
  return profundidad(desde);
}

/** ¿Desde `desde` se llega, tomando componentes de componentes, a alguno de los `destinos`? */
export function alcanza(aristas: Aristas, desde: number, destinos: ReadonlySet<number>): boolean {
  const vistos = new Set<number>();
  const pendientes = [...(aristas.get(desde) ?? [])];
  while (pendientes.length > 0) {
    const nodo = pendientes.pop()!;
    if (destinos.has(nodo)) return true;
    if (vistos.has(nodo)) continue;
    vistos.add(nodo);
    pendientes.push(...(aristas.get(nodo) ?? []));
  }
  return false;
}

/**
 * Los indicadores que dependen de las `fuentes`, nivel a nivel: quienes las toman, después quienes toman a esos, hasta
 * `MAXIMO_NIVELES` y sin repetir. Cada nivel va en orden ascendente.
 */
export function porNiveles(aristas: Aristas, fuentes: readonly number[]): number[][] {
  const vistos = new Set<number>(fuentes);
  let actuales = new Set<number>(fuentes);
  const niveles: number[][] = [];
  while (niveles.length < MAXIMO_NIVELES) {
    const siguientes: number[] = [];
    for (const [indicador, componentes] of aristas) {
      if (!vistos.has(indicador) && componentes.some((c) => actuales.has(c))) siguientes.push(indicador);
    }
    if (siguientes.length === 0) break;
    siguientes.sort((a, b) => a - b);
    for (const s of siguientes) vistos.add(s);
    niveles.push(siguientes);
    actuales = new Set(siguientes);
  }
  return niveles;
}
