/**
 * El núcleo de la subida, que comparten el panel y el trámite, y el orden de comprobaciones del
 * handler del panel. Escribe en un almacén temporal y no toca la BD.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { registrarArchivo, obtenerVersionParaSubida, sesionDePeticion } = vi.hoisted(() => ({
  registrarArchivo: vi.fn(),
  obtenerVersionParaSubida: vi.fn(),
  sesionDePeticion: vi.fn(),
}));

vi.mock("@/db/consultas/admin", () => ({ registrarArchivo, obtenerVersionParaSubida }));
vi.mock("@/lib/sesion-actual", () => ({ sesionDePeticion }));

import { POST as subirAlPanel } from "@/app/admin/api/archivos/route";
import { recibirArchivo } from "@/lib/recepcion-archivo";
import { TAMANO_MAXIMO_BYTES } from "@/lib/subida";

const PDF = new TextEncoder().encode("%PDF-1.4\n%contenido de prueba\n%%EOF");
const DESTINO = { versionId: 4, codigo: "GTH-PR-02", numero: 2, rol: "principal" } as const;
const CARPETA = "documentos/GTH-PR-02/v2";

let almacen: string;
const previo = process.env.ALMACEN_RUTA;

function peticion(cuerpo: BodyInit | null, cabeceras: Record<string, string> = {}, url = "http://sgc.local/api") {
  const iniciales = { "x-nombre-archivo": encodeURIComponent("Informe Final.pdf"), ...cabeceras };
  return new NextRequest(url, { method: "POST", body: cuerpo, headers: iniciales, duplex: "half" } as ConstructorParameters<typeof NextRequest>[1]);
}

const enAlmacen = () => {
  const carpeta = path.join(almacen, ...CARPETA.split("/"));
  return existsSync(carpeta) ? readdirSync(carpeta) : [];
};

beforeAll(() => {
  almacen = mkdtempSync(path.join(tmpdir(), "sgc-recepcion-"));
  process.env.ALMACEN_RUTA = almacen;
});

afterAll(() => {
  if (previo === undefined) delete process.env.ALMACEN_RUTA;
  else process.env.ALMACEN_RUTA = previo;
  rmSync(almacen, { recursive: true, force: true });
});

beforeEach(() => {
  vi.clearAllMocks();
  registrarArchivo.mockResolvedValue({ id: 91 });
});

afterEach(() => {
  rmSync(path.join(almacen, "documentos"), { recursive: true, force: true });
});

describe("recibirArchivo", () => {
  it("guarda en documentos/<código>/v<número>/ con el nombre saneado y registra la huella verdadera", async () => {
    const res = await recibirArchivo(peticion(PDF), DESTINO, 3);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: 91, nombre: "Informe Final.pdf", mime: "application/pdf", tamanoBytes: PDF.byteLength });
    const huella = createHash("sha256").update(PDF).digest("hex");
    expect(registrarArchivo).toHaveBeenCalledWith(
      {
        versionId: 4, rol: "principal", ruta: `${CARPETA}/informe-final.pdf`, nombreOriginal: "Informe Final.pdf",
        extension: "pdf", mime: "application/pdf", tamanoBytes: PDF.byteLength, hashSha256: huella,
      },
      3,
    );
    expect(readFileSync(path.join(almacen, ...CARPETA.split("/"), "informe-final.pdf"))).toEqual(Buffer.from(PDF));
  });

  it("no pisa un archivo con el mismo nombre", async () => {
    await recibirArchivo(peticion(PDF), DESTINO, 3);
    await recibirArchivo(peticion(PDF), DESTINO, 3);
    expect(registrarArchivo.mock.calls[1][0].ruta).toBe(`${CARPETA}/informe-final-2.pdf`);
    expect(enAlmacen().sort()).toEqual(["informe-final-2.pdf", "informe-final.pdf"]);
  });

  it("sin nombre responde 400", async () => {
    const res = await recibirArchivo(peticion(PDF, { "x-nombre-archivo": "" }), DESTINO, 3);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Falta el nombre del archivo" });
  });

  it("sin cuerpo responde 400", async () => {
    const res = await recibirArchivo(peticion(null), DESTINO, 3);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Cuerpo vacío" });
  });

  it("el tamaño declarado se rechaza antes de leer", async () => {
    const res = await recibirArchivo(peticion(PDF, { "content-length": String(TAMANO_MAXIMO_BYTES + 1) }), DESTINO, 3);
    expect(res.status).toBe(413);
    expect(enAlmacen()).toEqual([]);
  });

  it("un cuerpo que pasa del tope se corta y no deja archivo", async () => {
    const trozo = new Uint8Array(1024 * 1024);
    trozo.set(PDF);
    let enviados = 0;
    const flujo = new ReadableStream<Uint8Array>({
      pull(control) {
        if (enviados++ > 26) control.close();
        else control.enqueue(trozo);
      },
    });
    const res = await recibirArchivo(peticion(flujo), DESTINO, 3);
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: "El archivo supera el máximo de 25 MB" });
    expect(registrarArchivo).not.toHaveBeenCalled();
    expect(enAlmacen()).toEqual([]);
  });

  it("el tipo sale de los magic bytes, no de la extensión", async () => {
    const res = await recibirArchivo(peticion(new TextEncoder().encode("MZ\x90\x00programa")), DESTINO, 3);
    expect(res.status).toBe(415);
    expect(registrarArchivo).not.toHaveBeenCalled();
    expect(enAlmacen()).toEqual([]);
  });

  it("un segundo principal responde 409 con su mensaje y no deja archivo", async () => {
    registrarArchivo.mockRejectedValue(new Error("Ya hay un archivo principal en esta versión"));
    const res = await recibirArchivo(peticion(PDF), DESTINO, 3);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "Ya hay un archivo principal en esta versión" });
    expect(enAlmacen()).toEqual([]);
  });

  it("un fallo inesperado responde 500 sin detalles y no deja archivo", async () => {
    const registro = vi.spyOn(console, "error").mockImplementation(() => {});
    registrarArchivo.mockRejectedValue(new Error("detalle interno"));
    const res = await recibirArchivo(peticion(PDF), DESTINO, 3);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "No se pudo guardar el archivo" });
    expect(enAlmacen()).toEqual([]);
    expect(registro).toHaveBeenCalledOnce();
    registro.mockRestore();
  });
});

describe("POST del panel: el orden de siempre", () => {
  const URL_PANEL = "http://sgc.local/admin/api/archivos?version=4&rol=principal";
  const borrador = { id: 4, numero: 2, estado: "borrador", documentoId: 3, codigo: "GTH-PR-02" };
  const subir = (cabeceras?: Record<string, string>, url = URL_PANEL) => subirAlPanel(peticion(PDF, cabeceras, url));

  beforeEach(() => {
    sesionDePeticion.mockResolvedValue({ usuarioId: 1, rol: "admin_sgc" });
    obtenerVersionParaSubida.mockResolvedValue(borrador);
  });

  it("los parámetros y el nombre se miran antes que la versión", async () => {
    expect((await subir({}, "http://sgc.local/admin/api/archivos?rol=principal")).status).toBe(400);
    expect((await subir({}, "http://sgc.local/admin/api/archivos?version=4&rol=acta_aprobacion")).status).toBe(400);
    const sinNombre = await subir({ "x-nombre-archivo": "" });
    expect(sinNombre.status).toBe(400);
    expect(await sinNombre.json()).toEqual({ error: "Falta el nombre del archivo" });
    expect(obtenerVersionParaSubida).not.toHaveBeenCalled();
  });

  it("una versión que no existe o que no es borrador se rechaza antes de leer el archivo", async () => {
    obtenerVersionParaSubida.mockResolvedValue(null);
    expect((await subir()).status).toBe(404);
    obtenerVersionParaSubida.mockResolvedValue({ ...borrador, estado: "vigente" });
    const vigente = await subir();
    expect(vigente.status).toBe(409);
    expect(await vigente.json()).toEqual({ error: "Solo se pueden subir archivos a una versión en borrador" });
    expect(registrarArchivo).not.toHaveBeenCalled();
  });

  it("una subida válida llega con el código y el número de la versión, y a nombre de quien sube", async () => {
    expect((await subir()).status).toBe(201);
    expect(registrarArchivo.mock.calls[0][0]).toMatchObject({ versionId: 4, rol: "principal", ruta: `${CARPETA}/informe-final.pdf` });
    expect(registrarArchivo.mock.calls[0][1]).toBe(1);
  });
});
