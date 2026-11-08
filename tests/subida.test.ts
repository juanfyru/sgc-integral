import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { sanearNombre, validarTipo, validarTipoEvidencia } from "@/lib/subida";
import { pdfDePrueba } from "./utiles/pdf";

// Cabeceras mínimas reales por formato para probar magic bytes.
const PDF = new TextEncoder().encode("%PDF-1.4\n%fin");
// Firma PNG + chunk IHDR mínimo (file-type exige ver IHDR, no solo la firma).
const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52,
  0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0,
]);
const EXE = new TextEncoder().encode("MZ\x90\x00programa");

async function docxMinimo(): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", "<Types/>");
  zip.file("word/document.xml", "<w:document/>");
  return await zip.generateAsync({ type: "uint8array" });
}

describe("sanearNombre", () => {
  it("translitera acentos y elimina caracteres peligrosos", () => {
    expect(sanearNombre("Acta de Reunión Nº 5.pdf")).toBe("acta-de-reunion-n-5.pdf");
  });
  it("elimina rutas (path traversal)", () => {
    expect(sanearNombre("..\\..\\evil.pdf")).toBe("evil.pdf");
    expect(sanearNombre("../../etc/passwd")).toBe("passwd");
  });
  it("nunca devuelve vacío ni puntos sueltos", () => {
    expect(sanearNombre("")).toBe("archivo");
    expect(sanearNombre("...")).toBe("archivo");
  });
  it("recorta a 100 caracteres conservando la extensión", () => {
    const largo = "a".repeat(200) + ".pdf";
    const resultado = sanearNombre(largo);
    expect(resultado.length).toBeLessThanOrEqual(100);
    expect(resultado.endsWith(".pdf")).toBe(true);
  });
});

describe("validarTipo", () => {
  it("acepta un PDF real con extensión .pdf", async () => {
    const r = await validarTipo("informe.pdf", PDF);
    expect(r).toMatchObject({ ok: true, extension: "pdf", mime: "application/pdf" });
  });

  it("acepta un DOCX real (zip OOXML)", async () => {
    const r = await validarTipo("acta.docx", await docxMinimo());
    expect(r.ok).toBe(true);
  });

  it("rechaza extensión fuera de la allowlist", async () => {
    const r = await validarTipo("script.sh", PDF);
    expect(r).toMatchObject({ ok: false });
  });

  it("rechaza un ejecutable renombrado a .pdf (magic bytes mandan)", async () => {
    const r = await validarTipo("factura.pdf", EXE);
    expect(r.ok).toBe(false);
  });

  it("rechaza un PNG renombrado a .pdf (incoherencia)", async () => {
    const r = await validarTipo("foto.pdf", PNG);
    expect(r.ok).toBe(false);
  });

  it("acepta un PNG con su extensión", async () => {
    const r = await validarTipo("logo.png", PNG);
    expect(r).toMatchObject({ ok: true, mime: "image/png" });
  });
});

describe("validarTipoEvidencia", () => {
  const MENSAJE = "La evidencia debe ser PDF o imagen (PNG, JPG, WebP)";

  it("acepta un PNG y un PDF por su contenido", async () => {
    expect(await validarTipoEvidencia("foto.png", PNG)).toEqual({ ok: true, extension: "png", mime: "image/png" });
    const pdf = await validarTipoEvidencia("acta.pdf", await pdfDePrueba([[612, 792]]));
    expect(pdf).toEqual({ ok: true, extension: "pdf", mime: "application/pdf" });
  });

  it("rechaza un docx con el mensaje de la evidencia", async () => {
    expect(await validarTipoEvidencia("lista.docx", await docxMinimo())).toEqual({ ok: false, error: MENSAJE });
  });

  it("rechaza un SVG renombrado a .png y un .svg", async () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    expect(await validarTipoEvidencia("foto.png", svg)).toEqual({ ok: false, error: MENSAJE });
    expect(await validarTipoEvidencia("foto.svg", svg)).toEqual({ ok: false, error: MENSAJE });
  });
});
