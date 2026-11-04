import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { contrasteWCAG } from "@/lib/contraste";
import { MARCA_DEFECTO, derivarMarca, estiloMarca } from "@/lib/marca";

const css = readFileSync("src/app/globals.css", "utf8");
const valor = (nombre: string) => {
  const hex = "(#[0-9a-f]{6})";
  const m = css.match(new RegExp(String.raw`(?<![\w-])${nombre}:\s*light-dark\(${hex},\s*${hex}\)`));
  if (!m) throw new Error(nombre);
  return { claro: m[1], oscuro: m[2] };
};

describe("tokens globales", () => {
  it.each(["bien", "atencion", "grave", "critico", "sin-dato"])(
    "texto de estado %s contrasta ≥ 4.5 con su fondo en ambos temas",
    (e) => {
      const fondo = valor(`--estado-${e}-fondo`);
      const texto = valor(`--estado-${e}-texto`);
      expect(contrasteWCAG(texto.claro, fondo.claro)).toBeGreaterThanOrEqual(4.5);
      expect(contrasteWCAG(texto.oscuro, fondo.oscuro)).toBeGreaterThanOrEqual(4.5);
    },
  );

  it("los colores de módulo y las superficies son los del spec", () => {
    expect(valor("--mod-documentos")).toEqual({ claro: "#2a78d6", oscuro: "#3987e5" });
    expect(valor("--background")).toEqual({ claro: "#f4f6f9", oscuro: "#0f1216" });
    expect(css).toMatch(/--color-azul:\s*var\(--marca-relleno\)/);
    expect(css).toMatch(/--color-marca:\s*var\(--marca\)/);
    expect(css).not.toMatch(/\.dark\s*\{/);
  });

  it("no queda text-azul en el código: pasó a text-marca (text-azul-tinta sigue siendo válido)", () => {
    const archivos = readdirSync("src", { recursive: true }).filter((f) => String(f).endsWith(".tsx"));
    for (const f of archivos) {
      expect(readFileSync(path.join("src", String(f)), "utf8")).not.toMatch(/\btext-azul(?![\w-])/);
    }
  });

  it("no queda (border|outline|ring)-azul: los indicadores usan el token de texto de marca", () => {
    const archivos = readdirSync("src", { recursive: true }).filter((f) => /\.tsx?$/.test(String(f)));
    for (const f of archivos) {
      expect(readFileSync(path.join("src", String(f)), "utf8")).not.toMatch(/(border|outline|ring)-azul(?![A-Za-z0-9_-])/);
    }
  });

  it("los respaldos de marca en :root coinciden con la marca por defecto derivada", () => {
    for (const [nombre, v] of Object.entries(estiloMarca(derivarMarca(MARCA_DEFECTO)))) {
      expect(css).toMatch(new RegExp(String.raw`^\s*${nombre}:\s*${v};`, "m"));
    }
  });

  it("el tema sistema y la variante dark siguen data-tema y prefers-color-scheme", () => {
    expect(css).toMatch(/\[data-tema="sistema"\]\s*\{\s*color-scheme:\s*light dark;/);
    const variante = css.slice(css.indexOf("@custom-variant dark"), css.indexOf("@theme inline"));
    expect(variante).toContain('[data-tema="oscuro"]');
    expect(variante).toContain("prefers-color-scheme: dark");
  });

  it("texto terciario y destructive cumplen AA", () => {
    const t = valor("--texto-terciario");
    for (const [tema, fondos] of [["claro", [valor("--background").claro, valor("--card").claro]], ["oscuro", [valor("--background").oscuro, valor("--card").oscuro]]] as const) {
      for (const f of fondos) expect(contrasteWCAG(t[tema], f)).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrasteWCAG(valor("--destructive").claro, "#f4f6f9")).toBeGreaterThanOrEqual(4.5);
  });

  it("las gráficas no reutilizan colores de estado ni de módulo", () => {
    const prohibidos = new Set<string>();
    for (const m of css.matchAll(/--(?:estado|mod)-[a-z-]+:\s*light-dark\((#[0-9a-f]{6}),\s*(#[0-9a-f]{6})\)/g)) {
      prohibidos.add(m[1]);
      prohibidos.add(m[2]);
    }
    for (let i = 1; i <= 5; i++) {
      const v = valor(`--chart-${i}`);
      expect(prohibidos.has(v.claro)).toBe(false);
      expect(prohibidos.has(v.oscuro)).toBe(false);
    }
  });
});
