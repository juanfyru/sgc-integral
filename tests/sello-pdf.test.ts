import { PDFDict, PDFDocument, PDFName, degrees } from "pdf-lib";
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

const CM = 72 / 2.54;

/** Los bloques de texto del contenido: tamaño y ordenada de la línea base, en el espacio visual del sello. */
function textos(contenido: string): { tamano: number; y: number }[] {
  return [...contenido.matchAll(/\/\S+ ([\d.]+) Tf[\s\S]*?1 0 0 1 [-\d.]+ ([-\d.]+) Tm/g)].map((m) => ({
    tamano: Number(m[1]),
    y: Number(m[2]),
  }));
}

describe("franjas bajas", () => {
  it.each([0.5, 0.6, 0.7])("con %s cm el texto queda dentro de la franja y sigue en cada página", async (franjaCm) => {
    const alto = franjaCm * CM;
    const salida = await estamparCopiaControlada(await pdfDePrueba([[612, 792], [612, 792]]), { ...BASE, franjaCm });
    for (const pagina of await contenidoPorPagina(salida)) {
      expect(contieneTexto(pagina, "COPIA CONTROLADA N")).toBe(true);
      const lineas = textos(pagina);
      expect(lineas.length).toBeGreaterThan(0);
      for (const { tamano, y } of lineas) {
        expect(y - 0.21 * tamano).toBeGreaterThanOrEqual(-0.01); // descendentes dentro de la página
        expect(y + 0.72 * tamano).toBeLessThanOrEqual(alto + 0.01); // altura de las mayúsculas dentro de la franja
      }
    }
  });
});

/** Aplica al punto las matrices `cm` del contenido, de la última (más interna) a la primera. */
function aEspacioDePagina(contenido: string, x: number, y: number): [number, number] {
  const antes = contenido.slice(0, contenido.indexOf("\nf\n"));
  const matrices = [...antes.matchAll(/([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+) cm/g)].map((m) =>
    m.slice(1, 7).map(Number),
  );
  let p: [number, number] = [x, y];
  for (const [a, b, c, d, e, f] of matrices.reverse()) p = [p[0] * a + p[1] * c + e, p[0] * b + p[1] * d + f];
  return p;
}

describe("páginas rotadas o con MediaBox desplazado", () => {
  const alto = 1 * CM;
  const borde = (contenido: string, ancho: number) => {
    const esquinas = [
      aEspacioDePagina(contenido, 0, 0),
      aEspacioDePagina(contenido, ancho, 0),
      aEspacioDePagina(contenido, ancho, alto),
      aEspacioDePagina(contenido, 0, alto),
    ];
    const xs = esquinas.map((e) => e[0]);
    const ys = esquinas.map((e) => e[1]);
    return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  };

  it("con /Rotate 90 la franja queda en el borde inferior visual (el derecho del espacio de la página)", async () => {
    const origen = await PDFDocument.create();
    origen.addPage([612, 792]).setRotation(degrees(90));
    const salida = await estamparCopiaControlada(await origen.save(), { ...BASE, qr: null });
    const [contenido] = await contenidoPorPagina(salida);
    const r = borde(contenido, 792); // ancho visual = alto del espacio de la página
    expect(r.x0).toBeCloseTo(612 - alto, 1);
    expect(r.x1).toBeCloseTo(612, 1);
    expect(r.y0).toBeCloseTo(0, 1);
    expect(r.y1).toBeCloseTo(792, 1);
  });

  it("con /Rotate 270 queda en el borde izquierdo del espacio de la página", async () => {
    const origen = await PDFDocument.create();
    origen.addPage([612, 792]).setRotation(degrees(270));
    const salida = await estamparCopiaControlada(await origen.save(), { ...BASE, qr: null });
    const [contenido] = await contenidoPorPagina(salida);
    const r = borde(contenido, 792);
    expect(r.x0).toBeCloseTo(0, 1);
    expect(r.x1).toBeCloseTo(alto, 1);
    expect(r.y1).toBeCloseTo(792, 1);
  });

  it("con /Rotate 180 queda en el borde superior del espacio de la página", async () => {
    const origen = await PDFDocument.create();
    origen.addPage([612, 792]).setRotation(degrees(180));
    const salida = await estamparCopiaControlada(await origen.save(), { ...BASE, qr: null });
    const [contenido] = await contenidoPorPagina(salida);
    const r = borde(contenido, 612);
    expect(r.y0).toBeCloseTo(792 - alto, 1);
    expect(r.y1).toBeCloseTo(792, 1);
    expect(r.x0).toBeCloseTo(0, 1);
    expect(r.x1).toBeCloseTo(612, 1);
  });

  it("con un MediaBox cuyo origen no es (0, 0) la franja sigue en el borde inferior visible", async () => {
    const origen = await PDFDocument.create();
    origen.addPage().setMediaBox(100, 100, 612, 792); // [100, 100, 712, 892]
    const salida = await estamparCopiaControlada(await origen.save(), { ...BASE, qr: null });
    const [contenido] = await contenidoPorPagina(salida);
    const r = borde(contenido, 612);
    expect(r.x0).toBeCloseTo(100, 1);
    expect(r.x1).toBeCloseTo(712, 1);
    expect(r.y0).toBeCloseTo(100, 1);
    expect(r.y1).toBeCloseTo(100 + alto, 1);
  });
});
