import { describe, expect, it } from "vitest";
import { comparar, fraccion } from "@/lib/indicadores/formula/fraccion";
import { errorDeRegla, limiteDeCritico, rangosEnPalabras, semaforoDe, type Regla } from "@/lib/indicadores/semaforo";
import type { Unidad } from "@/lib/indicadores/textos";

const f = (t: string) => fraccion(t)!;
const asc: Regla = { tendencia: "ascendente", meta: f("90"), metaMax: null, modo: "relativo", umbralPct: 70, limite: null, tolerancia: null };
const desc: Regla = { ...asc, tendencia: "descendente", meta: f("30") };
const pct: Unidad = { sufijo: " %", decimales: 1 };

describe("semáforo", () => {
  it("ascendente, relativo a la meta, con los bordes exactos", () => {
    expect(comparar(limiteDeCritico(asc)!, f("63"))).toBe(0);
    expect(["90", "89,96", "63", "62,99"].map((v) => semaforoDe(f(v), asc))).toEqual(["bien", "atencion", "atencion", "critico"]);
  });
  it("descendente: el límite es la meta dividida por el umbral", () => {
    expect(["30", "31", "42,85", "43"].map((v) => semaforoDe(f(v), desc))).toEqual(["bien", "atencion", "atencion", "critico"]);
  });
  it("meta 0 en descendente", () => {
    expect(errorDeRegla({ ...desc, meta: f("0") })).toBe("Con meta 0 en tendencia descendente, escriba los rangos del semáforo");
    const fijo: Regla = { ...desc, meta: f("0"), modo: "fijo", umbralPct: null, limite: f("2") };
    expect(errorDeRegla(fijo)).toBeNull();
    expect(["0", "1", "2", "3"].map((v) => semaforoDe(f(v), fijo))).toEqual(["bien", "atencion", "atencion", "critico"]);
  });
  it("constante: un rango con tolerancia", () => {
    const cte: Regla = { tendencia: "constante", meta: f("98"), metaMax: f("100"), modo: "fijo", umbralPct: null, limite: null, tolerancia: f("2") };
    expect(["99", "97", "95", "101", "103"].map((v) => semaforoDe(f(v), cte))).toEqual(["bien", "atencion", "critico", "atencion", "critico"]);
    expect(["98", "100", "96", "102", "95,99", "102,01"].map((v) => semaforoDe(f(v), cte))).toEqual(["bien", "bien", "atencion", "atencion", "critico", "critico"]);
    expect(errorDeRegla(cte)).toBeNull();
  });
  it("sin meta no hay semáforo, y un límite del lado equivocado se rechaza", () => {
    expect(semaforoDe(f("50"), { ...asc, meta: null, modo: null, umbralPct: null })).toBeNull();
    expect(errorDeRegla({ ...asc, meta: null, modo: null, umbralPct: null })).toBeNull();
    expect(errorDeRegla({ ...asc, modo: "fijo", umbralPct: null, limite: f("95") })).toBe("El límite de crítico debe quedar por debajo de la meta");
    expect(errorDeRegla({ ...desc, modo: "fijo", umbralPct: null, limite: f("25") })).toBe("El límite de crítico debe quedar por encima de la meta");
    expect(errorDeRegla({ ...asc, modo: "fijo", umbralPct: null, limite: null })).toBe("Escriba el límite de crítico");
    expect(errorDeRegla({ ...asc, umbralPct: 100 })).toBe("El umbral de atención debe estar entre 1 y 99 %");
    expect(errorDeRegla({ ...asc, modo: null })).toBe("Elija el modo del semáforo");
    expect(errorDeRegla(asc)).toBeNull();
  });
  it("los rangos, en palabras", () => {
    expect(rangosEnPalabras(asc, pct)).toBe("Bien desde 90 % · Atención de 63 a 89,9 % · Crítico por debajo de 63 %");
    expect(rangosEnPalabras({ ...asc, meta: null, modo: null, umbralPct: null }, pct)).toBeNull();
    const min: Unidad = { sufijo: " min", decimales: 0 };
    expect(rangosEnPalabras(desc, min)).toContain("Bien hasta 30 min");
  });
});
