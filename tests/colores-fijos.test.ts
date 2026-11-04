import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const raiz = path.resolve(import.meta.dirname, "..");
const PROHIBIDAS = /\b(bg|border)-white\b|\b(bg|text|border)-(gray|red|amber|green)-\d+\b/;

const archivos = readdirSync(path.join(raiz, "src"), { recursive: true, withFileTypes: true })
  .filter((e) => e.isFile() && e.name.endsWith(".tsx"))
  .map((e) => path.join(e.parentPath, e.name));

// Los colores de estado van por tokens (bg-estado-<x>-fondo, text-estado-<x>-texto, border-estado-<x>),
// que tienen valor en claro y en oscuro; text-white sobre rellenos de marca sí se permite.
describe("sin colores fijos de Tailwind", () => {
  it("recorre los componentes", () => {
    expect(archivos.length).toBeGreaterThan(50);
  });
  it.each(archivos.map((f) => [path.relative(raiz, f), f]))("%s", (_rel, f) => {
    const lineas = readFileSync(f, "utf8").split("\n");
    const malas = lineas.flatMap((l, i) => (PROHIBIDAS.test(l) ? [`${i + 1}: ${l.trim()}`] : []));
    expect(malas).toEqual([]);
  });
});
