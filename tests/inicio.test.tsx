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
        tareas={[{ id: "doc:1", modulo: "documentos", titulo: "Aprobar PR-GTH-012 v3", detalle: null, vence: new Date("2026-11-01T00:00:00Z"), enlace: "/admin" }]}
      />,
    );
    expect(h).toContain("Vencida");
    expect(h).toContain('data-variante="critico"');
    expect(h).toContain("bg-mod-documentos");
  });
});
