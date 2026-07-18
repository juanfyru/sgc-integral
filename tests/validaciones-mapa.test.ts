import { describe, expect, it } from "vitest";
import { generarSlug } from "@/lib/slug";
import {
  validarBanda,
  validarColor,
  validarIcono,
  validarPatronCodigo,
  validarSigla,
  validarSlug,
} from "@/lib/validaciones-mapa";

describe("generarSlug", () => {
  it("quita acentos y pasa a kebab minúsculo", () => {
    expect(generarSlug("Atención al Usuario")).toBe("atencion-al-usuario");
    expect(generarSlug("  Gestión  del   Riesgo ")).toBe("gestion-del-riesgo");
    expect(generarSlug("PYM / SSO&ST")).toBe("pym-sso-st");
  });
});

describe("validadores", () => {
  it("color exige hex de 6 dígitos y normaliza a mayúsculas", () => {
    expect(validarColor("#1b4e8e")).toBe("#1B4E8E");
    expect(() => validarColor("azul")).toThrow(/hex/i);
    expect(() => validarColor("#123")).toThrow(/hex/i);
  });
  it("sigla exige 2–4 letras y normaliza a mayúsculas", () => {
    expect(validarSigla("gth")).toBe("GTH");
    expect(() => validarSigla("A")).toThrow(/letras/i);
    expect(() => validarSigla("GTH1")).toThrow(/letras/i);
  });
  it("slug valida el formato kebab", () => {
    expect(validarSlug("consulta-externa")).toBe("consulta-externa");
    expect(() => validarSlug("Consulta Externa")).toThrow(/slug/i);
  });
  it("banda solo admite las cuatro válidas", () => {
    expect(validarBanda("misionales")).toBe("misionales");
    expect(() => validarBanda("otra")).toThrow(/banda/i);
  });
  it("patrón exige una expresión regular válida", () => {
    expect(validarPatronCodigo("^[A-Z]{2}-\\d{3}$")).toBe("^[A-Z]{2}-\\d{3}$");
    expect(() => validarPatronCodigo("(sin cerrar")).toThrow(/regular/i);
  });
  it("ícono debe estar en la lista registrada", () => {
    expect(validarIcono("target", ["target", "users"])).toBe("target");
    expect(() => validarIcono("inexistente", ["target"])).toThrow(/ícono/i);
  });
});
