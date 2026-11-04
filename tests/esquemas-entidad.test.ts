import { describe, expect, it } from "vitest";
import { EsquemaEntidad } from "@/lib/esquemas/entidad";

const base = {
  nombre_entidad: "Hospital X",
  sigla_entidad: "HX",
  lema: "",
  aviso_datos_personales: "",
  color_primario: "#1B4E8E",
  color_secundario: "#2E9B47",
};

describe("EsquemaEntidad", () => {
  it("normaliza el hex a minúsculas y rechaza #fff", () => {
    const ok = EsquemaEntidad.parse(base);
    expect(ok.color_primario).toBe("#1b4e8e");
    expect(ok.color_secundario).toBe("#2e9b47");
    expect(() => EsquemaEntidad.parse({ ...base, color_primario: "#fff" })).toThrow(/Color inválido/);
    expect(() => EsquemaEntidad.parse({ ...base, sigla_entidad: "H" })).toThrow();
    expect(() => EsquemaEntidad.parse({ ...base, extra: "x" })).toThrow();
  });

  it("lema y aviso vacíos (parsearFormulario omite los campos vacíos) quedan en cadena vacía", () => {
    const sinOpcionales: Partial<typeof base> = { ...base };
    delete sinOpcionales.lema;
    delete sinOpcionales.aviso_datos_personales;
    const ok = EsquemaEntidad.parse(sinOpcionales);
    expect(ok.lema).toBe("");
    expect(ok.aviso_datos_personales).toBe("");
  });
});
