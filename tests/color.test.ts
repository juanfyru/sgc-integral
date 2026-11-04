import { describe, expect, it } from "vitest";
import { contrasteWCAG } from "../src/lib/contraste";
import {
  aclararHasta,
  ajustarLuminosidad,
  hexAOklch,
  hexValido,
  normalizarHex,
  oklchAHex,
  oscurecerHasta,
} from "../src/lib/color";

describe("color", () => {
  it("hexValido acepta #rrggbb en cualquier caja y rechaza #rgb, nombres y basura", () => {
    expect(hexValido("#1b4e8e")).toBe(true);
    expect(hexValido("#1B4E8E")).toBe(true);
    expect(hexValido("#fff")).toBe(false);
    expect(hexValido("red")).toBe(false);
    expect(hexValido("#12345;")).toBe(false);
    expect(hexValido(42)).toBe(false);
    expect(normalizarHex("#1B4E8E")).toBe("#1b4e8e");
  });

  it("hex → OKLCH → hex vuelve al mismo valor (±1 por canal)", () => {
    for (const hex of ["#1b4e8e", "#2e9b47", "#000000", "#ffffff", "#eb6834"]) {
      const vuelta = oklchAHex(hexAOklch(hex));
      for (let i = 1; i < 7; i += 2) {
        expect(
          Math.abs(parseInt(vuelta.slice(i, i + 2), 16) - parseInt(hex.slice(i, i + 2), 16)),
        ).toBeLessThanOrEqual(1);
      }
    }
  });

  it("un color fuera del gamut se recorta a un hex válido", () => {
    expect(hexValido(oklchAHex({ l: 0.7, c: 0.5, h: 150 }))).toBe(true);
  });

  it("ajustarLuminosidad recorta L a [0, 1]", () => {
    expect(ajustarLuminosidad("#777777", -5)).toBe("#000000");
    expect(ajustarLuminosidad("#777777", 5)).toBe("#ffffff");
  });

  it("aclararHasta alcanza el contraste pedido sin pasar del tope", () => {
    const r = aclararHasta("#1b4e8e", "#161a20", 4.5);
    expect(contrasteWCAG(r, "#161a20")).toBeGreaterThanOrEqual(4.5);
    expect(hexAOklch(r).l).toBeLessThanOrEqual(0.85 + 1e-9);
  });

  it("oscurecerHasta alcanza el contraste con blanco", () => {
    expect(contrasteWCAG(oscurecerHasta("#9ecbff", "#ffffff", 4.5), "#ffffff")).toBeGreaterThanOrEqual(4.5);
  });
});
