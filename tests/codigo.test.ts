import { describe, expect, it } from "vitest";
import {
  FORMATO_CODIGO_DEFECTO,
  codigoSiguiente,
  consecutivoDe,
  generarCodigo,
  motivoDeSiglas,
  patronDeConfiguracion,
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
  it("dice con qué debe empezar un código, o da un ejemplo si el consecutivo va antes de las siglas", () => {
    const p = { proceso: "CEX", tipo: "FO" };
    expect(motivoDeSiglas(F, p)).toBe("El código debe empezar por CEX-FO-");
    expect(motivoDeSiglas("HNSF-{TIPO}-{PROCESO}-{NNN}", p)).toBe("El código debe empezar por HNSF-FO-CEX-");
    expect(motivoDeSiglas("{NN}-{PROCESO}-{TIPO}", p)).toBe("El código debe tener la forma 01-CEX-FO");
    expect(motivoDeSiglas("{PROCESO}-{NN}-{TIPO}", p)).toBe("El código debe tener la forma CEX-01-FO");
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
  it("rechaza marcadores repetidos, minúsculas y símbolos fuera de los marcadores", () => {
    expect(validarFormato("{PROCESO}-{PROCESO}-{TIPO}-{NN}")).not.toBeNull();
    expect(validarFormato("{PROCESO}-{TIPO}-{NN}{NNN}")).not.toBeNull();
    expect(validarFormato("{proceso}-{TIPO}-{NN}")).not.toBeNull();
    expect(validarFormato("{PROCESO}.{TIPO}-{NN}")).not.toBeNull();
    expect(validarFormato("{PROCESO}{TIPO}-{NN}")).toMatch(/Separe/);
    expect(validarFormato("{PROCESO}A{TIPO}-{NN}")).toMatch(/Entre \{PROCESO\} y \{TIPO\}/);
    expect(validarFormato("{TIPO}B{PROCESO}-{NN}")).toMatch(/Entre/);
    expect(validarFormato("{PROCESO}9{TIPO}-{NN}")).toBeNull();
    expect(validarFormato("{PROCESO}-{NN}-{TIPO}")).toBeNull();
    expect(validarFormato(`${"A".repeat(32)}-{PROCESO}-{TIPO}-{NN}`)).toMatch(/supera los 40/);
    expect(validarFormato(`${"A".repeat(25)}-{PROCESO}-{TIPO}-{NN}`)).toBeNull();
    expect(validarFormato("{PROCESO}-{TIPO}{NN}")).toMatch(/Separe/);
    expect(validarFormato("{PROCESO}-{TIPO}-{NN}$")).not.toBeNull();
  });
  it("no confunde siglas que comparten prefijo", () => {
    expect(consecutivoDe(F, "SGC-FO-02", { proceso: "SG", tipo: "FO" })).toBeNull();
  });
  it("con {NNN} rellena a tres dígitos y lo lee", () => {
    const F3 = "{PROCESO}-{TIPO}-{NNN}";
    expect(generarCodigo(F3, { proceso: "SGC", tipo: "FO", consecutivo: 2 })).toBe("SGC-FO-002");
    expect(consecutivoDe(F3, "SGC-FO-002", { proceso: "SGC", tipo: "FO" })).toBe(2);
    expect(consecutivoDe(F3, "SGC-FO-02", { proceso: "SGC", tipo: "FO" })).toBeNull();
  });
  it("patronDesdeFormato escapa lo literal aunque el formato no se haya validado", () => {
    const p = patronDesdeFormato("{PROCESO}.{TIPO}-{NN}");
    expect(p.test("SGC.FO-02")).toBe(true);
    expect(p.test("SGCxFO-02")).toBe(false);
  });
});

describe("patronDeConfiguracion", () => {
  const heredado = "^[A-Z]{2}-[A-Z]{3}-\\d{3}$";
  it("con formato válido gana el formato aunque haya patrón", () => {
    const p = patronDeConfiguracion(F, heredado);
    expect(p.test("SGC-FO-02")).toBe(true);
    expect(p.test("PR-GTH-001")).toBe(true);
    expect(patronDeConfiguracion("{PROCESO}-{TIPO}-{NNN}", heredado).test("SGC-FO-02")).toBe(false);
  });
  it("sin formato usa el patrón heredado", () => {
    for (const formato of [undefined, null]) {
      const p = patronDeConfiguracion(formato, heredado);
      expect(p.test("PR-GTH-001")).toBe(true);
      expect(p.test("SGC-FO-02")).toBe(false);
    }
  });
  it("con formato inválido y patrón válido usa el patrón", () => {
    const p = patronDeConfiguracion("{PROCESO}-{NN}", heredado);
    expect(p.test("PR-GTH-001")).toBe(true);
    expect(p.test("SGC-FO-02")).toBe(false);
  });
  it("con un patrón que no compila no lanza y usa el defecto", () => {
    const p = patronDeConfiguracion(undefined, "[A-Z");
    expect(p.test("SGC-FO-02")).toBe(true);
  });
  it("sin ninguno de los dos, el defecto acepta tres y dos dígitos", () => {
    const p = patronDeConfiguracion(undefined, undefined);
    expect(p.test("PR-GTH-001")).toBe(true);
    expect(p.test("SGC-FO-02")).toBe(true);
    expect(p.test("SGC-FO-2")).toBe(false);
  });
});

describe("codigoSiguiente", () => {
  const p = { proceso: "CEX", tipo: "FO" };

  it("sigue al mayor consecutivo de ese proceso y tipo", () => {
    expect(codigoSiguiente(F, ["CEX-FO-02", "CEX-FO-07", "CEX-PR-20", "GTH-FO-30"], p)).toBe("CEX-FO-08");
    expect(codigoSiguiente(F, [], p)).toBe("CEX-FO-01");
  });

  it("sin formato, o con uno inválido, no sugiere nada", () => {
    expect(codigoSiguiente(null, ["CEX-FO-02"], p)).toBeNull();
    expect(codigoSiguiente("sin marcadores", ["CEX-FO-02"], p)).toBeNull();
  });
  it("al contar, un formato nuevo con {NNN} reconoce los códigos de dos dígitos que ya existen", () => {
    const F3 = "{PROCESO}-{TIPO}-{NNN}";
    const p = { proceso: "SGC", tipo: "FO" };
    expect(siguienteConsecutivo(F3, ["SGC-FO-05", "SGC-FO-002"], p)).toBe(6);
    expect(codigoSiguiente(F3, ["SGC-FO-05"], p)).toBe("SGC-FO-006");
    expect(consecutivoDe(F3, "SGC-FO-05", p)).toBeNull();
  });
});
