import { describe, expect, it } from "vitest";
import { alguienMide, faltaSegunOrigen, letrasAjenas, letrasPropias } from "@/lib/indicadores/origen";

const v = (letra: string, origen: "propia" | "compartida" | "automatica" | "indicador") => ({ letra, origen });

describe("origen de las variables", () => {
  it("separa las letras propias de las ajenas (compartida o indicador)", () => {
    const vs = [v("A", "propia"), v("B", "compartida"), v("C", "indicador"), v("D", "automatica")];
    expect(letrasPropias(vs)).toEqual(["A"]);
    expect(letrasAjenas(vs)).toEqual(["B", "C"]);
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
});
