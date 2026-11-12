/**
 * Las piezas puras de las lecturas de resultados (Fase 14A, Tarea 15; spec §8.10 y §12.7): las rachas de versiones del
 * acumulado, el rótulo del acumulado y el reparto de los doce meses de una fila de la matriz.
 */
import { describe, expect, it } from "vitest";
import { etiquetaDeComparacion, rachasDe, repartirMeses, rotuloDelAcumulado, type FirmaDeVersion } from "@/lib/indicadores/resultados";
import type { Consolidacion } from "@/lib/indicadores/tipos";

const version = (id: number, numero: number, formula: string, consolidacion: Consolidacion = "suma", letras = ["A", "B"]): FirmaDeVersion => ({
  id,
  numero,
  calculo: { formula },
  variables: letras.map((letra) => ({ letra, consolidacion })),
});

describe("rachasDe", () => {
  it("un cambio menor (o de meta, o de periodicidad) con la misma fórmula y variables no parte la racha", () => {
    const r = rachasDe([version(30, 3, "A / B * 100"), version(10, 1, "A/B*100"), version(20, 2, "A / B * 100")]);
    expect([r.get(10), r.get(20), r.get(30)]).toEqual([
      { id: 10, numero: 1 },
      { id: 10, numero: 1 },
      { id: 10, numero: 1 },
    ]);
  });

  it("un cambio de consolidación o de variables parte la racha, y A-B-A son tres rachas", () => {
    const consolidacion = rachasDe([version(1, 1, "A / B * 100"), version(2, 2, "A / B * 100", "promedio")]);
    expect(consolidacion.get(2)).toEqual({ id: 2, numero: 2 });
    const variables = rachasDe([version(1, 1, "A / B * 100"), version(2, 2, "A / B * 100", "suma", ["A", "B", "C"])]);
    expect(variables.get(2)).toEqual({ id: 2, numero: 2 });
    const aba = rachasDe([version(1, 1, "A / B * 100"), version(2, 2, "(A + C) / B * 100", "suma", ["A", "B", "C"]), version(3, 3, "A / B * 100")]);
    expect([aba.get(1)?.id, aba.get(2)?.id, aba.get(3)?.id]).toEqual([1, 2, 3]);
  });
});

describe("rotuloDelAcumulado", () => {
  it("dice lo que falta, desde dónde rige la racha, las dos cosas o nada", () => {
    expect(rotuloDelAcumulado([], null)).toBeNull();
    expect(rotuloDelAcumulado(["2026-07"], null)).toBe("Acumulado parcial: falta julio");
    expect(rotuloDelAcumulado(["2026-T3"], null)).toBe("Acumulado parcial: falta el tercer trimestre");
    expect(rotuloDelAcumulado(["2026-07", "2026-08", "2026-09"], null)).toBe("Acumulado parcial: falta julio, agosto y septiembre");
    expect(rotuloDelAcumulado(["2026-01", "2026-02", "2026-03", "2026-04"], null)).toBe("Acumulado parcial: faltan 4 periodos");
    expect(rotuloDelAcumulado([], { clave: "2026-07", numero: 2 })).toBe("Acumulado desde julio, versión 2");
    expect(rotuloDelAcumulado(["2026-09"], { clave: "2026-07", numero: 2 })).toBe("Acumulado desde julio, versión 2; parcial: falta septiembre");
  });

  it("la comparación nombra el periodo con su artículo y, si es de otro año, con el año", () => {
    expect(etiquetaDeComparacion("2026-T2", 2026)).toBe("el segundo trimestre");
    expect(etiquetaDeComparacion("2026-03", 2026)).toBe("marzo");
    expect(etiquetaDeComparacion("2025-04", 2026)).toBe("abril de 2025");
    expect(etiquetaDeComparacion("2025", 2026)).toBe("2025");
  });
});

describe("repartirMeses", () => {
  type C = { desdeMes: number; hastaMes: number; quien: string };
  const vacia = (desdeMes: number, hastaMes: number): C => ({ desdeMes, hastaMes, quien: "vacía" });

  it("cubre los doce meses en orden: lo que rige pisa a lo de menor prioridad y los huecos se juntan", () => {
    const celdas = repartirMeses<C>(
      [
        { celda: { desdeMes: 7, hastaMes: 7, quien: "julio de la ficha anterior" }, prioridad: 1 },
        { celda: { desdeMes: 7, hastaMes: 9, quien: "T3" }, prioridad: 10_002 },
        { celda: { desdeMes: 4, hastaMes: 4, quien: "abril" }, prioridad: 10_001 },
        { celda: { desdeMes: 13, hastaMes: 13, quien: "fuera" }, prioridad: 9 },
      ],
      vacia,
    );
    expect(celdas.map((c) => [c.desdeMes, c.hastaMes, c.quien])).toEqual([
      [1, 3, "vacía"],
      [4, 4, "abril"],
      [5, 6, "vacía"],
      [7, 9, "T3"],
      [10, 12, "vacía"],
    ]);
    expect(repartirMeses<C>([], vacia)).toEqual([vacia(1, 12)]);
  });
});
