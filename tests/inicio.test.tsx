import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MisTareas } from "../src/componentes/inicio/MisTareas";

describe("Inicio", () => {
  it("MisTareas vacío dice qué pasará ahí", () => {
    const h = renderToStaticMarkup(<MisTareas tareas={[]} />);
    expect(h).toContain("No tiene tareas pendientes");
    expect(h).toContain("aparecerá aquí");
  });
  it("una tarea vencida lleva insignia crítica con texto", () => {
    const h = renderToStaticMarkup(
      <MisTareas
        ahora={new Date("2026-11-04T12:00:00Z")}
        tareas={[{ id: "doc:1", modulo: "documentos", titulo: "Aprobar GTH-PR-12 v3", detalle: null, vence: new Date("2026-11-01T00:00:00Z"), enlace: "/admin" }]}
      />,
    );
    expect(h).toContain("Vencida");
    expect(h).toContain('data-variante="critico"');
    expect(h).toContain("bg-mod-documentos");
  });
  it("las fechas se comparan en la zona de la instalación", () => {
    const ahora = new Date("2026-11-04T03:00:00Z"); // 22:00 del día 3 en Bogotá
    const base = { id: "doc:2", modulo: "documentos" as const, titulo: "T", detalle: null, enlace: "/" };
    const hoy = renderToStaticMarkup(<MisTareas ahora={ahora} tareas={[{ ...base, vence: new Date("2026-11-03T20:00:00Z") }]} />);
    expect(hoy).toContain("Vence hoy");
    const ayer = renderToStaticMarkup(<MisTareas ahora={ahora} tareas={[{ ...base, vence: new Date("2026-11-02T20:00:00Z") }]} />);
    expect(ayer).toContain("Vencida");
  });
});

describe("Inicio con lecturas agrupadas", () => {
  it("la tarea agrupada enlaza a /acuses y dice cuántas son", () => {
    const h = renderToStaticMarkup(
      <MisTareas
        tareas={[{ id: "acuses", modulo: "documentos", titulo: "12 lecturas por confirmar", detalle: "La más próxima vence el 9 de noviembre de 2026", vence: null, enlace: "/acuses" }]}
      />,
    );
    expect(h).toContain('href="/acuses"');
    expect(h).toContain("12 lecturas por confirmar");
    expect(h).toContain("La más próxima vence el 9 de noviembre de 2026");
  });
});
