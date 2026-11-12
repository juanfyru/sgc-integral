import { describe, expect, it } from "vitest";
import { acumulado, type PeriodoMedido } from "@/lib/indicadores/acumulado";
import { calcular, variacionExcesiva, type FichaDeCalculo } from "@/lib/indicadores/calculo";
import { analizar } from "@/lib/indicadores/formula/analizar";
import { comparar, fraccion } from "@/lib/indicadores/formula/fraccion";
import type { Regla } from "@/lib/indicadores/semaforo";

const f = (t: string) => fraccion(t)!;
const asc: Regla = { tendencia: "ascendente", meta: f("90"), metaMax: null, modo: "relativo", umbralPct: 70, limite: null, tolerancia: null };
const porcentaje = (): FichaDeCalculo => {
  const a = analizar("A / B * 100");
  if (!a.ok) throw new Error();
  return { arbol: a.arbol, letras: ["A", "B"], resultadoMin: null, resultadoMax: f("100") };
};
const sola = (formula: string, letras: string[]): FichaDeCalculo => {
  const a = analizar(formula);
  if (!a.ok) throw new Error();
  return { arbol: a.arbol, letras, resultadoMin: null, resultadoMax: null };
};
const p = (clave: string, A: string, B: string, versionId = 1): PeriodoMedido => ({ clave, versionId, noAplica: false, valores: { A: f(A), B: f(B) } });

describe("cálculo de una medición", () => {
  it("calcular: resultado, semáforo, límites y división por cero", () => {
    expect(calcular(porcentaje(), { A: f("3"), B: f("5") }, asc)).toMatchObject({ completo: true, semaforo: "critico", sinResultado: null, fueraDeLimites: false });
    expect(calcular(porcentaje(), { A: f("3") }, asc)).toMatchObject({ completo: false, resultado: null });
    expect(calcular(porcentaje(), { A: f("3"), B: f("0") }, asc)).toMatchObject({ completo: true, resultado: null, sinResultado: "division_por_cero", semaforo: null });
    expect(calcular(porcentaje(), { A: f("6"), B: f("5") }, asc).fueraDeLimites).toBe(true);
  });
  it("variación que pide confirmación", () => {
    expect(variacionExcesiva(f("60"), f("83"), 30)).toBe(false);
    expect(variacionExcesiva(f("50"), f("83"), 30)).toBe(true);
    expect(variacionExcesiva(f("50"), null, 30)).toBe(false);
    expect(variacionExcesiva(f("5"), f("0"), 30)).toBe(true);
    expect(variacionExcesiva(f("0"), f("0"), 30)).toBe(false);
  });
});

describe("acumulado", () => {
  it("el acumulado sale de las sumas, no del promedio de los porcentajes", () => {
    const r = acumulado([p("2026-T1", "5", "5"), p("2026-T2", "5", "6"), p("2026-T3", "3", "5")], {
      versionId: 1,
      calculo: porcentaje(),
      consolidacion: { A: "suma", B: "suma" },
      esperados: ["2026-T1", "2026-T2", "2026-T3"],
      regla: asc,
    });
    expect(comparar(r.resultado!, f("81,25"))).toBe(0);
    expect(r).toMatchObject({ semaforo: "atencion", faltan: [], desde: "2026-T1" });
  });
  const valor = (clave: string, A: string): PeriodoMedido => ({ clave, versionId: 1, noAplica: false, valores: { A: f(A) } });
  const ficha = (consolidacion: "suma" | "ultimo" | "promedio", esperados: string[], versionId = 1) => ({
    versionId,
    calculo: sola("A", ["A"]),
    consolidacion: { A: consolidacion },
    esperados,
    regla: asc,
  });
  it("«último valor» toma el del último periodo", () => {
    const r = acumulado([valor("2026-T1", "100"), valor("2026-T2", "120"), valor("2026-T3", "90")], ficha("ultimo", []));
    expect(comparar(r.resultado!, f("90"))).toBe(0);
  });
  it("«promedio» promedia los valores de las variables", () => {
    const r = acumulado([valor("2026-T1", "100"), valor("2026-T2", "120"), valor("2026-T3", "90")], ficha("promedio", []));
    expect(r.resultado).toEqual({ n: BigInt(310), d: BigInt(3) });
    expect(r.valores.A).toEqual({ n: BigInt(310), d: BigInt(3) });
  });
  it("un periodo «no aplica» se salta", () => {
    const noAplica: PeriodoMedido = { clave: "2026-T2", versionId: 1, noAplica: true, valores: null };
    const r = acumulado([valor("2026-T1", "100"), noAplica, valor("2026-T3", "90")], ficha("suma", ["2026-T1", "2026-T2", "2026-T3"]));
    expect(comparar(r.resultado!, f("190"))).toBe(0);
    expect(r.faltan).toEqual([]);
  });
  it("lo que falta se nombra: un periodo esperado sin periodo, o sin dato", () => {
    const sinDato: PeriodoMedido = { clave: "2026-T3", versionId: 1, noAplica: false, valores: null };
    const r = acumulado([valor("2026-T1", "100"), sinDato], ficha("suma", ["2026-T1", "2026-T2", "2026-T3"]));
    expect(r.faltan).toEqual(["2026-T2", "2026-T3"]);
    expect(comparar(r.resultado!, f("100"))).toBe(0);
  });
  it("otra versión no entra, y «desde» es el primer periodo de la versión vigente", () => {
    const r = acumulado(
      [valor("2026-T1", "1000"), { ...valor("2026-T2", "10"), versionId: 2 }, { ...valor("2026-T3", "20"), versionId: 2 }],
      ficha("suma", ["2026-T1", "2026-T2", "2026-T3"], 2),
    );
    expect(comparar(r.resultado!, f("30"))).toBe(0);
    expect(r.desde).toBe("2026-T2");
    expect(r.faltan).toEqual([]);
  });
  it("un periodo al que le falta una letra cuenta como «sin dato» y no alimenta a las demás", () => {
    const parcial: PeriodoMedido = { clave: "2026-T2", versionId: 1, noAplica: false, valores: { A: f("5") } };
    const r = acumulado([p("2026-T1", "5", "5"), parcial], { versionId: 1, calculo: porcentaje(), consolidacion: { A: "suma", B: "suma" }, esperados: ["2026-T1", "2026-T2"], regla: asc });
    expect(r.faltan).toEqual(["2026-T2"]);
    expect(r.valores).toEqual({ A: f("5"), B: f("5") });
    expect(comparar(r.resultado!, f("100"))).toBe(0);
  });
  it("sin periodos medidos no hay resultado", () => {
    const r = acumulado([], ficha("suma", ["2026-T1"]));
    expect(r).toMatchObject({ resultado: null, semaforo: null, faltan: ["2026-T1"], desde: null });
  });
  it("una división por cero del acumulado se reporta como motivo", () => {
    const r = acumulado([p("2026-T1", "5", "0")], { versionId: 1, calculo: porcentaje(), consolidacion: { A: "suma", B: "suma" }, esperados: [], regla: asc });
    expect(r).toMatchObject({ resultado: null, sinResultado: "division_por_cero", semaforo: null });
  });
});
