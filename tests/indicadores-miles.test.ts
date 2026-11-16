import { describe, expect, it } from "vitest";
import { AYUDA_SIN_MILES, SIN_PUNTOS_DE_MILES, tienePuntoDeMiles } from "@/lib/indicadores/miles";

describe("tienePuntoDeMiles", () => {
  it("reconoce los números con puntos de miles", () => {
    for (const t of ["1.600", "12.500", "1.284.300", "-1.600", " 1.600 "]) expect(tienePuntoDeMiles(t), t).toBe(true);
  });
  it("deja pasar lo que no es un punto de miles", () => {
    for (const t of ["1600", "1,6", "1.6", "0.125", "1600.5", "1,731", "1.6000", "01.600", ""]) expect(tienePuntoDeMiles(t), t).toBe(false);
  });
  it("un decimal con punto o con coma sigue valiendo", () => {
    expect(tienePuntoDeMiles("1600.5")).toBe(false);
    expect(tienePuntoDeMiles("1,731")).toBe(false);
  });
  it("los textos son los exactos", () => {
    expect(SIN_PUNTOS_DE_MILES).toBe("Escriba el valor sin puntos de miles (1731); para decimales use la coma (1,731)");
    expect(AYUDA_SIN_MILES).toBe("Sin puntos de miles; use la coma para los decimales.");
  });
});
