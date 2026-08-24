/**
 * Marca de agua "COPIA NO CONTROLADA" (ISO 9001 — 7.5.3): toda descarga
 * pública de un PDF entrega una copia estampada página por página, con la
 * fecha de descarga. Si un PDF no se puede estampar (cifrado/corrupto), la
 * función lanza y el llamador decide el fallback. Estos tests no requieren BD.
 */
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { estamparCopiaNoControlada } from "@/lib/marca-agua";
import { respuestaArchivoEstampado } from "@/lib/servir-archivo";
import { contenidoPorPagina, contieneTexto, pdfDePrueba } from "./utiles/pdf";

const FECHA = new Date(2026, 7, 24); // 24/08/2026

describe("estamparCopiaNoControlada", () => {
  it("estampa COPIA NO CONTROLADA en cada página (vertical, horizontal y pequeña)", async () => {
    const original = await pdfDePrueba([
      [612, 792],
      [842, 595],
      [300, 400],
    ]);
    // Sanidad del fixture: el original no trae la marca en ninguna página.
    for (const contenido of await contenidoPorPagina(original)) {
      expect(contieneTexto(contenido, "COPIA NO CONTROLADA")).toBe(false);
    }

    const estampado = await estamparCopiaNoControlada(original, FECHA);
    const paginas = await contenidoPorPagina(estampado);
    expect(paginas).toHaveLength(3);
    for (const contenido of paginas) {
      expect(contieneTexto(contenido, "COPIA NO CONTROLADA")).toBe(true);
    }
  });

  it("estampa la fecha de descarga en cada página", async () => {
    const original = await pdfDePrueba([
      [612, 792],
      [612, 792],
    ]);
    const estampado = await estamparCopiaNoControlada(original, FECHA);
    for (const contenido of await contenidoPorPagina(estampado)) {
      expect(contieneTexto(contenido, "24/08/2026")).toBe(true);
    }
  });

  it("conserva el número y el tamaño de las páginas", async () => {
    const original = await pdfDePrueba([
      [612, 792],
      [842, 595],
    ]);
    const estampado = await estamparCopiaNoControlada(original, FECHA);
    const doc = await PDFDocument.load(estampado);
    expect(doc.getPageCount()).toBe(2);
    expect(doc.getPage(0).getSize()).toEqual({ width: 612, height: 792 });
    expect(doc.getPage(1).getSize()).toEqual({ width: 842, height: 595 });
  });

  it("lanza ante un buffer que no es un PDF", async () => {
    const noPdf = Buffer.from("esto no es un PDF");
    await expect(estamparCopiaNoControlada(noPdf, FECHA)).rejects.toThrow();
  });
});

describe("respuestaArchivoEstampado", () => {
  let base: string;
  const almacenPrevio = process.env.ALMACEN_RUTA;

  beforeAll(async () => {
    base = await mkdtemp(path.join(tmpdir(), "sgc-marca-"));
    process.env.ALMACEN_RUTA = base;
    await mkdir(path.join(base, "DOC", "v1"), { recursive: true });
    await writeFile(
      path.join(base, "DOC", "v1", "doc.pdf"),
      await pdfDePrueba([[612, 792]]),
    );
    await writeFile(path.join(base, "DOC", "v1", "roto.pdf"), "no soy un pdf");
  });

  afterAll(async () => {
    if (almacenPrevio === undefined) delete process.env.ALMACEN_RUTA;
    else process.env.ALMACEN_RUTA = almacenPrevio;
    await rm(base, { recursive: true, force: true });
  });

  it("sirve el PDF estampado como adjunto con las cabeceras correctas", async () => {
    const res = await respuestaArchivoEstampado(
      {
        ruta: "DOC/v1/doc.pdf",
        mime: "application/pdf",
        nombreOriginal: "Manual de calidad.pdf",
      },
      true,
      FECHA,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toContain("attachment");
    expect(res.headers.get("Cache-Control")).toBe("no-store");

    const cuerpo = new Uint8Array(await res.arrayBuffer());
    expect(res.headers.get("Content-Length")).toBe(String(cuerpo.byteLength));
    const [pagina] = await contenidoPorPagina(cuerpo);
    expect(contieneTexto(pagina, "COPIA NO CONTROLADA")).toBe(true);
  });

  it("sirve el PDF estampado inline para la vista previa", async () => {
    const res = await respuestaArchivoEstampado(
      {
        ruta: "DOC/v1/doc.pdf",
        mime: "application/pdf",
        nombreOriginal: "Manual de calidad.pdf",
      },
      false,
      FECHA,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Disposition")).toContain("inline");

    const cuerpo = new Uint8Array(await res.arrayBuffer());
    const [pagina] = await contenidoPorPagina(cuerpo);
    expect(contieneTexto(pagina, "COPIA NO CONTROLADA")).toBe(true);
  });

  it("ante un PDF que no se puede estampar sirve el original intacto y lo registra", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const res = await respuestaArchivoEstampado(
        {
          ruta: "DOC/v1/roto.pdf",
          mime: "application/pdf",
          nombreOriginal: "roto.pdf",
        },
        true,
        FECHA,
      );
      expect(res.status).toBe(200);
      expect(Buffer.from(await res.arrayBuffer()).toString()).toBe(
        "no soy un pdf",
      );
      expect(error).toHaveBeenCalled();
    } finally {
      error.mockRestore();
    }
  });

  it("responde 404 si el archivo no existe en el almacén", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const res = await respuestaArchivoEstampado(
        {
          ruta: "DOC/v1/no-existe.pdf",
          mime: "application/pdf",
          nombreOriginal: "no-existe.pdf",
        },
        true,
        FECHA,
      );
      expect(res.status).toBe(404);
    } finally {
      error.mockRestore();
    }
  });
});
