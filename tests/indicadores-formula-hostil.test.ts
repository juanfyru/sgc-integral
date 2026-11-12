import { describe, expect, it } from "vitest";
import { analizar } from "../src/lib/indicadores/formula/analizar";
import { evaluar } from "../src/lib/indicadores/formula/evaluar";

const HOSTILES = [
  "", "   ", "()", "A +", "* A", "A B", "A ** 2", "A ^ 2", "A % 2", "A == B", "A > B", "A ? B : C",
  "constructor", "__proto__", "process", "eval(1)", "Function(1)", "A.b", "A[0]", "A(1)", "max(A)", "abs(A; B)",
  "max(A, B)", "min()", ";", "A;B", "\"x\"", "'x'", "`x`", "${A}", "1e9", "0x10", "Ａ + 1", "A ＋ 1", "a + 1",
  "A\u0000B", "A‮B", "//", "/* */", "A + 1234567890123456",
];

describe("fórmulas hostiles", () => {
  it.each(HOSTILES)("rechaza %j sin lanzar", (s) => {
    expect(() => analizar(s)).not.toThrow();
    expect(analizar(s).ok).toBe(false);
  });
  it("límites de longitud y de profundidad, con mensaje", () => {
    expect(analizar("1+".repeat(150) + "1")).toEqual({ ok: false, error: "La fórmula no puede pasar de 300 caracteres" });
    expect(analizar("(".repeat(21) + "A" + ")".repeat(21))).toEqual({ ok: false, error: "La fórmula tiene demasiados niveles de paréntesis" });
    expect(analizar("(".repeat(20) + "A" + ")".repeat(20)).ok).toBe(true);
  });
  it("analizar y evaluar la peor fórmula admitida toma menos de 50 ms", () => {
    const peor = Array(18).fill("999999999999999").join("*");
    const t = performance.now();
    const a = analizar(peor);
    if (a.ok) evaluar(a.arbol, {});
    expect(performance.now() - t).toBeLessThan(50);
  });
});
