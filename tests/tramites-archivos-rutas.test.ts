/**
 * Lo que deciden los handlers de los archivos del trámite una vez hay sesión: qué operación
 * autorizan y qué hacen con la respuesta. La autorización se prueba contra la BD en
 * tramites-archivos.test.ts; aquí va simulada, para que un trámite real no deje filas en `sgc`.
 */
import { mkdirSync, mkdtempSync, existsSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { autorizarArchivoDeTramite, archivoDeTramite, registrarArchivo, eliminarArchivoBorrador, obtenerArchivoAdmin, sesionDePeticion } = vi.hoisted(() => ({
  autorizarArchivoDeTramite: vi.fn(),
  archivoDeTramite: vi.fn(),
  registrarArchivo: vi.fn(),
  eliminarArchivoBorrador: vi.fn(),
  obtenerArchivoAdmin: vi.fn(),
  sesionDePeticion: vi.fn(),
}));

vi.mock("@/db/consultas/tramites-archivos", () => ({ autorizarArchivoDeTramite, archivoDeTramite }));
vi.mock("@/db/consultas/admin", () => ({ registrarArchivo, eliminarArchivoBorrador, obtenerArchivoAdmin }));
vi.mock("@/lib/sesion-actual", () => ({ sesionDePeticion }));

import { GET } from "@/app/(app)/tramites/[id]/archivos/[archivoId]/[[...nombre]]/route";
import { DELETE as quitarDelPanel } from "@/app/admin/api/archivos/[archivoId]/route";
import { DELETE } from "@/app/api/tramites/[id]/archivos/[archivoId]/route";
import { POST } from "@/app/api/tramites/[id]/archivos/route";
import { ErrorTramite } from "@/db/consultas/flujo/contrato";

const PDF = new TextEncoder().encode("%PDF-1.4\n%borrador de prueba\n%%EOF");
const SESION = { usuarioId: 5, rol: "consulta" };
const ACEPTADO = { ok: true, versionId: 4, codigo: "GTH-PR-02", numero: 2 };
const RUTA = "documentos/GTH-PR-02/v2/borrador.pdf";

let almacen: string;
const previo = process.env.ALMACEN_RUTA;
const absoluta = () => path.join(almacen, ...RUTA.split("/"));
const escribirBorrador = () => {
  mkdirSync(path.dirname(absoluta()), { recursive: true });
  writeFileSync(absoluta(), PDF);
};

beforeAll(() => {
  almacen = mkdtempSync(path.join(tmpdir(), "sgc-rutas-tramite-"));
  process.env.ALMACEN_RUTA = almacen;
});

afterAll(() => {
  if (previo === undefined) delete process.env.ALMACEN_RUTA;
  else process.env.ALMACEN_RUTA = previo;
  rmSync(almacen, { recursive: true, force: true });
});

beforeEach(() => {
  vi.clearAllMocks();
  rmSync(path.join(almacen, "documentos"), { recursive: true, force: true });
  sesionDePeticion.mockResolvedValue(SESION);
  autorizarArchivoDeTramite.mockResolvedValue(ACEPTADO);
  archivoDeTramite.mockResolvedValue({ ruta: RUTA, mime: "application/pdf", nombreOriginal: "Borrador.pdf" });
  registrarArchivo.mockResolvedValue({ id: 21 });
  eliminarArchivoBorrador.mockResolvedValue({ ruta: RUTA });
});

describe("POST /api/tramites/[id]/archivos", () => {
  const subir = () =>
    POST(
      new NextRequest("http://sgc.local/api/tramites/7/archivos?rol=principal", {
        method: "POST",
        body: PDF,
        headers: { "x-nombre-archivo": "Borrador.pdf" },
      }),
      { params: Promise.resolve({ id: "7" }) },
    );

  it("autoriza para escribir y guarda en la versión del trámite, a nombre de quien sube", async () => {
    expect((await subir()).status).toBe(201);
    expect(autorizarArchivoDeTramite).toHaveBeenCalledWith(7, SESION, "escribir");
    expect(registrarArchivo.mock.calls[0][0]).toMatchObject({ versionId: 4, rol: "principal", ruta: RUTA });
    expect(registrarArchivo.mock.calls[0][1]).toBe(5);
    expect(registrarArchivo.mock.calls[0][2]).toEqual({ tramiteId: 7 });
  });

  it.each([
    [404, "El trámite no existe"],
    [409, "Este trámite ya no está en elaboración"],
  ])("con %i no recibe el archivo", async (estado, mensaje) => {
    autorizarArchivoDeTramite.mockResolvedValue({ ok: false, estado });
    const res = await subir();
    expect(res.status).toBe(estado);
    expect(await res.json()).toEqual({ error: mensaje });
    expect(registrarArchivo).not.toHaveBeenCalled();
    expect(existsSync(absoluta())).toBe(false);
  });
});

describe("DELETE /api/tramites/[id]/archivos/[archivoId]", () => {
  const quitar = () =>
    DELETE(new NextRequest("http://sgc.local/api/tramites/7/archivos/21", { method: "DELETE" }), {
      params: Promise.resolve({ id: "7", archivoId: "21" }),
    });

  it("autoriza para escribir, borra la fila a nombre de quien quita y borra el archivo físico", async () => {
    escribirBorrador();
    const res = await quitar();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(autorizarArchivoDeTramite).toHaveBeenCalledWith(7, SESION, "escribir");
    expect(archivoDeTramite).toHaveBeenCalledWith(7, 21);
    expect(eliminarArchivoBorrador).toHaveBeenCalledWith(21, 5, { tramiteId: 7 });
    expect(readdirSync(path.dirname(absoluta()))).toEqual([]);
  });

  it("un archivo de otra versión responde 404 y no se toca", async () => {
    archivoDeTramite.mockResolvedValue(null);
    expect((await quitar()).status).toBe(404);
    expect(eliminarArchivoBorrador).not.toHaveBeenCalled();
  });

  it.each([
    [404, "El archivo no existe"],
    [409, "Este trámite ya no está en elaboración"],
  ])("con %i no se toca nada", async (estado, mensaje) => {
    autorizarArchivoDeTramite.mockResolvedValue({ ok: false, estado });
    const res = await quitar();
    expect(res.status).toBe(estado);
    expect(await res.json()).toEqual({ error: mensaje });
    expect(eliminarArchivoBorrador).not.toHaveBeenCalled();
  });

  it("un rechazo de negocio responde 409 con su mensaje y el archivo físico se queda", async () => {
    escribirBorrador();
    eliminarArchivoBorrador.mockRejectedValue(new ErrorTramite("Solo se pueden eliminar archivos de una versión en borrador"));
    const res = await quitar();
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "Solo se pueden eliminar archivos de una versión en borrador" });
    expect(existsSync(absoluta())).toBe(true);
  });

  it("un fallo inesperado responde 500 sin su texto, queda en el registro y el archivo físico se queda", async () => {
    escribirBorrador();
    const registro = vi.spyOn(console, "error").mockImplementation(() => {});
    const fallo = new Error("connect ECONNREFUSED 10.0.0.5:5432");
    eliminarArchivoBorrador.mockRejectedValue(fallo);
    const res = await quitar();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "No se pudo quitar el archivo" });
    expect(registro).toHaveBeenCalledExactlyOnceWith(expect.any(String), fallo);
    expect(existsSync(absoluta())).toBe(true);
    registro.mockRestore();
  });
});

describe("DELETE del panel", () => {
  it("la versión de un trámite abierto responde 409 y el archivo físico se queda", async () => {
    escribirBorrador();
    sesionDePeticion.mockResolvedValue({ usuarioId: 1, rol: "admin_sgc" });
    const mensaje = "Esta versión está en un trámite: se trabaja desde el trámite";
    eliminarArchivoBorrador.mockRejectedValue(new ErrorTramite(mensaje));
    const res = await quitarDelPanel(new NextRequest("http://sgc.local/admin/api/archivos/21", { method: "DELETE" }), {
      params: Promise.resolve({ archivoId: "21" }),
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: mensaje });
    expect(eliminarArchivoBorrador).toHaveBeenCalledWith(21, 1);
    expect(existsSync(absoluta())).toBe(true);
  });

  it("un fallo inesperado responde 500 sin su mensaje y queda en el registro", async () => {
    sesionDePeticion.mockResolvedValue({ usuarioId: 1, rol: "admin_sgc" });
    const fallo = new Error("connection terminated: detalle interno");
    eliminarArchivoBorrador.mockRejectedValue(fallo);
    const registro = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await quitarDelPanel(new NextRequest("http://sgc.local/admin/api/archivos/21", { method: "DELETE" }), {
      params: Promise.resolve({ archivoId: "21" }),
    });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "No se pudo quitar el archivo" });
    expect(registro).toHaveBeenCalledWith(expect.any(String), fallo);
    registro.mockRestore();
  });
});

describe("GET /tramites/[id]/archivos/[archivoId]", () => {
  const ver = (consulta = "") =>
    GET(new NextRequest(`http://sgc.local/tramites/7/archivos/21/Borrador.pdf${consulta}`), {
      params: Promise.resolve({ id: "7", archivoId: "21", nombre: ["Borrador.pdf"] }),
    });

  it("autoriza para leer y sirve el original, sin caché", async () => {
    escribirBorrador();
    const res = await ver();
    expect(res.status).toBe(200);
    expect(autorizarArchivoDeTramite).toHaveBeenCalledWith(7, SESION, "leer");
    expect(archivoDeTramite).toHaveBeenCalledWith(7, 21);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PDF);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toMatch(/^inline/);
  });

  it("con ?descarga=1 baja como adjunto", async () => {
    escribirBorrador();
    expect((await ver("?descarga=1")).headers.get("content-disposition")).toMatch(/^attachment/);
  });

  it.each([404, 409])("una autorización con %i responde 404: quien no ve el borrador no sabe nada de él", async (estado) => {
    autorizarArchivoDeTramite.mockResolvedValue({ ok: false, estado });
    expect((await ver()).status).toBe(404);
    expect(archivoDeTramite).not.toHaveBeenCalled();
  });

  it("un archivo que no es del trámite responde 404", async () => {
    archivoDeTramite.mockResolvedValue(null);
    expect((await ver()).status).toBe(404);
  });
});
