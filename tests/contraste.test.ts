import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { contrasteWCAG, luminanciaRelativa } from "@/lib/contraste";

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
    // Superficies de texto blanco sobre banda oscurecida al 80% (fix Fase 9):
    // el verde crudo #2e9b47 sólo daba 3.56; oscurecerlo garantiza AA para
    // cualquier color de banda que elija el admin. #257c39 = verde @80% negro.
    ["blanco / banda-solida verde", "#ffffff", "#257c39"],
  ];

  it.each(paresTextoNormal)("%s cumple AA (≥ 4.5:1)", (_n, a, b) => {
    expect(contrasteWCAG(a, b)).toBeGreaterThanOrEqual(4.5);
  });
});

// Gráficas de los indicadores en estilo «Tubos» (Fase 14A, Tarea 14; spec §11). El volumen sale de un degradado
// brillo → color → sombra sobre el token del estado. El borde en sombra y el tubo neutro son objetos gráficos: se
// distinguen (≥ 3:1, WCAG 1.4.11) de la pista sobre la que crecen y de la tarjeta que los rodea, en los dos temas. El
// color base de «Atención» no llega a 3:1 sobre blanco y no se toca (es el token del estado): el valor y el nombre del
// estado van siempre escritos.
describe("tokens de las gráficas de tubos", () => {
  const css = readFileSync("src/app/globals.css", "utf8");
  const valor = (nombre: string) => {
    const m = css.match(new RegExp(String.raw`(?<![\w-])${nombre}:\s*light-dark\((#[0-9a-f]{6}),\s*(#[0-9a-f]{6})\)`));
    if (!m) throw new Error(nombre);
    return { claro: m[1], oscuro: m[2] };
  };
  const TEMAS = ["claro", "oscuro"] as const;
  const tarjeta = valor("--card");
  const pista = valor("--tubo-pista");

  it.each(["bien", "atencion", "critico"])("el tubo %s: el brillo es más claro y la sombra más oscura que su color, en los dos temas", (e) => {
    const base = valor(`--estado-${e}`);
    const brillo = valor(`--estado-${e}-brillo`);
    const sombra = valor(`--estado-${e}-sombra`);
    for (const t of TEMAS) {
      expect(luminanciaRelativa(brillo[t])).toBeGreaterThan(luminanciaRelativa(base[t]));
      expect(luminanciaRelativa(base[t])).toBeGreaterThan(luminanciaRelativa(sombra[t]));
    }
  });

  it.each(["bien", "atencion", "critico"])("el borde en sombra del tubo %s se distingue (≥ 3:1) de la pista y de la tarjeta", (e) => {
    const sombra = valor(`--estado-${e}-sombra`);
    for (const t of TEMAS) {
      expect(contrasteWCAG(sombra[t], pista[t])).toBeGreaterThanOrEqual(3);
      expect(contrasteWCAG(sombra[t], tarjeta[t])).toBeGreaterThanOrEqual(3);
    }
  });

  it("el tubo neutro (sin meta) se distingue (≥ 3:1) de la pista y de la tarjeta, en los dos temas", () => {
    const neutro = valor("--tubo-neutro");
    for (const t of TEMAS) {
      expect(contrasteWCAG(neutro[t], pista[t])).toBeGreaterThanOrEqual(3);
      expect(contrasteWCAG(neutro[t], tarjeta[t])).toBeGreaterThanOrEqual(3);
    }
  });

  it("la pista se ve sobre la tarjeta y la del periodo que aún no llega es más tenue, sin opacidad", () => {
    const futura = valor("--tubo-pista-futura");
    for (const t of TEMAS) {
      expect(contrasteWCAG(pista[t], tarjeta[t])).toBeGreaterThan(contrasteWCAG(futura[t], tarjeta[t]));
      expect(contrasteWCAG(futura[t], tarjeta[t])).toBeGreaterThan(1.03);
    }
  });
});
