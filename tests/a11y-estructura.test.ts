import { existsSync, readFileSync } from "node:fs";
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

  const rutasConSkeleton = [
    "src/app/loading.tsx",
    "src/app/procesos/[slug]/loading.tsx",
    "src/app/procesos/[slug]/[sub]/loading.tsx",
    "src/app/documentos/[codigo]/loading.tsx",
    "src/app/buscar/loading.tsx",
    "src/app/admin/(panel)/maestro/loading.tsx",
    "src/app/admin/(panel)/estadisticas/loading.tsx",
    "src/app/admin/(panel)/bitacora/loading.tsx",
  ];

  it.each(rutasConSkeleton)("existe el skeleton de carga %s", (ruta) => {
    expect(existsSync(path.join(raiz, ruta))).toBe(true);
  });

  it.each([
    "src/app/admin/(panel)/maestro/page.tsx",
    "src/app/admin/(panel)/bitacora/page.tsx",
  ])("la tabla desplazable de %s es enfocable por teclado con etiqueta", (ruta) => {
    const src = readFileSync(path.join(raiz, ruta), "utf8");
    expect(src).toMatch(/overflow-x-auto/);
    expect(src).toContain('role="region"');
    expect(src).toContain("tabIndex={0}");
    expect(src).toMatch(/aria-label=/);
  });
});
