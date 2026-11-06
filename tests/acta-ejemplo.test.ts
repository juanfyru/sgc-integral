/**
 * Lo que decide el handler del acta de ejemplo según el formato guardado. La sesión, la configuración
 * y el formato van simulados: guardar uno de verdad tocaría la configuración de la base de la demo.
 * Los permisos y que no escribe nada se prueban contra la BD en handlers-permisos.test.ts.
 */
import { NextRequest } from "next/server";
import { PDFDict, PDFDocument, PDFName } from "pdf-lib";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { pdfDeFormato } from "./utiles/formato";
import { contenidoPorPagina, contieneTexto } from "./utiles/pdf";

const { sesionDePeticion, obtenerConfigDocumental, obtenerMarca, membreteListo } = vi.hoisted(() => ({
  sesionDePeticion: vi.fn(),
  obtenerConfigDocumental: vi.fn(),
  obtenerMarca: vi.fn(),
  membreteListo: vi.fn(),
}));

vi.mock("@/lib/sesion-actual", () => ({ sesionDePeticion }));
vi.mock("@/db/consultas/config-documental", () => ({ obtenerConfigDocumental }));
vi.mock("@/db/consultas/entidad", () => ({ obtenerMarca }));
vi.mock("@/db/consultas/formato-acta", () => ({ membreteListo }));

import { GET } from "@/app/admin/api/acta-ejemplo/route";

const pedir = () => GET(new NextRequest("http://sgc.local/admin/api/acta-ejemplo"));
const ENTIDAD = "Entidad de la prueba";

/** Por cada página, si lleva un objeto incrustado: el membrete es el único que el acta incrusta. */
const conFondo = async (bytes: Uint8Array) =>
  (await PDFDocument.load(bytes)).getPages().map((p) => {
    const objetos = p.node.Resources()?.lookup(PDFName.of("XObject"));
    return objetos instanceof PDFDict && objetos.keys().length > 0;
  });

beforeEach(() => {
  vi.clearAllMocks();
  sesionDePeticion.mockResolvedValue({ usuarioId: Math.floor(Math.random() * 1e9), rol: "admin_sgc", verHistorial: false });
  obtenerConfigDocumental.mockResolvedValue({ formatoActa: { documentoId: null, margenSuperiorCm: 5.5, margenInferiorCm: 3.5 } });
  obtenerMarca.mockResolvedValue({ nombre: ENTIDAD });
  membreteListo.mockResolvedValue(null);
});

describe("GET /admin/api/acta-ejemplo", () => {
  it("sin formato sale el diseño básico, con el nombre de la entidad y sin errores en el registro", async () => {
    const error = vi.spyOn(console, "error");
    try {
      const res = await pedir();
      expect(res.status).toBe(200);
      const bytes = new Uint8Array(await res.arrayBuffer());
      expect(await conFondo(bytes)).not.toContain(true);
      expect(contieneTexto((await contenidoPorPagina(bytes))[0], ENTIDAD)).toBe(true);
      expect(membreteListo).toHaveBeenCalledWith(null);
      expect(error).not.toHaveBeenCalled();
    } finally {
      error.mockRestore();
    }
  });

  it("con el formato listo, cada página lleva su fondo y el texto empieza bajo su margen", async () => {
    obtenerConfigDocumental.mockResolvedValue({ formatoActa: { documentoId: 31, margenSuperiorCm: 7, margenInferiorCm: 4 } });
    membreteListo.mockResolvedValue({ archivoId: 8, ruta: "x.pdf", hash: "abc", codigo: "SGC-FO-06", version: 2, bytes: await pdfDeFormato() });
    const res = await pedir();
    expect(res.status).toBe(200);
    expect(membreteListo).toHaveBeenCalledWith(31);
    const bytes = new Uint8Array(await res.arrayBuffer());
    const fondos = await conFondo(bytes);
    expect(fondos.length).toBeGreaterThanOrEqual(2);
    expect(fondos).not.toContain(false);
    const paginas = await contenidoPorPagina(bytes);
    expect(contieneTexto(paginas[0], ENTIDAD)).toBe(false);
    const alturas = [...paginas[0].matchAll(/\b1 0 0 1 48 (\d+(?:\.\d+)?) Tm/g)].map((m) => Number(m[1]));
    expect(alturas.length).toBeGreaterThan(0);
    expect(Math.max(...alturas)).toBeLessThanOrEqual(792 - (7 * 72) / 2.54);
  });

  it("si el formato guardado no está listo, también responde 200, con el diseño básico", async () => {
    obtenerConfigDocumental.mockResolvedValue({ formatoActa: { documentoId: 31, margenSuperiorCm: 7, margenInferiorCm: 4 } });
    const res = await pedir();
    expect(res.status).toBe(200);
    expect(await conFondo(new Uint8Array(await res.arrayBuffer()))).not.toContain(true);
  });

  it("el ritmo tiene tope por usuario: 60 por minuto", async () => {
    sesionDePeticion.mockResolvedValue({ usuarioId: 777, rol: "admin_sgc", verHistorial: false });
    for (let i = 0; i < 60; i++) expect((await pedir()).status).toBe(200);
    const res = await pedir();
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("60");
  }, 30_000);
});
