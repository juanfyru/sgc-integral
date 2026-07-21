import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const raiz = path.resolve(import.meta.dirname, "..");

describe("estructura de accesibilidad (Fase 9)", () => {
  it("el layout raíz ofrece 'saltar al contenido' y el ancla destino", () => {
    const layout = readFileSync(path.join(raiz, "src/app/layout.tsx"), "utf8");
    expect(layout).toContain('href="#contenido"');
    expect(layout).toContain('id="contenido"');
    expect(layout).toContain("Saltar al contenido");
  });
});
