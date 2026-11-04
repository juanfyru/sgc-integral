import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const raiz = path.resolve(import.meta.dirname, "..");

function archivos(dir: string): string[] {
  return readdirSync(path.join(raiz, dir), { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && /\.tsx?$/.test(e.name))
    .map((e) => path.join(e.parentPath, e.name));
}

const DIRS = ["src/componentes/mapa", "src/app/(app)/procesos", "src/app/(app)/documentos"];

describe("colores del mapa para el tema oscuro", () => {
  for (const dir of DIRS) {
    for (const f of archivos(dir)) {
      it(`${path.relative(raiz, f)} no mezcla con blanco ni negro fijos`, () => {
        const t = readFileSync(f, "utf8");
        expect(t).not.toMatch(/color-mix\([^)]*(?:var\(--color-banda\)|var\(--acento\)|var\(--color-banda\)_)[^)]*(?:white|black)\)/);
        expect(t).not.toMatch(/color-mix\(in_srgb,var\(--(?:color-banda|acento)\)_\d+%,(?:white|black)\)/);
        expect(t).not.toContain("--acento");
      });
    }
  }
  it("Inicio muestra Mis tareas y no define <main>", () => {
    const t = readFileSync(path.join(raiz, "src/app/(app)/page.tsx"), "utf8");
    expect(t).toContain("<MisTareas");
    expect(t).not.toContain("<main");
  });
});
