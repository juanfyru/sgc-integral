import { PDFDict, PDFDocument, PDFName } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { estamparCopiaControlada, imagenQr } from "@/lib/distribucion/sello-pdf";
import { pdfProtegido } from "./utiles/formato";
import { contenidoPorPagina, contieneTexto, pdfDePrueba } from "./utiles/pdf";

const BASE = {
  titulo: "COPIA CONTROLADA N.º 02",
  detalle: "GTH-PR-02 v2 · Urgencias · Entregada a Luz Dary Ortiz · 12/11/2026",
  qr: "https://sgc.gov.co/documentos/GTH-PR-02?v=2" as string | null,
  colorHex: "#1b4e8e",
  franjaCm: 1,
  qrCm: 1.5,
};

// pdf-lib deja un diccionario XObject vacío en la página: lo que cuenta es que tenga una imagen.
const tieneImagen = (doc: PDFDocument, pagina: number) => {
  const xobjetos = doc.getPage(pagina).node.Resources()?.lookup(PDFName.of("XObject"));
  return xobjetos instanceof PDFDict && xobjetos.keys().length > 0;
};

describe("imagenQr", () => {
  it("devuelve un PNG", async () => {
    const png = await imagenQr("https://sgc.gov.co/x");
    expect(Array.from(png.slice(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });
});

describe("estamparCopiaControlada", () => {
  it("estampa la franja y el QR en cada página", async () => {
    const pdf = await pdfDePrueba([[612, 792], [612, 792]]);
    const salida = await estamparCopiaControlada(pdf, BASE);
    const doc = await PDFDocument.load(salida);
    expect(doc.getPageCount()).toBe(2);
    for (const pagina of await contenidoPorPagina(salida)) {
      expect(contieneTexto(pagina, "COPIA CONTROLADA N")).toBe(true);
      expect(contieneTexto(pagina, "GTH-PR-02 v2")).toBe(true);
    }
    expect(tieneImagen(doc, 0)).toBe(true);
    expect(tieneImagen(doc, 1)).toBe(true);
  });

  it("sin QR no incrusta imagen y con un detalle larguísimo lo recorta con «…»", async () => {
    const pdf = await pdfDePrueba([[612, 792]]);
    const largo = "Entregada a una persona con un nombre interminable ".repeat(8);
    expect(largo.length).toBeGreaterThan(300);
    const salida = await estamparCopiaControlada(pdf, { ...BASE, qr: null, detalle: largo });
    const doc = await PDFDocument.load(salida);
    expect(tieneImagen(doc, 0)).toBe(false);
    const [contenido] = await contenidoPorPagina(salida);
    const cadenas = [...contenido.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)].map((m) => m[1].toUpperCase());
    const detalle = cadenas[cadenas.length - 1];
    expect(detalle.endsWith("85")).toBe(true); // «…» en WinAnsi
    expect(detalle.length / 2).toBeLessThan(largo.length);
  });

  it("dibuja la franja pegada al borde inferior y del ancho de la página", async () => {
    const pdf = await pdfDePrueba([[595, 842]]);
    const salida = await estamparCopiaControlada(pdf, { ...BASE, qr: null });
    const [contenido] = await contenidoPorPagina(salida);
    const rect = /0 28\.34\d* l\s+595 28\.34\d* l\s+595 0 l/.exec(contenido);
    expect(rect).not.toBeNull();
  });

  it("un PDF protegido lanza", async () => {
    await expect(estamparCopiaControlada(await pdfProtegido(), BASE)).rejects.toThrow();
  });
});
