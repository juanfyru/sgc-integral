import { describe, expect, it } from "vitest";
import { parsearTipo } from "@/lib/esquemas/mapa";

const formulario = (meses: string) => {
  const f = new FormData();
  f.set("nombre", "Procedimiento");
  f.set("sigla", "PR");
  f.set("autoridad", "operativo");
  f.set("plantillaDocumentoId", "");
  f.set("mesesRevision", meses);
  return f;
};

describe("parseo del formulario de tipos de documento", () => {
  it("acepta un plazo de revisión entero de 1 a 120", () => {
    expect(parsearTipo(formulario("12")).mesesRevision).toBe(12);
    expect(parsearTipo(formulario("1")).mesesRevision).toBe(1);
    expect(parsearTipo(formulario("120")).mesesRevision).toBe(120);
  });
  it.each(["0", "121", "1,5", "", "abc"])("rechaza el plazo «%s»", (meses) => {
    expect(() => parsearTipo(formulario(meses))).toThrow(/plazo de revisión/);
  });
});
