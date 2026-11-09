import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { estadoDeBusqueda, gruposDeResultados, normalizarConsulta, type ResultadoRapido } from "@/lib/busqueda-rapida";

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

describe("opción activa de la búsqueda Ctrl K", () => {
  it("se marca con fondo neutro y un borde izquierdo de marca, sin texto de marca sobre el tinte", async () => {
    const { claseOpcion } = await import("@/componentes/cascaron/Buscador");
    const activa = claseOpcion(true).split(/\s+/);
    expect(activa).toEqual(expect.arrayContaining(["bg-muted", "text-foreground", "border-l-2", "border-marca"]));
    expect(activa).not.toContain("text-marca");
    expect(activa).not.toContain("bg-marca-tinte");
  });
  it("la inactiva reserva el mismo borde (sin salto al moverse) y conserva el hover", async () => {
    const { claseOpcion } = await import("@/componentes/cascaron/Buscador");
    const inactiva = claseOpcion(false).split(/\s+/);
    expect(inactiva).toEqual(expect.arrayContaining(["border-l-2", "border-transparent", "text-foreground", "hover:bg-muted"]));
  });
});

describe("el grupo «Normas» de la paleta", () => {
  const norma: ResultadoRapido = {
    grupo: "norma",
    codigo: "Resolución 3100 de 2019",
    titulo: "Procedimientos y condiciones de inscripción y habilitación",
    tituloResaltado: null,
    tipo: "Vigente",
    ruta: "/normograma/7",
  };
  const documento: ResultadoRapido = {
    grupo: "documento",
    codigo: "SOG-MN-01",
    titulo: "Manual de habilitación",
    tituloResaltado: null,
    tipo: "MN",
    ruta: "/documentos/sog-mn-01",
  };
  it("separa los documentos de las normas: las normas van debajo, en el orden en que llegaron", () => {
    const otra = { ...norma, codigo: "Resolución 2003 de 2014", ruta: "/normograma/8", tipo: "Derogada" };
    expect(gruposDeResultados([norma, documento, otra])).toEqual({ documentos: [documento], normas: [norma, otra] });
    expect(gruposDeResultados([])).toEqual({ documentos: [], normas: [] });
  });
});

describe("los grupos de la paleta", () => {
  it("un grupo sin resultados no pinta su encabezado; con resultados, el encabezado y su grupo con nombre", async () => {
    const { GrupoPaleta } = await import("@/componentes/cascaron/Buscador");
    expect(renderToStaticMarkup(createElement(GrupoPaleta, { titulo: "Documentos", vacio: true }, null))).toBe("");
    const html = renderToStaticMarkup(createElement(GrupoPaleta, { titulo: "Normas", vacio: false }, createElement("li", null, "Resolución 3100 de 2019")));
    expect(html).toContain(">Normas</p>");
    expect(html).toContain('<ul role="group" aria-label="Normas"><li>Resolución 3100 de 2019</li></ul>');
  });
});
