import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const raiz = path.resolve(import.meta.dirname, "..");
const panel = "src/app/(app)/admin/(panel)";
const leer = (ruta: string) => readFileSync(path.join(raiz, ruta), "utf8");

const listas = [
  `${panel}/page.tsx`,
  `${panel}/usuarios/page.tsx`,
  `${panel}/sesiones/page.tsx`,
  `${panel}/accesos/page.tsx`,
  `${panel}/bitacora/page.tsx`,
  `${panel}/maestro/page.tsx`,
];

describe("migración de listas a los componentes base (Fase 12, T14)", () => {
  it.each(listas)("%s usa TablaDatos y no una tabla propia", (ruta) => {
    const src = leer(ruta);
    expect(src).toContain("<TablaDatos");
    expect(src).not.toContain("<table");
    expect(src).not.toContain("EstadoBadge");
    expect(src).not.toContain("<main");
  });

  it("EstadoBadge ya no existe", () => {
    expect(existsSync(path.join(raiz, "src/componentes/admin/EstadoBadge.tsx"))).toBe(false);
  });

  it("el Excel del Listado Maestro no fija el nombre de la entidad", () => {
    expect(leer(`${panel}/maestro/excel/route.ts`)).not.toContain("Fátima");
  });

  it("el Listado Maestro toma el nombre de la entidad de la marca", () => {
    expect(leer(`${panel}/maestro/page.tsx`)).not.toContain("Fátima");
    expect(leer(`${panel}/maestro/page.tsx`)).toContain("marca.nombre");
  });
});
