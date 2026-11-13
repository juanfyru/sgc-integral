/**
 * Las secciones de indicadores de la página del proceso y de la ficha de una norma (Fase 14A, Tarea 17): sin indicadores
 * visibles no se pintan, ni su título; con ellos, estado escrito y enlaces a la página de cada indicador.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { IndicadoresDelProceso } from "@/componentes/indicadores/IndicadoresDelProceso";
import { IndicadoresQueExige } from "@/componentes/indicadores/IndicadoresQueExige";
import type { FilaDeProceso } from "@/db/consultas/indicadores/lista";

const fila = (o: Partial<FilaDeProceso> = {}): FilaDeProceso => ({
  id: 1,
  codigo: "GTH-IND-01",
  nombre: "Cumplimiento del plan",
  resultado: "92 %",
  semaforo: "bien",
  cumple: true,
  noAplica: false,
  periodo: "2026-T3",
  etiquetaPeriodo: "Tercer trimestre de 2026",
  restringido: false,
  ...o,
});

describe("IndicadoresDelProceso", () => {
  it("un Bien que no alcanza la meta lo dice en el estado de la fila", () => {
    const html = renderToStaticMarkup(<IndicadoresDelProceso procesoId={3} titulo="Indicadores del proceso" propios={[fila({ cumple: false })]} porSubproceso={[]} />);
    expect(html).toContain("Bien · no alcanza la meta");
  });

  it("sin indicadores visibles no pinta nada, ni el título", () => {
    expect(renderToStaticMarkup(<IndicadoresDelProceso procesoId={3} titulo="Indicadores del proceso" propios={[]} porSubproceso={[]} />)).toBe("");
  });

  it("pinta código, nombre enlazado, periodo, resultado y estado escrito, y el enlace a la matriz", () => {
    const html = renderToStaticMarkup(
      <IndicadoresDelProceso
        procesoId={3}
        titulo="Indicadores del proceso"
        propios={[fila(), fila({ id: 2, codigo: "GTH-IND-02", resultado: null, semaforo: null, restringido: true })]}
        porSubproceso={[{ subprocesoId: 9, nombre: "Nómina", filas: [fila({ id: 3, codigo: "GTH-IND-03" })] }]}
      />,
    );
    expect(html).toContain("Indicadores del proceso");
    expect(html).toContain('href="/indicadores/GTH-IND-01"');
    expect(html).toContain("92 %");
    expect(html).toContain("Bien");
    expect(html).toContain("Restringido");
    expect(html).toContain("Lista de indicadores del proceso");
    expect(html).toContain("Sin dato");
    expect(html).toContain("Subproceso: Nómina");
    expect(html).toContain('href="/indicadores/matriz?proceso=3"');
    expect(html).toContain("Ver la matriz del proceso");
  });
});

describe("IndicadoresQueExige", () => {
  it("no se pinta con la lista vacía y, con indicadores, los enlaza con su proceso", () => {
    expect(renderToStaticMarkup(<IndicadoresQueExige indicadores={[]} clase="x" />)).toBe("");
    const html = renderToStaticMarkup(
      <IndicadoresQueExige indicadores={[{ codigo: "GTH-IND-01", nombre: "Cumplimiento del plan", proceso: "Gestión del Talento Humano" }]} clase="x" />,
    );
    expect(html).toContain("Indicadores que exige");
    expect(html).toContain('href="/indicadores/GTH-IND-01"');
    expect(html).toContain("Gestión del Talento Humano");
  });
});
