import { describe, expect, it } from "vitest";
import lista from "@/lib/datos/claves-comunes.json";
import { generarClaveTemporal, validarClave } from "@/lib/clave-politica";

describe("validarClave", () => {
  it("rechaza menos de 12 y más de 128 caracteres", () => {
    expect(validarClave("corta-1234", { usuario: "ana" })).toMatch(/12/);
    expect(validarClave("x".repeat(129), { usuario: "ana" })).toMatch(/128/);
  });
  it("rechaza claves comunes aunque tengan 12 o más caracteres", () => {
    // La lista empaquetada es la fuente de verdad: se toma de ella una entrada larga.
    const comun = (lista as string[]).find((c) => c.length >= 12)!;
    expect(comun).toBeDefined();
    expect(validarClave(comun, { usuario: "ana" })).toMatch(/común/);
    expect(validarClave(comun.toUpperCase(), { usuario: "ana" })).toMatch(/común/);
  });
  it("toda entrada de la lista tiene entre 12 y 128 caracteres y está en minúsculas", () => {
    for (const c of lista as string[]) {
      expect(c.length).toBeGreaterThanOrEqual(12);
      expect(c.length).toBeLessThanOrEqual(128);
      expect(c).toBe(c.toLowerCase());
    }
  });
  it("rechaza una clave común escrita con caracteres de ancho completo", () => {
    const comun = (lista as string[]).find((c) => c.length >= 12 && /^[a-z0-9]+$/.test(c))!;
    expect(comun).toBeDefined();
    const ancho = [...comun].map((ch) => String.fromCharCode(ch.charCodeAt(0) + 0xfee0)).join("");
    expect(ancho).not.toBe(comun);
    expect(validarClave(ancho, { usuario: "ana" })).toMatch(/común/);
  });
  it("rechaza la que contiene el nombre de usuario", () => {
    expect(validarClave("Hospital-ana.perez-2026", { usuario: "ana.perez" })).toMatch(/usuario/);
  });
  it("acepta una clave larga y no común", () => {
    expect(validarClave("Colibri-verde-37-Suaza", { usuario: "ana" })).toBeNull();
  });
});
describe("generarClaveTemporal", () => {
  it("tiene el formato XXXX-XXXX-XXXX-XXXX sin caracteres ambiguos y pasa la política", () => {
    for (let i = 0; i < 50; i++) {
      const c = generarClaveTemporal();
      expect(c).toMatch(/^[A-HJ-NP-Z2-9]{4}(-[A-HJ-NP-Z2-9]{4}){3}$/);
      expect(validarClave(c, { usuario: "cualquiera" })).toBeNull();
    }
  });
});
