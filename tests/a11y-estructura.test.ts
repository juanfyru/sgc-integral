import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const raiz = path.resolve(import.meta.dirname, "..");

describe("estructura de accesibilidad (Fase 9)", () => {
  it("el layout raíz ofrece 'saltar al contenido' y no dibuja el ancla destino", () => {
    const layout = readFileSync(path.join(raiz, "src/app/layout.tsx"), "utf8");
    expect(layout).toContain('href="#contenido"');
    expect(layout).toContain("Saltar al contenido");
    // El destino lo pone el cascarón o la pantalla centrada: un solo #contenido por página.
    expect(layout).not.toContain('id="contenido"');
  });

  it.each([
    "src/componentes/cascaron/Cascaron.tsx",
    "src/componentes/cascaron/PantallaCentrada.tsx",
  ])("%s lleva el ancla destino del salto", (ruta) => {
    expect(readFileSync(path.join(raiz, ruta), "utf8")).toContain('id="contenido"');
  });

  const rutasConSkeleton = [
    "src/app/(app)/loading.tsx",
    "src/app/(app)/procesos/[slug]/loading.tsx",
    "src/app/(app)/procesos/[slug]/[sub]/loading.tsx",
    "src/app/(app)/documentos/[codigo]/loading.tsx",
    "src/app/(app)/buscar/loading.tsx",
    "src/app/(app)/admin/(panel)/maestro/loading.tsx",
    "src/app/(app)/admin/(panel)/estadisticas/loading.tsx",
    "src/app/(app)/admin/(panel)/bitacora/loading.tsx",
  ];

  it.each(rutasConSkeleton)("existe el skeleton de carga %s", (ruta) => {
    expect(existsSync(path.join(raiz, ruta))).toBe(true);
  });

  it.each([
    "src/app/(app)/admin/(panel)/maestro/page.tsx",
    "src/app/(app)/admin/(panel)/bitacora/page.tsx",
  ])("la tabla desplazable de %s es enfocable por teclado con etiqueta", (ruta) => {
    const src = readFileSync(path.join(raiz, ruta), "utf8");
    expect(src).toMatch(/overflow-x-auto/);
    expect(src).toContain('role="region"');
    expect(src).toContain("tabIndex={0}");
    expect(src).toMatch(/aria-label=/);
  });
});
