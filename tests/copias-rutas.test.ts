/**
 * Lo que deciden los handlers del PDF y de la reimpresión de una copia. La emisión, la ventana y el
 * sello se prueban contra la BD en copias.test.ts; aquí van simulados para no dejar filas en `sgc`.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { copiaParaPdf, reimprimirCopia, sesionDePeticion } = vi.hoisted(() => ({
  copiaParaPdf: vi.fn(),
  reimprimirCopia: vi.fn(),
  sesionDePeticion: vi.fn(),
}));

vi.mock("@/db/consultas/distribucion/copias", () => {
  class CopiaNoVisible extends Error {}
  return { copiaParaPdf, reimprimirCopia, CopiaNoVisible };
});
vi.mock("@/lib/sesion-actual", () => ({ sesionDePeticion }));

import { GET } from "@/app/(app)/distribucion/copias/[id]/pdf/route";
import { POST } from "@/app/(app)/distribucion/copias/[id]/reimprimir/route";
import { CopiaNoVisible } from "@/db/consultas/distribucion/copias";
import { ErrorDistribucion } from "@/lib/distribucion/tipos";

const EMISOR = { usuarioId: 5, rol: "admin_sgc", verHistorial: false };
const CONSULTA = { usuarioId: 9, rol: "consulta", verHistorial: false };
const PDF = new TextEncoder().encode("%PDF-1.4\n%copia\n%%EOF");
const AVISO_VENTANA = "La ventana de impresión terminó. Use «Reimprimir» para volver a imprimir esta copia.";

const AVISO_NO_DISPONIBLE =
  "Esta copia ya no se puede imprimir: su versión dejó de estar vigente o el archivo cambió.";

const parametros = (id: string) => ({ params: Promise.resolve({ id }) });
const pedirPdf = (id = "7") => GET(new NextRequest(`http://sgc.local/distribucion/copias/${id}/pdf`), parametros(id));
const reimprimir = (cuerpo: Record<string, string>, cabeceras: Record<string, string> = {}, id = "7") =>
  POST(
    new NextRequest(`http://sgc.local/distribucion/copias/${id}/reimprimir`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", host: "sgc.local", ...cabeceras },
      body: new URLSearchParams(cuerpo).toString(),
    }),
    parametros(id),
  );

beforeEach(() => {
  vi.clearAllMocks();
  sesionDePeticion.mockResolvedValue(EMISOR);
  copiaParaPdf.mockResolvedValue({ ok: true, bytes: PDF, nombre: "GTH-PR-02-v2-copia-01.pdf" });
  reimprimirCopia.mockResolvedValue(undefined);
});

describe("GET /distribucion/copias/[id]/pdf", () => {
  it("sin sesión responde 401 y no consulta nada", async () => {
    sesionDePeticion.mockResolvedValue(null);
    expect((await pedirPdf()).status).toBe(401);
    expect(copiaParaPdf).not.toHaveBeenCalled();
  });

  it("sirve el PDF sellado, en el navegador y sin caché", async () => {
    const res = await pedirPdf();
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toMatch(/^inline; filename="GTH-PR-02-v2-copia-01\.pdf"/);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(Buffer.from(await res.arrayBuffer()).equals(Buffer.from(PDF))).toBe(true);
    expect(copiaParaPdf).toHaveBeenCalledWith(7, EMISOR);
  });

  it("quien no ve la copia recibe 404, no 403", async () => {
    sesionDePeticion.mockResolvedValue(CONSULTA);
    copiaParaPdf.mockResolvedValue({ ok: false, estado: 404 });
    const res = await pedirPdf();
    expect(res.status).toBe(404);
    expect(res.headers.get("Content-Type")).not.toBe("application/pdf");
  });

  it("fuera de la ventana responde 409 con el aviso", async () => {
    copiaParaPdf.mockResolvedValue({ ok: false, estado: 409, motivo: "ventana" });
    const res = await pedirPdf();
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: AVISO_VENTANA });
  });

  it("si la versión dejó de estar vigente o el archivo cambió, el 409 no habla de la ventana", async () => {
    copiaParaPdf.mockResolvedValue({ ok: false, estado: 409, motivo: "no_disponible" });
    const res = await pedirPdf();
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: AVISO_NO_DISPONIBLE });
  });

  it("un id que no es un número responde 404 sin consultar", async () => {
    expect((await pedirPdf("abc")).status).toBe(404);
    expect(copiaParaPdf).not.toHaveBeenCalled();
  });
});

describe("POST /distribucion/copias/[id]/reimprimir", () => {
  it("sin sesión responde 401", async () => {
    sesionDePeticion.mockResolvedValue(null);
    expect((await reimprimir({ motivo: "ilegible" })).status).toBe(401);
    expect(reimprimirCopia).not.toHaveBeenCalled();
  });

  it("sin el permiso de emitir responde 403", async () => {
    sesionDePeticion.mockResolvedValue(CONSULTA);
    expect((await reimprimir({ motivo: "ilegible" })).status).toBe(403);
    expect(reimprimirCopia).not.toHaveBeenCalled();
  });

  it("con un Origin ajeno responde 403", async () => {
    const res = await reimprimir({ motivo: "ilegible" }, { origin: "http://otro.local" });
    expect(res.status).toBe(403);
    expect(reimprimirCopia).not.toHaveBeenCalled();
  });

  it("con motivo reimprime y responde el PDF", async () => {
    const res = await reimprimir({ motivo: "otro", texto: "Se mojó" }, { origin: "http://sgc.local" });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(reimprimirCopia).toHaveBeenCalledWith(7, EMISOR, "otro", "Se mojó");
    expect(copiaParaPdf).toHaveBeenCalledWith(7, EMISOR);
  });

  it("un motivo desconocido responde 400", async () => {
    expect((await reimprimir({ motivo: "porque sí" })).status).toBe(400);
    expect(reimprimirCopia).not.toHaveBeenCalled();
  });

  it("una copia que la persona no ve responde 404, nunca 409 ni 403", async () => {
    reimprimirCopia.mockRejectedValue(new CopiaNoVisible());
    const res = await reimprimir({ motivo: "ilegible" });
    expect(res.status).toBe(404);
    expect(copiaParaPdf).not.toHaveBeenCalled();
  });

  it("un error de negocio responde 409 con su mensaje", async () => {
    reimprimirCopia.mockRejectedValue(new ErrorDistribucion("La copia ya no está en ese estado"));
    const res = await reimprimir({ motivo: "ilegible" });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "La copia ya no está en ese estado" });
    expect(copiaParaPdf).not.toHaveBeenCalled();
  });
});
