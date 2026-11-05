import { describe, expect, it } from "vitest";
import {
  FORMATO_CODIGO_DEFECTO,
  consecutivoDe,
  generarCodigo,
  patronDesdeFormato,
  siguienteConsecutivo,
  validarFormato,
} from "@/lib/tramites/codigo";

const F = FORMATO_CODIGO_DEFECTO;

describe("formato del código", () => {
  it("valida el formato", () => {
    expect(validarFormato(F)).toBeNull();
    expect(validarFormato("{TIPO}-{PROCESO}-{NNN}")).toBeNull();
    expect(validarFormato("{PROCESO}-{NN}")).toMatch(/TIPO/);
    expect(validarFormato("{PROCESO}-{TIPO}-{NN};x")).not.toBeNull();
  });
  it("deriva el patrón", () => {
    const p = patronDesdeFormato(F);
    expect(["SGC-FO-02", "GTH-PR-100", "ZZ-TST-001"].every((c) => p.test(c))).toBe(true);
    expect(["SGC-FO-2", "sgc-fo-02", "SGC-FO-02 ", "SGCXX-FO-02"].some((c) => p.test(c))).toBe(false);
  });
  it("genera y lee consecutivos", () => {
    expect(generarCodigo(F, { proceso: "SGC", tipo: "FO", consecutivo: 2 })).toBe("SGC-FO-02");
    expect(generarCodigo(F, { proceso: "SGC", tipo: "FO", consecutivo: 100 })).toBe("SGC-FO-100");
    expect(consecutivoDe(F, "SGC-FO-02", { proceso: "SGC", tipo: "FO" })).toBe(2);
    expect(consecutivoDe(F, "GTH-FO-02", { proceso: "SGC", tipo: "FO" })).toBeNull();
  });
  it("propone el siguiente sin reutilizar", () => {
    const codigos = ["SGC-FO-01", "SGC-FO-03", "SGC-RG-07", "GTH-FO-09"];
    expect(siguienteConsecutivo(F, codigos, { proceso: "SGC", tipo: "FO" })).toBe(4);
    expect(siguienteConsecutivo(F, [], { proceso: "SGC", tipo: "FO" })).toBe(1);
    expect(siguienteConsecutivo(F, ["SGC-FO-99"], { proceso: "SGC", tipo: "FO" })).toBe(100);
  });
});
