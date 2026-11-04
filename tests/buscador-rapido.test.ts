import { describe, expect, it } from "vitest";
import { estadoDeBusqueda, normalizarConsulta } from "@/lib/busqueda-rapida";

describe("normalizarConsulta", () => {
  it("quita las marcas de resaltado y recorta a 120 caracteres", () => {
    const q = normalizarConsulta("⟦acta⟧ " + "x".repeat(300));
    expect(q).toHaveLength(120);
    expect(q).not.toContain("⟦");
    expect(q).not.toContain("⟧");
  });
});

describe("estadoDeBusqueda", () => {
  const respuesta = { consulta: "acta", resultados: [] };
  it("una tecla que no cambia la consulta recortada conserva el estado listo", () => {
    expect(estadoDeBusqueda("acta", respuesta)).toBe("listo");
    expect(estadoDeBusqueda("acta ".trim(), respuesta)).toBe("listo");
  });
  it("una respuesta de otra consulta no cuenta como actual", () => {
    expect(estadoDeBusqueda("actas", respuesta)).toBe("cargando");
  });
  it("inactivo con menos de 2 caracteres y error cuando la petición falló", () => {
    expect(estadoDeBusqueda("a", respuesta)).toBe("inactivo");
    expect(estadoDeBusqueda("acta", { consulta: "acta", resultados: null })).toBe("error");
  });
});
