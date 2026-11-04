import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Dialogo } from "@/componentes/ui/Dialogo";
import { GraficoBarras } from "@/componentes/ui/GraficoBarras";

const html = (n: React.ReactElement) => renderToStaticMarkup(n);

describe("Dialogo y GraficoBarras en ui", () => {
  it("Dialogo renderiza un dialog nativo etiquetado por su título", () => {
    const h = html(
      <Dialogo abierto={false} alCerrar={() => {}} titulo="Buscar">
        x
      </Dialogo>,
    );
    expect(h).toContain("<dialog");
    expect(h).toContain("aria-labelledby");
    expect(h).toContain("Buscar");
  });
  it("GraficoBarras usa el color del módulo Documentos", () => {
    const h = html(
      <GraficoBarras
        serie={[
          { fecha: "2026-11-01", conteo: 2 },
          { fecha: "2026-11-02", conteo: 5 },
        ]}
      />,
    );
    expect(h).toContain("fill-mod-documentos");
    expect(h).toContain('role="img"');
  });
});
