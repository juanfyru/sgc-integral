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
    const ok = EsquemaEntidad.parse({ ...base, aviso_datos_personales: "Aviso" });
    expect(ok.color_primario).toBe("#1b4e8e");
    expect(ok.color_secundario).toBe("#2e9b47");
    expect(() => EsquemaEntidad.parse({ ...base, aviso_datos_personales: "Aviso", color_primario: "#fff" })).toThrow(/Color inválido/);
    expect(() => EsquemaEntidad.parse({ ...base, aviso_datos_personales: "Aviso", sigla_entidad: "H" })).toThrow();
    expect(() => EsquemaEntidad.parse({ ...base, aviso_datos_personales: "Aviso", extra: "x" })).toThrow();
  });

  it("el lema ausente (parsearFormulario omite los vacíos) queda en cadena vacía", () => {
    const sinLema: Partial<typeof base> = { ...base, aviso_datos_personales: "Aviso" };
    delete sinLema.lema;
    expect(EsquemaEntidad.parse(sinLema).lema).toBe("");
  });

  it("el aviso de datos personales es obligatorio", () => {
    const conAviso = { ...base, aviso_datos_personales: "Aviso" };
    expect(EsquemaEntidad.parse(conAviso).aviso_datos_personales).toBe("Aviso");
    expect(() => EsquemaEntidad.parse(base)).toThrow(/obligatorio \(Ley 1581 de 2012\)/);
    const sinAviso: Partial<typeof base> = { ...base };
    delete sinAviso.aviso_datos_personales;
    expect(() => EsquemaEntidad.parse(sinAviso)).toThrow();
  });
});
