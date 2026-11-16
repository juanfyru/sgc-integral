/**
 * Las piezas puras de las lecturas de resultados (Fase 14A, Tarea 15; spec §8.10 y §12.7): las rachas de versiones del
 * acumulado, el rótulo del acumulado y el reparto de los doce meses de una fila de la matriz.
 */
import { describe, expect, it } from "vitest";
import {
  COMPONENTE_PARCIAL,
  etiquetaDeComparacion,
  firmaDeVersion,
  rachasDe,
  repartirMeses,
  rotuloDelAcumulado,
  SIN_ACUMULADO_POR_COMPONENTE,
  textoAcumulaDesde,
  type FirmaDeVersion,
} from "@/lib/indicadores/resultados";
import type { Consolidacion, Toma } from "@/lib/indicadores/tipos";

const version = (id: number, numero: number, formula: string, consolidacion: Consolidacion = "suma", letras = ["A", "B"]): FirmaDeVersion => ({
  id,
  numero,
  calculo: { formula },
  variables: letras.map((letra) => ({ letra, consolidacion, origen: "propia", indicadorOrigenId: null, toma: null })),
});

/** La versión `version(...)` con la letra A tomada del indicador `origen` (anexo 14C, §6.1): «cómo se junta» en «último». */
const conTomada = (v: FirmaDeVersion, origen: number, toma: Toma = "valor"): FirmaDeVersion => ({
  ...v,
  variables: v.variables.map((x) => (x.letra === "A" ? { ...x, consolidacion: "ultimo", origen: "indicador", indicadorOrigenId: origen, toma } : x)),
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

  it("la firma de una ficha sin variables tomadas es la de siempre (propias, compartidas y automáticas)", () => {
    expect(firmaDeVersion(version(1, 1, "A / B * 100"))).toBe("A/B*100|A:suma,B:suma");
    const otras = {
      ...version(1, 1, "A / B * 100"),
      variables: [
        { letra: "A", consolidacion: "ultimo" as const, origen: "compartida", indicadorOrigenId: null, toma: null },
        { letra: "B", consolidacion: "promedio" as const, origen: "automatica", indicadorOrigenId: null, toma: null },
      ],
    };
    expect(firmaDeVersion(otras)).toBe("A/B*100|A:ultimo,B:promedio");
  });

  it("una variable tomada de otro indicador firma de cuál y qué toma (anexo 14C, §6.4): cambiar el origen parte la racha", () => {
    expect(firmaDeVersion(conTomada(version(1, 1, "A / B * 100"), 7))).toBe("A/B*100|A:ultimo:i7:valor,B:suma");
    // Una propia «último» que pasa a tomada, con la misma fórmula y la misma consolidación.
    const propiaUltimo: FirmaDeVersion = {
      ...version(1, 1, "A / B * 100"),
      variables: version(1, 1, "").variables.map((x) => (x.letra === "A" ? { ...x, consolidacion: "ultimo" } : x)),
    };
    const aTomada = rachasDe([propiaUltimo, conTomada(version(2, 2, "A / B * 100"), 7)]);
    expect(aTomada.get(2)).toEqual({ id: 2, numero: 2 });
    // R1 por R2, y «valor» por «cumplimiento».
    const deOtro = rachasDe([conTomada(version(1, 1, "A / B * 100"), 7), conTomada(version(2, 2, "A / B * 100"), 8)]);
    expect(deOtro.get(2)).toEqual({ id: 2, numero: 2 });
    const otraToma = rachasDe([conTomada(version(1, 1, "A / B * 100"), 7), conTomada(version(2, 2, "A / B * 100"), 7, "cumplimiento")]);
    expect(otraToma.get(2)).toEqual({ id: 2, numero: 2 });
    // El mismo componente y lo mismo: una sola racha.
    const igual = rachasDe([conTomada(version(1, 1, "A / B * 100"), 7), conTomada(version(2, 2, "A/B*100"), 7)]);
    expect(igual.get(2)).toEqual({ id: 1, numero: 1 });
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

  it("en un compuesto (anexo 14C, §6.4): el componente que no cubre todos los periodos lo deja parcial, sin nombrarlo", () => {
    expect(COMPONENTE_PARCIAL).toBe("un componente no cubre todos los periodos");
    expect(rotuloDelAcumulado([], null, true)).toBe("Acumulado parcial: un componente no cubre todos los periodos");
    expect(rotuloDelAcumulado(["2026-07"], null, true)).toBe("Acumulado parcial: falta julio; un componente no cubre todos los periodos");
    expect(SIN_ACUMULADO_POR_COMPONENTE).toBe("Sin acumulado: un componente no tiene resultado en estos periodos");
  });

  it("la comparación nombra el periodo con su artículo y, si es de otro año, con el año", () => {
    expect(etiquetaDeComparacion("2026-T2", 2026)).toBe("el segundo trimestre");
    expect(etiquetaDeComparacion("2026-03", 2026)).toBe("marzo");
    expect(etiquetaDeComparacion("2025-04", 2026)).toBe("abril de 2025");
    expect(etiquetaDeComparacion("2025", 2026)).toBe("2025");
  });
});

describe("textoAcumulaDesde (anexo 14C, §6.3)", () => {
  it("dice desde qué mes acumula el componente hasta el último del periodo del compuesto, sin año", () => {
    expect(textoAcumulaDesde("2026-06", "2026-S2")).toBe("acumulado de junio a diciembre");
    expect(textoAcumulaDesde("2026-03", "2026-T1")).toBe("acumulado solo de marzo");
    expect(textoAcumulaDesde("2026-T3", "2026")).toBe("acumulado de julio a diciembre");
    expect(textoAcumulaDesde("2026-02", "2026-T1")).toBe("acumulado de febrero a marzo");
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
