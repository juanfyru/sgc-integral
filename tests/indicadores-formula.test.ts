import { describe, expect, it } from "vitest";
import {
  aDecimal,
  aTexto,
  comparar,
  dividir,
  entero,
  fraccion,
  multiplicar,
  UNO,
} from "../src/lib/indicadores/formula/fraccion";
import { analizar } from "../src/lib/indicadores/formula/analizar";
import { evaluar } from "../src/lib/indicadores/formula/evaluar";
import { enPalabras, formulaDeForma } from "../src/lib/indicadores/formula/formas";

const f = (t: string) => fraccion(t)!;
const valor = (formula: string, v: Record<string, string> = {}) => {
  const a = analizar(formula);
  if (!a.ok) throw new Error(a.error);
  return evaluar(a.arbol, Object.fromEntries(Object.entries(v).map(([k, x]) => [k, f(x)])));
};

describe("intérprete de fórmulas", () => {
  it("fraccion lee coma y punto y rechaza lo que no es un número", () => {
    expect(comparar(f("0,5"), f("0.5"))).toBe(0);
    expect(aTexto(f("-3,25"))).toBe("-13/4");
    for (const malo of ["", "1,2,3", "1e9", "0x10", "12a", "1234567890123456", "0,12345678901"]) expect(fraccion(malo)).toBeNull();
  });
  it("un tercio por tres da uno exacto", () => {
    expect(comparar(multiplicar(dividir(entero(1), entero(3))!, entero(3)), UNO)).toBe(0);
  });
  it("precedencia, paréntesis y menos unario", () => {
    expect(valor("2 + 3 * 4")).toEqual({ ok: true, valor: f("14") });
    expect(valor("(2 + 3) * 4")).toEqual({ ok: true, valor: f("20") });
    expect(valor("-A + 1", { A: "3" })).toEqual({ ok: true, valor: f("-2") });
  });
  it("las formas del spec", () => {
    expect(valor(formulaDeForma("porcentaje"), { A: "3", B: "5" })).toEqual({ ok: true, valor: f("60") });
    expect(valor(formulaDeForma("tasa", 1000), { A: "2", B: "400" })).toEqual({ ok: true, valor: f("5") });
    expect(analizar("A ÷ B × 100")).toEqual(analizar("A / B * 100"));
    expect(analizar("A / B * 100")).toMatchObject({ ok: true, variables: ["A", "B"] });
  });
  it("min, max y abs, con punto y coma entre argumentos y coma decimal", () => {
    expect(valor("max(A; 0,5)", { A: "0,2" })).toEqual({ ok: true, valor: f("0,5") });
    expect(valor("min(A; B)", { A: "7", B: "4" })).toEqual({ ok: true, valor: f("4") });
    expect(valor("abs(A - B)", { A: "4", B: "7" })).toEqual({ ok: true, valor: f("3") });
  });
  it("sin resultado, con su motivo", () => {
    expect(valor("A / B", { A: "1", B: "0" })).toEqual({ ok: false, motivo: "division_por_cero" });
    expect(valor("A / B", { A: "1" })).toEqual({ ok: false, motivo: "falta_variable", variable: "B" });
    expect(valor(Array(15).fill("999999999999999").join(" * "))).toEqual({ ok: false, motivo: "fuera_de_rango" });
  });
  it("aDecimal redondea o trunca, sin exponente", () => {
    expect(aDecimal(f("89,96"), 1, "redondear")).toBe("90.0");
    expect(aDecimal(f("89,96"), 1, "truncar")).toBe("89.9");
    expect(aDecimal(dividir(entero(1), entero(3))!, 2, "redondear")).toBe("0.33");
    expect(aDecimal(f("-0,05"), 1, "redondear")).toBe("-0.1");
    expect(aDecimal(f("-0,04"), 1, "redondear")).toBe("0.0");
  });
  it("la fórmula en palabras", () => {
    expect(enPalabras("A / B * 100", { A: "Auditorías ejecutadas", B: "Auditorías programadas" }))
      .toBe("(Auditorías ejecutadas ÷ Auditorías programadas) × 100");
  });
});
