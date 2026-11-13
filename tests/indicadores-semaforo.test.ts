import { describe, expect, it } from "vitest";
import { comparar, fraccion } from "@/lib/indicadores/formula/fraccion";
import { rangosDeTexto, type RangosEnTexto } from "@/lib/indicadores/rangos";
import { cumpleMeta, errorDeRegla, limiteDeCritico, rangosEnPalabras, rangosEquivalentes, semaforoDe, type Regla } from "@/lib/indicadores/semaforo";
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
  it("los rangos, en palabras, sin dejar valores fuera de todo rango", () => {
    const min: Unidad = { sufijo: " min", decimales: 0 };
    expect(rangosEnPalabras(asc, pct)).toBe("Bien desde 90 % · Atención de 63 a 89,9 % · Crítico por debajo de 63 %");
    expect(rangosEnPalabras({ ...asc, meta: null, modo: null, umbralPct: null }, pct)).toBeNull();
    expect(rangosEnPalabras({ ...asc, meta: f("80") }, pct)).toBe("Bien desde 80 % · Atención de 56 a 79,9 % · Crítico por debajo de 56 %");
    expect(rangosEnPalabras({ ...asc, meta: f("90,25") }, pct)).toBe("Bien desde 90,25 % · Atención de 63,175 a menos de 90,25 % · Crítico por debajo de 63,175 %");
    expect(rangosEnPalabras(desc, min)).toBe("Bien hasta 30 min · Atención de más de 30 a 42,85 min · Crítico por encima de 42,85 min");
    const fijo: Regla = { ...desc, meta: f("0"), modo: "fijo", umbralPct: null, limite: f("2") };
    expect(rangosEnPalabras(fijo, min)).toBe("Bien hasta 0 min · Atención de más de 0 a 2 min · Crítico por encima de 2 min");
    const cte: Regla = { tendencia: "constante", meta: f("98"), metaMax: f("100"), modo: "fijo", umbralPct: null, limite: null, tolerancia: f("2") };
    expect(rangosEnPalabras(cte, pct)).toBe("Bien de 98 a 100 % · Atención hasta 2 puntos fuera del rango · Crítico más allá");
    expect(rangosEnPalabras({ ...cte, tolerancia: f("1") }, pct)).toContain("Atención hasta 1 punto fuera");
    expect(rangosEnPalabras({ ...cte, tolerancia: f("2") }, min)).toBe("Bien de 98 a 100 min · Atención hasta 2 min fuera del rango · Crítico más allá");
  });
  it("el modo relativo no sirve con una meta que no es positiva", () => {
    const mensaje = "Con meta 0 o negativa en tendencia ascendente, escriba los rangos del semáforo";
    expect(errorDeRegla({ ...asc, meta: f("0") })).toBe(mensaje);
    expect(errorDeRegla({ ...asc, meta: f("-5") })).toBe(mensaje);
    expect(errorDeRegla({ ...desc, meta: f("-5") })).toBe("Con meta negativa en tendencia descendente, escriba los rangos del semáforo");
    expect(errorDeRegla({ ...asc, meta: f("0"), modo: "fijo", umbralPct: null, limite: f("-1") })).toBeNull();
  });
  it("cumple: alcanzar la meta, sin importar el color", () => {
    expect(["99,99", "100"].map((v) => cumpleMeta(f(v), { ...asc, meta: f("100") }))).toEqual([false, true]);
    expect(["30", "30,01"].map((v) => cumpleMeta(f(v), desc))).toEqual([true, false]);
    const cte: Regla = { tendencia: "constante", meta: f("98"), metaMax: f("100"), modo: "fijo", umbralPct: null, limite: null, tolerancia: f("2") };
    expect(["97,99", "99", "98", "100", "100,01"].map((v) => cumpleMeta(f(v), cte))).toEqual([false, true, true, true, false]);
    expect(cumpleMeta(f("50"), { ...asc, meta: null })).toBeNull();
  });
  it("los rangos en modo «rangos»: palabras, semáforo y errores", () => {
    const t: RangosEnTexto = { bien: [{ signo: ">=", valor: "91" }], atencion: [{ signo: "entre", valor: "41", hasta: "90" }], critico: [{ signo: "<=", valor: "40" }] };
    const r: Regla = { ...asc, meta: f("100"), modo: "rangos", umbralPct: null, rangos: rangosDeTexto(t) };
    expect(rangosEnPalabras(r, pct)).toBe("Bien: ≥ 91 % · Atención: 41 a 90 % · Crítico: ≤ 40 %");
    expect(rangosEnPalabras({ ...r, rangos: rangosDeTexto({ ...t, atencion: [] }) }, pct)).toBe("Bien: ≥ 91 % · Crítico: ≤ 40 %");
    expect(rangosEnPalabras({ ...r, rangos: rangosDeTexto({ ...t, atencion: [{ signo: ">=", valor: "41" }, { signo: "<", valor: "30" }] }) }, pct))
      .toContain("Atención: ≥ 41 % y < 30 %");
    expect(["95", "90,5", "40,5"].map((v) => semaforoDe(f(v), r))).toEqual(["bien", "atencion", "critico"]);
    expect(limiteDeCritico(r)).toEqual(f("40"));
    expect(errorDeRegla(r)).toBeNull();
    expect(errorDeRegla({ ...r, meta: f("90") })).toBe("La meta debe quedar dentro del rango de Bien");
    expect(errorDeRegla({ ...r, rangos: null })).toBe("Escriba los rangos del semáforo");
  });
  it("una regla relativa o fija da lo mismo escrita como rangos", () => {
    const cte: Regla = { tendencia: "constante", meta: f("98"), metaMax: f("100"), modo: "fijo", umbralPct: null, limite: null, tolerancia: f("2") };
    const valores = ["0", "62,99", "63", "89,96", "90", "100", "30", "31", "42,85", "43", "95", "95,99", "96", "97", "98", "100", "101", "102", "102,01", "103"];
    for (const regla of [asc, desc, cte]) {
      const equivalente: Regla = { ...regla, modo: "rangos", rangos: rangosEquivalentes(regla) };
      expect(valores.map((v) => semaforoDe(f(v), equivalente))).toEqual(valores.map((v) => semaforoDe(f(v), regla)));
    }
    expect(rangosEquivalentes({ ...asc, meta: null })).toBeNull();
  });
});
