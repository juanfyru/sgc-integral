import { describe, expect, it } from "vitest";
import { dividir, entero, fraccion } from "@/lib/indicadores/formula/fraccion";
import { rangosDeTexto } from "@/lib/indicadores/rangos";
import type { Regla } from "@/lib/indicadores/semaforo";
import { comparacion, fraseDeResultado, resultadoFrenteAMeta, textoMeta, textoValor, type Unidad } from "@/lib/indicadores/textos";

const f = (t: string) => fraccion(t)!;
const asc: Regla = { tendencia: "ascendente", meta: f("90"), metaMax: null, modo: "relativo", umbralPct: 70, limite: null, tolerancia: null };
const desc: Regla = { ...asc, tendencia: "descendente", meta: f("30") };
/** Meta 100; Bien desde 91 (Bien empieza antes de la meta), Atención de 41 a 90, Crítico hasta 40. */
const reglaConRangos = (): Regla => ({
  ...asc,
  meta: f("100"),
  modo: "rangos",
  umbralPct: null,
  rangos: rangosDeTexto({ bien: [{ signo: ">=", valor: "91" }], atencion: [{ signo: "entre", valor: "41", hasta: "90" }], critico: [{ signo: "<=", valor: "40" }] }),
});
const pct: Unidad = { sufijo: " %", decimales: 1 };

describe("textos de indicadores", () => {
  it("la cifra nunca contradice el veredicto y no lleva ceros de relleno", () => {
    expect(textoValor(f("89,96"), pct, asc)).toBe("89,9 %");
    expect(textoValor(f("92"), pct)).toBe("92 %");
    expect(textoValor(dividir(entero(250), entero(3))!, pct)).toBe("83,3 %");
    expect(textoValor(f("89,96"), pct)).toBe("90 %");
  });
  it("si el truncado a los decimales de la unidad aún contradice, agrega decimales", () => {
    const min: Unidad = { sufijo: " min", decimales: 0 };
    expect(textoValor(f("30,04"), min, desc)).toBe("30,04 min");
    expect(textoValor(f("30,04"), min)).toBe("30 min");
    expect(textoValor(f("30,5"), min, desc)).toBe("31 min");
  });
  it("la meta en palabras cortas", () => {
    const min: Unidad = { sufijo: " min", decimales: 0 };
    expect(textoMeta(asc, pct)).toBe("≥ 90 %");
    expect(textoMeta(desc, min)).toBe("≤ 30 min");
    expect(textoMeta({ ...asc, tendencia: "constante", meta: f("98"), metaMax: f("100") }, pct)).toBe("98 a 100 %");
    expect(textoMeta({ ...asc, meta: null }, pct)).toBe("sin meta");
  });
  it("la frase de cada caso", () => {
    const min: Unidad = { sufijo: " min", decimales: 0 };
    expect(fraseDeResultado({ resultado: f("92"), semaforo: "bien", cumple: true, noAplica: false, motivo: null }, asc, pct)).toBe("Cumple: 92 % frente a una meta de 90 %.");
    expect(fraseDeResultado({ resultado: f("60"), semaforo: "critico", cumple: false, noAplica: false, motivo: null }, asc, pct)).toBe("No cumple: 60 % frente a una meta de 90 %.");
    expect(fraseDeResultado({ resultado: f("80"), semaforo: "atencion", cumple: false, noAplica: false, motivo: null }, asc, pct)).toBe("No cumple: 80 % frente a una meta de 90 %.");
    expect(fraseDeResultado({ resultado: f("28"), semaforo: "bien", cumple: true, noAplica: false, motivo: null }, desc, min)).toBe("Cumple: 28 min frente a una meta de máximo 30 min.");
    const cte: Regla = { ...asc, tendencia: "constante", meta: f("98"), metaMax: f("100"), modo: "fijo", umbralPct: null, tolerancia: f("2") };
    expect(fraseDeResultado({ resultado: f("99"), semaforo: "bien", cumple: true, noAplica: false, motivo: null }, cte, pct)).toBe("Cumple: 99 % dentro del rango de 98 a 100 %.");
    expect(fraseDeResultado({ resultado: f("97"), semaforo: "atencion", cumple: false, noAplica: false, motivo: null }, cte, pct)).toBe("No cumple: 97 % fuera del rango de 98 a 100 %.");
    const uno: Regla = { ...cte, meta: f("50"), metaMax: null };
    expect(fraseDeResultado({ resultado: f("50"), semaforo: "bien", cumple: true, noAplica: false, motivo: null }, uno, min)).toBe("Cumple: 50 min frente a una meta de 50 min.");
    expect(fraseDeResultado({ resultado: f("50"), semaforo: "bien", cumple: true, noAplica: false, motivo: null }, { ...uno, metaMax: f("50") }, min)).toBe("Cumple: 50 min frente a una meta de 50 min.");
    expect(fraseDeResultado({ resultado: f("92"), semaforo: null, cumple: null, noAplica: false, motivo: null }, { ...asc, meta: null }, pct)).toBe("92 %, sin meta para este periodo.");
    expect(fraseDeResultado({ resultado: null, semaforo: null, cumple: null, noAplica: true, motivo: "no había auditorías programadas" }, asc, pct)).toBe("No aplica: no había auditorías programadas.");
    // Un motivo que ya termina en punto no lleva otro (ronda 1 de la Tarea 19, D-4).
    expect(fraseDeResultado({ resultado: null, semaforo: null, cumple: null, noAplica: true, motivo: "No hubo casos que medir." }, asc, pct)).toBe("No aplica: No hubo casos que medir.");
    expect(fraseDeResultado({ resultado: null, semaforo: null, cumple: null, noAplica: true, motivo: "¿Sin auditorías?" }, asc, pct)).toBe("No aplica: ¿Sin auditorías?");
    expect(fraseDeResultado({ resultado: null, semaforo: null, cumple: null, noAplica: false, motivo: "división por cero." }, asc, pct)).toBe("Sin resultado: división por cero.");
    expect(fraseDeResultado({ resultado: null, semaforo: null, cumple: null, noAplica: false, motivo: null }, asc, pct)).toBe("Sin dato: no se reportó.");
    expect(fraseDeResultado({ resultado: null, semaforo: null, cumple: null, noAplica: false, motivo: "división por cero" }, asc, pct)).toBe("Sin resultado: división por cero.");
  });
  it("el resultado frente a la meta, sin el veredicto, para las alertas", () => {
    const cte: Regla = { ...asc, tendencia: "constante", meta: f("98"), metaMax: f("100"), modo: "fijo", umbralPct: null, tolerancia: f("2") };
    expect(resultadoFrenteAMeta({ resultado: f("83,33"), semaforo: "atencion", cumple: false }, asc, pct)).toBe("83,3 % frente a una meta de 90 %");
    expect(resultadoFrenteAMeta({ resultado: f("97"), semaforo: "atencion", cumple: false }, cte, pct)).toBe("97 % fuera del rango de 98 a 100 %");
    expect(resultadoFrenteAMeta({ resultado: f("89,96"), semaforo: "atencion", cumple: false }, asc, pct)).toBe("89,9 % frente a una meta de 90 %");
    expect(resultadoFrenteAMeta({ resultado: f("92"), semaforo: null, cumple: null }, { ...asc, meta: null }, pct)).toBeNull();
    expect(resultadoFrenteAMeta({ resultado: null, semaforo: null, cumple: null }, asc, pct)).toBeNull();
  });
  it("la frase usa la misma cifra que el veredicto", () => {
    expect(fraseDeResultado({ resultado: f("89,96"), semaforo: "atencion", cumple: false, noAplica: false, motivo: null }, asc, pct)).toBe("No cumple: 89,9 % frente a una meta de 90 %.");
  });
  it("cumplir es alcanzar la meta: un Bien que no la alcanza dice «No cumple»", () => {
    const rangos = reglaConRangos();
    const bienSinCumplir = { resultado: f("95"), semaforo: "bien" as const, cumple: false, noAplica: false, motivo: null };
    expect(fraseDeResultado(bienSinCumplir, rangos, { sufijo: " %", decimales: 0 })).toBe("No cumple: 95 % frente a una meta de 100 %.");
    const cte = { ...rangos, tendencia: "constante" as const, meta: f("98"), metaMax: f("100") };
    expect(resultadoFrenteAMeta({ resultado: f("97"), semaforo: "bien", cumple: false }, cte, pct)).toBe("97 % fuera del rango de 98 a 100 %");
    expect(resultadoFrenteAMeta({ resultado: f("99"), semaforo: "atencion", cumple: true }, cte, pct)).toBe("99 % dentro del rango de 98 a 100 %");
  });
  it("la cifra no contradice «cumple» tampoco: 99,96 con meta 100 no se muestra «100»", () => {
    const rangos = reglaConRangos();
    expect(textoValor(f("99,96"), { sufijo: " %", decimales: 0 }, rangos)).toBe("99 %");
    expect(textoValor(f("100"), { sufijo: " %", decimales: 0 }, rangos)).toBe("100 %");
    expect(textoValor(f("99,4"), { sufijo: " %", decimales: 0 }, rangos)).toBe("99 %");
  });
  it("la comparación dice hacia dónde fue el valor y si eso es mejorar", () => {
    expect(comparacion(f("60"), { valor: f("83"), etiqueta: "el segundo trimestre" }, null, "ascendente", pct)).toEqual({
      texto: "23 puntos menos que en el segundo trimestre",
      flecha: "baja",
      mejora: false,
    });
    expect(comparacion(f("34"), { valor: f("38"), etiqueta: "septiembre" }, { valor: f("32"), etiqueta: "octubre de 2025" }, "descendente", { sufijo: " min", decimales: 0 })).toEqual({
      texto: "4 min menos que en septiembre; 2 min más que en octubre de 2025",
      flecha: "baja",
      mejora: true,
    });
    expect(comparacion(f("60"), null, null, "ascendente", pct)).toBeNull();
  });
  it("igual, un solo punto, constante y solo el año anterior", () => {
    expect(comparacion(f("60"), { valor: f("60"), etiqueta: "marzo" }, null, "ascendente", pct)).toEqual({ texto: "igual que en marzo", flecha: "igual", mejora: null });
    expect(comparacion(f("61"), { valor: f("60"), etiqueta: "marzo" }, null, "ascendente", pct)).toEqual({ texto: "1 punto más que en marzo", flecha: "sube", mejora: true });
    expect(comparacion(f("61"), { valor: f("60"), etiqueta: "marzo" }, null, "constante", pct)!.mejora).toBeNull();
    expect(comparacion(f("40"), null, { valor: f("32"), etiqueta: "octubre de 2025" }, "descendente", { sufijo: " min", decimales: 0 })).toEqual({
      texto: "8 min más que en octubre de 2025",
      flecha: "sube",
      mejora: false,
    });
    expect(comparacion(f("5"), { valor: f("2"), etiqueta: "marzo" }, null, "ascendente", { sufijo: "", decimales: 0 })!.texto).toBe("3 más que en marzo");
  });
});
