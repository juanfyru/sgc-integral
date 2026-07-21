import { describe, expect, it } from "vitest";
import { contrasteWCAG } from "@/lib/contraste";

describe("contrasteWCAG", () => {
  it("negro sobre blanco da la razón máxima (21:1)", () => {
    expect(contrasteWCAG("#000000", "#ffffff")).toBeCloseTo(21, 0);
  });

  it("es simétrico y blanco sobre blanco es 1:1", () => {
    expect(contrasteWCAG("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
    expect(contrasteWCAG("#1b4e8e", "#f6f8fb")).toBeCloseTo(
      contrasteWCAG("#f6f8fb", "#1b4e8e"),
      5,
    );
  });

  // Pares reales de la UI. Texto normal exige ≥ 4.5:1 (WCAG AA).
  const LIENZO = "#f6f8fb";
  const CARD = "#ffffff";
  const paresTextoNormal: Array<[string, string, string]> = [
    ["foreground / lienzo", "#16233a", LIENZO],
    ["muted-foreground / lienzo", "#55677f", LIENZO],
    ["muted-foreground / card", "#55677f", CARD],
    ["muted-foreground / muted", "#55677f", "#eef2f7"],
    ["verde-texto / lienzo", "#1e7a35", LIENZO],
    ["blanco / azul", "#ffffff", "#1b4e8e"],
    ["primary-foreground / azul", "#fbfbfb", "#1b4e8e"],
  ];

  it.each(paresTextoNormal)("%s cumple AA (≥ 4.5:1)", (_n, a, b) => {
    expect(contrasteWCAG(a, b)).toBeGreaterThanOrEqual(4.5);
  });
});
