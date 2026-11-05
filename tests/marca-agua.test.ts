/**
 * Marca de agua "COPIA NO CONTROLADA" (ISO 9001 — 7.5.3): toda descarga
 * pública de un PDF entrega una copia estampada página por página, con el
 * nombre de quien descarga y la fecha en la zona de la instalación. Si un PDF
 * no se puede estampar (cifrado/corrupto), la función lanza y el llamador
 * decide el fallback. Estos tests no requieren BD.
 */
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { estamparCopiaNoControlada } from "@/lib/marca-agua";
import { respuestaArchivoEstampado } from "@/lib/servir-archivo";
import { contenidoPorPagina, contieneTexto, pdfDePrueba } from "./utiles/pdf";

// Instante fijo: el día se calcula en la zona pedida, no en la de la máquina.
const FECHA = new Date("2026-08-24T15:00:00Z"); // 24/08/2026 en Bogotá
const ZONA = "America/Bogota";
const NOMBRE = "Ana Pérez";
const DATOS = { fecha: FECHA, nombre: NOMBRE, zona: ZONA };

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

    const estampado = await estamparCopiaNoControlada(original, DATOS);
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
    const estampado = await estamparCopiaNoControlada(original, DATOS);
    for (const contenido of await contenidoPorPagina(estampado)) {
      expect(contieneTexto(contenido, "24/08/2026")).toBe(true);
    }
  });

  it("la leyenda lleva el nombre y el día en la zona pedida, no en la del proceso", async () => {
    const original = await pdfDePrueba([
      [612, 792],
      [612, 792],
    ]);
    const estampado = await estamparCopiaNoControlada(original, {
      fecha: new Date("2026-11-06T03:30:00Z"), // las 22:30 del día 5 en Bogotá
      nombre: "María Ñáñez",
      zona: ZONA,
    });
    for (const contenido of await contenidoPorPagina(estampado)) {
      expect(contieneTexto(contenido, "Descargada por María Ñáñez el 05/11/2026")).toBe(true);
    }
    const enTokio = await estamparCopiaNoControlada(original, {
      fecha: new Date("2026-11-06T03:30:00Z"),
      nombre: "María Ñáñez",
      zona: "Asia/Tokyo",
    });
    for (const contenido of await contenidoPorPagina(enTokio)) {
      expect(contieneTexto(contenido, "Descargada por María Ñáñez el 06/11/2026")).toBe(true);
    }
  });

  it("un nombre con caracteres fuera de la fuente no hace fallar el estampado: cada uno pasa a ?", async () => {
    const original = await pdfDePrueba([[612, 792]]);
    const estampado = await estamparCopiaNoControlada(original, {
      ...DATOS,
      nombre: "Иван 😀 Ruiz\n\tÑ",
    });
    const [contenido] = await contenidoPorPagina(estampado);
    expect(contieneTexto(contenido, "COPIA NO CONTROLADA")).toBe(true);
    expect(contieneTexto(contenido, "Descargada por ???? ? Ruiz??Ñ el 24/08/2026")).toBe(true);
  });

  it("recorta el nombre a 60 caracteres, sin partir un carácter de dos unidades", async () => {
    const original = await pdfDePrueba([[612, 792]]);
    const conNombre = async (nombre: string) => {
      const estampado = await estamparCopiaNoControlada(original, { ...DATOS, nombre });
      return (await contenidoPorPagina(estampado))[0];
    };
    const largo = await conNombre("A".repeat(61));
    expect(contieneTexto(largo, `Descargada por ${"A".repeat(60)} el 24/08/2026`)).toBe(true);
    const emojis = await conNombre("😀".repeat(61));
    expect(contieneTexto(emojis, `Descargada por ${"?".repeat(60)} el 24/08/2026`)).toBe(true);
  });

  it("la leyenda de un nombre largo en mayúsculas no se sale de la página", async () => {
    const original = await pdfDePrueba([
      [612, 792],
      [842, 595],
    ]);
    const nombre = "M".repeat(60);
    const paginas = await contenidoPorPagina(
      await estamparCopiaNoControlada(original, { ...DATOS, nombre }),
    );
    const fuente = await (await PDFDocument.create()).embedFont(StandardFonts.HelveticaBold);
    const leyenda = `Descargada por ${nombre} el 24/08/2026 — verifique su vigencia en el SGC`;
    for (const [i, [ancho, alto]] of [[612, 792], [842, 595]].entries()) {
      // Cada página dibuja la marca y, después, la leyenda.
      const [, tamLeyenda] = [...paginas[i].matchAll(/([\d.]+) Tf/g)].map((m) => Number(m[1]));
      expect(fuente.widthOfTextAtSize(leyenda, tamLeyenda)).toBeLessThanOrEqual(Math.hypot(ancho, alto) * 0.86);
    }
  });

  it("conserva el número y el tamaño de las páginas", async () => {
    const original = await pdfDePrueba([
      [612, 792],
      [842, 595],
    ]);
    const estampado = await estamparCopiaNoControlada(original, DATOS);
    const doc = await PDFDocument.load(estampado);
    expect(doc.getPageCount()).toBe(2);
    expect(doc.getPage(0).getSize()).toEqual({ width: 612, height: 792 });
    expect(doc.getPage(1).getSize()).toEqual({ width: 842, height: 595 });
  });

  it("lanza ante un buffer que no es un PDF", async () => {
    const noPdf = Buffer.from("esto no es un PDF");
    await expect(estamparCopiaNoControlada(noPdf, DATOS)).rejects.toThrow();
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
      NOMBRE,
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
      NOMBRE,
      FECHA,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Disposition")).toContain("inline");

    const cuerpo = new Uint8Array(await res.arrayBuffer());
    const [pagina] = await contenidoPorPagina(cuerpo);
    expect(contieneTexto(pagina, "COPIA NO CONTROLADA")).toBe(true);
  });

  it("estampa el nombre recibido con la zona de la instalación", async () => {
    vi.stubEnv("ZONA_HORARIA", "Asia/Tokyo");
    try {
      const res = await respuestaArchivoEstampado(
        {
          ruta: "DOC/v1/doc.pdf",
          mime: "application/pdf",
          nombreOriginal: "Manual de calidad.pdf",
        },
        true,
        "María Ñáñez",
        new Date("2026-11-05T20:00:00Z"), // ya es el día 6 en Tokio; en Bogotá sigue siendo el 5
      );
      const [pagina] = await contenidoPorPagina(new Uint8Array(await res.arrayBuffer()));
      expect(contieneTexto(pagina, "Descargada por María Ñáñez el 06/11/2026")).toBe(true);
    } finally {
      vi.unstubAllEnvs();
    }
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
        NOMBRE,
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
        NOMBRE,
        FECHA,
      );
      expect(res.status).toBe(404);
    } finally {
      error.mockRestore();
    }
  });
});
