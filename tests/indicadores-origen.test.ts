import { describe, expect, it } from "vitest";
import { alguienMide, alguienMideCon, esAjena, esperaUnDato, faltaSegunOrigen, letrasAjenas, letrasPropias } from "@/lib/indicadores/origen";

const v = (letra: string, origen: "propia" | "compartida" | "automatica" | "indicador") => ({ letra, origen });

describe("origen de las variables", () => {
  it("separa las letras propias de las ajenas (compartida o indicador)", () => {
    const vs = [v("A", "propia"), v("B", "compartida"), v("C", "indicador"), v("D", "automatica")];
    expect(letrasPropias(vs)).toEqual(["A"]);
    expect(letrasAjenas(vs)).toEqual(["B", "C"]);
    expect(["propia", "compartida", "indicador", "automatica", null, undefined].map(esAjena)).toEqual([false, true, true, false, false, false]);
  });
  it("alguien mide solo una ficha manual con alguna variable propia", () => {
    expect(alguienMide({ origenDato: "automatico", variables: [v("A", "propia")] })).toBe(false);
    expect(alguienMide({ origenDato: "manual", variables: [v("A", "compartida"), v("B", "indicador")] })).toBe(false);
    expect(alguienMide({ origenDato: "manual", variables: [v("A", "propia"), v("B", "compartida")] })).toBe(true);
  });
  it("qué falta según el origen", () => {
    const base = { mide: true, reportada: false, faltanAjenas: false, analisisCompleto: true };
    expect(faltaSegunOrigen({ ...base, faltanAjenas: true })).toBe("reporte");
    expect(faltaSegunOrigen({ ...base, reportada: true, faltanAjenas: true })).toBe("dato");
    expect(faltaSegunOrigen({ ...base, mide: false, faltanAjenas: true })).toBe("dato");
    expect(faltaSegunOrigen({ ...base, reportada: true, analisisCompleto: false })).toBe("analisis");
    expect(faltaSegunOrigen({ ...base, reportada: true })).toBe("reporte");
  });
  it("alguien mide con solo las letras propias, como alguienMide", () => {
    expect(alguienMideCon("manual", ["A"])).toBe(true);
    expect(alguienMideCon("manual", [])).toBe(false);
    expect(alguienMideCon("automatico", ["A"])).toBe(false);
  });
  /**
   * La única regla de «Falta un dato» (anexo 14B §4, anexo 14C §3.1). Antes había dos: la de la lectura (con los valores) y
   * la de la lista (sin ellos: «sin resultado» en lugar de «falta un valor ajeno», y nunca si la versión no tiene ajenas).
   * Con `faltanAjenas` bien dado (falso sin ajenas; la lista lo aproxima con «tiene ajenas y no tiene resultado») dicen lo
   * mismo: esta tabla es la de las dos.
   */
  it("«Falta un dato»: una sola regla", () => {
    const manual = { origenDato: "manual" as const, mide: true, noAplica: false, historica: false, reportada: false, faltanAjenas: false };
    // Quien mide aún no reporta lo suyo: lo debe él, no un dato.
    expect(esperaUnDato({ ...manual, faltanAjenas: true })).toBe(false);
    expect(esperaUnDato(manual)).toBe(false);
    // Lo propio reportado: espera solo si falta un valor ajeno.
    expect(esperaUnDato({ ...manual, reportada: true, faltanAjenas: true })).toBe(true);
    expect(esperaUnDato({ ...manual, reportada: true })).toBe(false);
    // Nadie la mide: espera hasta que el sistema la reporte con todo.
    const nadie = { ...manual, mide: false };
    expect(esperaUnDato({ ...nadie, faltanAjenas: true })).toBe(true);
    expect(esperaUnDato(nadie)).toBe(true);
    expect(esperaUnDato({ ...nadie, reportada: true, faltanAjenas: true })).toBe(true);
    expect(esperaUnDato({ ...nadie, reportada: true })).toBe(false);
    // Un automático espera su foto mientras no está reportado, también en un histórico.
    const automatico = { ...nadie, origenDato: "automatico" as const };
    expect(esperaUnDato(automatico)).toBe(true);
    expect(esperaUnDato({ ...automatico, reportada: true })).toBe(false);
    expect(esperaUnDato({ ...automatico, historica: true })).toBe(true);
    // «No aplica» no espera nada; un histórico de una ficha manual tampoco: se registra completo.
    expect(esperaUnDato({ ...nadie, noAplica: true })).toBe(false);
    expect(esperaUnDato({ ...automatico, noAplica: true })).toBe(false);
    expect(esperaUnDato({ ...nadie, historica: true })).toBe(false);
    expect(esperaUnDato({ ...manual, reportada: true, faltanAjenas: true, historica: true })).toBe(false);
  });
});
