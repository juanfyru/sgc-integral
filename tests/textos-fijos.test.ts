import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const raiz = path.resolve(import.meta.dirname, "..");
const EXCEPCION = path.join(raiz, "src/db/semillas/demo.ts");
const CADENAS = ["SGC Documental", "Nuestra Señora de Fátima", "Hospital de Suaza"];

const archivos = readdirSync(path.join(raiz, "src"), { recursive: true, withFileTypes: true })
  .filter((e) => e.isFile() && /\.tsx?$/.test(e.name))
  .map((e) => path.join(e.parentPath, e.name))
  .filter((f) => f !== EXCEPCION);

// El nombre de la entidad sale de la marca configurada (§9.7); solo la semilla demo lo fija.
describe("sin textos fijos de la entidad", () => {
  it("recorre el código fuente", () => {
    expect(archivos.length).toBeGreaterThan(100);
  });
  it.each(archivos.map((f) => [path.relative(raiz, f), f]))("%s", (_rel, f) => {
    const t = readFileSync(f, "utf8");
    for (const c of CADENAS) expect(t).not.toContain(c);
  });
});
