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
    expect(src).toContain("<TablaDatos");
    const tabla = readFileSync(path.join(raiz, "src/componentes/ui/TablaDatos.tsx"), "utf8");
    expect(tabla).toContain('role="region"');
    expect(tabla).toContain("tabIndex={0}");
    expect(tabla).toMatch(/aria-label=/);
  });

  // Fase 14A, Tarea 15: la lista, la página de un indicador y la matriz del año.
  it.each([
    "src/app/(app)/indicadores/page.tsx",
    "src/app/(app)/indicadores/[codigo]/page.tsx",
    "src/app/(app)/indicadores/matriz/page.tsx",
    // Tarea 16: la ficha impresa (su encabezado no se imprime; la hoja titula sus bloques con h2).
    "src/app/(app)/indicadores/[codigo]/imprimir/page.tsx",
  ])("%s titula con EncabezadoPagina", (ruta) => {
    expect(readFileSync(path.join(raiz, ruta), "utf8")).toContain("<EncabezadoPagina");
  });

  it.each([
    "src/componentes/indicadores/ListaIndicadores.tsx",
    "src/componentes/indicadores/medicion/TablaDelAnio.tsx",
  ])("la tabla de %s es una TablaDatos (región enfocable con nombre)", (ruta) => {
    expect(readFileSync(path.join(raiz, ruta), "utf8")).toContain("<TablaDatos");
  });

  it("la matriz del año es una región enfocable con nombre y cada celda dice su nombre entero", () => {
    const src = readFileSync(path.join(raiz, "src/componentes/indicadores/MatrizDelAnio.tsx"), "utf8");
    expect(src).toContain('role="region"');
    expect(src).toContain("tabIndex={0}");
    expect(src).toContain("aria-label={`Matriz de ${anio}`}");
    expect(src).toContain("aria-label={c.nombre}");
    expect(src).toContain('<span className="sr-only">{c.nombre}</span>');
    expect(src).toContain('scope="row"');
  });
});
