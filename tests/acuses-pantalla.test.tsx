import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/app/acciones-distribucion", () => ({ confirmarLecturaAccion: vi.fn() }));

import { ListaAcusesPropios } from "@/componentes/distribucion/acuses/ListaAcusesPropios";
import { TareaAcuse } from "@/componentes/distribucion/acuses/TareaAcuse";
import type { Acuse } from "@/db/consultas/distribucion/acuses";

const base: Acuse = {
  id: 7,
  versionId: 10,
  documentoId: 20,
  codigo: "GTH-PR-02",
  titulo: "Inducción y reinducción",
  version: 2,
  usuarioId: 4,
  origen: "publicacion",
  estado: "pendiente",
  modo: null,
  jornadaId: null,
  creadoEn: new Date("2026-11-20T15:00:00Z"),
  venceEn: new Date("2026-12-05T04:59:59Z"),
  confirmadoEn: null,
  porQue: "pertenece al proceso Gestión del Talento Humano",
  queCambio: "Se añade la inducción por servicio.",
  publicadoEn: new Date("2026-11-20T15:00:00Z"),
  abierto: false,
};

describe("TareaAcuse", () => {
  it("sin haber abierto el documento deshabilita la confirmación y explica por qué", () => {
    const html = renderToStaticMarkup(<TareaAcuse acuse={base} />);
    expect(html).toContain("Abra el documento para habilitar la confirmación");
    expect(html).toMatch(/<button[^>]*\sdisabled=""[^>]*>Confirmar lectura/);
    expect(html).toContain("Se añade la inducción por servicio.");
    expect(html).toContain("pertenece al proceso Gestión del Talento Humano");
    expect(html).toContain('href="/documentos/gth-pr-02"');
    expect(html).toContain("Confirmo que leí y entendí la versión 2");
  });

  it("con el documento abierto habilita el botón", () => {
    const html = renderToStaticMarkup(<TareaAcuse acuse={{ ...base, abierto: true }} />);
    expect(html).not.toContain("Abra el documento para habilitar");
    expect(html).not.toMatch(/<button[^>]*\sdisabled=""/);
  });

  it("sin «qué cambió» dice desde cuándo es vigente la versión, o que el documento es nuevo", () => {
    expect(renderToStaticMarkup(<TareaAcuse acuse={{ ...base, queCambio: null }} />)).toContain("Versión 2, vigente desde 20 de noviembre de 2026");
    expect(renderToStaticMarkup(<TareaAcuse acuse={{ ...base, queCambio: null, version: 1 }} />)).toContain("Documento nuevo");
  });

  it("confirmada muestra la fecha y ya no ofrece el formulario", () => {
    const html = renderToStaticMarkup(
      <TareaAcuse acuse={{ ...base, estado: "confirmado", modo: "individual", confirmadoEn: new Date("2026-11-25T15:00:00Z") }} />,
    );
    expect(html).toContain("Lectura confirmada el 25 de noviembre de 2026");
    expect(html).not.toContain("<form");
  });
});

describe("ListaAcusesPropios", () => {
  it("lista pendientes y confirmados con el estado en texto", () => {
    const html = renderToStaticMarkup(
      <ListaAcusesPropios
        ahora={new Date("2026-11-21T15:00:00Z")}
        acuses={[base, { ...base, id: 8, estado: "confirmado", confirmadoEn: new Date("2026-11-22T15:00:00Z") }]}
      />,
    );
    expect(html).toContain("Por confirmar");
    expect(html).toContain("Confirmada el 22 de noviembre de 2026");
    expect(html).toContain('href="/acuses/7"');
  });

  it("sin lecturas muestra el estado vacío", () => {
    expect(renderToStaticMarkup(<ListaAcusesPropios acuses={[]} ahora={new Date()} />)).toContain("Sin lecturas");
  });
});
