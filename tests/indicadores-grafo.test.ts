import { describe, expect, it } from "vitest";
import { alcanza, caminoDeCiclo, nivelesBajo, porNiveles, type Aristas } from "@/lib/indicadores/grafo";

const g = (o: Record<number, number[]>): Aristas => new Map(Object.entries(o).map(([k, v]) => [Number(k), v]));

describe("grafo de dependencias entre indicadores", () => {
  it("el camino de un ciclo", () => {
    expect(caminoDeCiclo(g({ 1: [2], 2: [3], 3: [1] }), 1)).toEqual([1, 2, 3, 1]);
    expect(caminoDeCiclo(g({ 1: [2], 2: [3] }), 1)).toBeNull();
  });
  it("niveles hacia abajo", () => {
    expect(nivelesBajo(g({ 1: [2], 2: [3], 3: [4], 4: [5], 5: [6] }), 1)).toBe(5);
    expect(nivelesBajo(g({}), 1)).toBe(0);
  });
  it("niveles hacia arriba desde las fuentes, sin repetir", () => {
    expect(porNiveles(g({ 2: [1], 3: [2], 4: [1] }), [1])).toEqual([[2, 4], [3]]);
  });
  it("en un diamante, el nivel es el del primer camino y el orden de cálculo lo da nivelesBajo", () => {
    // 3 toma a 1 y a 2, que toma a 1: queda en el nivel de 2, del que depende.
    const diamante = g({ 2: [1], 3: [1, 2] });
    expect(porNiveles(diamante, [1])).toEqual([[2, 3]]);
    expect([nivelesBajo(diamante, 2), nivelesBajo(diamante, 3)]).toEqual([1, 2]);
  });
  it("alcanza a través de dos saltos", () => {
    const a = g({ 1: [2], 2: [3] });
    expect(alcanza(a, 1, new Set([3]))).toBe(true);
    expect(alcanza(a, 1, new Set([9]))).toBe(false);
  });
});
