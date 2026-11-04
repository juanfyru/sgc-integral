import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const raiz = path.resolve(import.meta.dirname, "..");

function archivos(dir: string): string[] {
  return readdirSync(path.join(raiz, dir), { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && /\.tsx?$/.test(e.name))
    .map((e) => path.join(e.parentPath, e.name));
}

const DIRS = [
  "src/componentes/mapa",
  "src/componentes/busqueda",
  "src/componentes/documentos",
  "src/componentes/navegacion",
  "src/app/(app)/procesos",
  "src/app/(app)/documentos",
];

// Única mezcla permitida: el fondo del 4 % de la banda.
const FONDO_BANDA = /color-mix\(in srgb, var\(--color-banda\) 4%, var\(--background\)\)/g;

describe("colores del mapa para el tema oscuro", () => {
  for (const dir of DIRS) {
    for (const f of archivos(dir)) {
      it(`${path.relative(raiz, f)} usa las utilidades banda-*`, () => {
        const t = readFileSync(f, "utf8").replace(FONDO_BANDA, "");
        expect(t).not.toMatch(/color-mix\([^)]*--color-banda/);
        expect(t).not.toMatch(/color-mix\([^)]*--acento/);
        expect(t).not.toContain("--acento");
      });
    }
  }
  it("globals.css define banda-solido con negro", () => {
    const css = readFileSync(path.join(raiz, "src/app/globals.css"), "utf8");
    expect(css).toMatch(/@utility banda-solido \{[^}]*black[^}]*\}/);
  });
  it("la cabecera con texto de los rieles usa banda-solido, no el color plano", () => {
    const t = readFileSync(path.join(raiz, "src/componentes/mapa/RailPeriferico.tsx"), "utf8");
    const cabecera = t.match(/<header[^>]*>/)?.[0] ?? "";
    expect(cabecera).toContain("banda-solido");
    expect(cabecera).not.toContain("bg-[var(--color-banda)]");
  });
  it("Inicio muestra Mis tareas y no define <main>", () => {
    const t = readFileSync(path.join(raiz, "src/app/(app)/page.tsx"), "utf8");
    expect(t).toContain("<MisTareas");
    expect(t).not.toContain("<main");
  });
});
