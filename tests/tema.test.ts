import { describe, expect, it } from "vitest";
import { EsquemaTema } from "@/lib/esquemas/entidad";
import { temaEfectivo } from "@/lib/tema";
import { parsearFormulario } from "@/lib/validacion";

describe("temaEfectivo", () => {
  it("con sesión manda el perfil", () => expect(temaEfectivo({ tema: "oscuro" }, "claro")).toBe("oscuro"));
  it("sin sesión usa la cookie válida", () => expect(temaEfectivo(null, "sistema")).toBe("sistema"));
  it("cookie inválida o ausente → claro", () => {
    expect(temaEfectivo(null, "azul")).toBe("claro");
    expect(temaEfectivo(null, undefined)).toBe("claro");
  });
});

describe("EsquemaTema", () => {
  const formulario = (campos: Record<string, string>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(campos)) fd.set(k, v);
    return fd;
  };
  it("acepta los tres temas", () => {
    for (const tema of ["claro", "oscuro", "sistema"]) {
      expect(parsearFormulario(formulario({ tema }), EsquemaTema)).toEqual({ tema });
    }
  });
  it("rechaza un tema desconocido y los campos extra", () => {
    expect(() => parsearFormulario(formulario({ tema: "azul" }), EsquemaTema)).toThrow();
    expect(() => parsearFormulario(formulario({ tema: "claro", otro: "x" }), EsquemaTema)).toThrow();
  });
});
