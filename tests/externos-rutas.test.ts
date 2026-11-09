/**
 * Las rutas de los archivos de la edición en borrador de un externo: subir y quitar. Corren contra la BD dentro de
 * una transacción que se revierte (el cliente de la app se sustituye por ella) y escriben solo en un almacén temporal.
 */
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import type { TransactionSql } from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

const { enCurso, sesionDePeticion } = vi.hoisted(() => ({
  enCurso: { sql: null as unknown },
  sesionDePeticion: vi.fn(),
}));

vi.mock("@/db/cliente", async (original) => {
  const real = await original<typeof import("@/db/cliente")>();
  return { ...real, obtenerSql: () => (enCurso.sql ?? real.obtenerSql()) as ReturnType<typeof real.obtenerSql> };
});
vi.mock("@/lib/sesion-actual", () => ({ sesionDePeticion }));

import { DELETE } from "@/app/api/externos/[versionId]/archivos/[archivoId]/route";
import { POST } from "@/app/api/externos/[versionId]/archivos/route";
import { obtenerSql } from "@/db/cliente";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { abrirEdicion } from "@/db/consultas/vigencia/externos";
import { resolverRutaAlmacen } from "@/lib/almacen";
import { pdfDePrueba } from "./utiles/pdf";
import { sesionDe, usuarioDePrueba } from "./utiles/tramites";
import { revertida } from "./utiles/transaccion";
import { externoDePrueba } from "./utiles/vigencia";

const sql = obtenerSql();

let almacen: string;
const previo = process.env.ALMACEN_RUTA;

beforeAll(() => {
  almacen = mkdtempSync(path.join(tmpdir(), "sgc-externos-rutas-"));
  process.env.ALMACEN_RUTA = almacen;
});

afterAll(async () => {
  if (previo === undefined) delete process.env.ALMACEN_RUTA;
  else process.env.ALMACEN_RUTA = previo;
  rmSync(almacen, { recursive: true, force: true });
  await sql.end();
  globalThis.__sql = undefined;
});

beforeEach(() => {
  sesionDePeticion.mockReset();
});

const como = (sesion: SesionFlujo | null) => sesionDePeticion.mockResolvedValue(sesion);

const subir = (versionId: number, bytes: Uint8Array, d: { rol?: string; nombre?: string; origen?: string } = {}) =>
  POST(
    new NextRequest(`http://localhost:3002/api/externos/${versionId}/archivos?rol=${d.rol ?? "principal"}`, {
      method: "POST",
      body: bytes as BodyInit,
      duplex: "half",
      headers: {
        origin: d.origen ?? "http://localhost:3002",
        host: "localhost:3002",
        "x-nombre-archivo": encodeURIComponent(d.nombre ?? "guia.pdf"),
        "content-length": String(bytes.byteLength),
      },
    } as ConstructorParameters<typeof NextRequest>[1]),
    { params: Promise.resolve({ versionId: String(versionId) }) },
  );

const quitar = (versionId: number, archivoId: number, origen = "http://localhost:3002") =>
  DELETE(
    new NextRequest(`http://localhost:3002/api/externos/${versionId}/archivos/${archivoId}`, {
      method: "DELETE",
      headers: { origin: origen, host: "localhost:3002" },
    }),
    { params: Promise.resolve({ versionId: String(versionId), archivoId: String(archivoId) }) },
  );

/** Un externo de CEX adoptado por su líder, con una edición nueva en borrador, dentro de la transacción de la prueba. */
async function conEdicion(prueba: (c: { tx: TransactionSql; lider: SesionFlujo; vigenteId: number; borradorId: number }) => Promise<void>) {
  await revertida(sql, async (tx) => {
    enCurso.sql = tx;
    try {
      const lider = await sesionDe(tx, "lider.cex");
      const e = await externoDePrueba(tx, lider, { proceso: "CEX", edicion: "2017" });
      const { versionId } = await abrirEdicion(lider, e.documentoId, { edicion: "2023", fechaEdicion: null, resumenCambios: "Metas nuevas" }, { sql: tx });
      await prueba({ tx, lider, vigenteId: e.versionId, borradorId: versionId });
    } finally {
      enCurso.sql = null;
    }
  });
}

describe("POST /api/externos/[versionId]/archivos", () => {
  it("quien gestiona sube el PDF principal del borrador: 201, en la versión y en el almacén", () =>
    conEdicion(async ({ tx, lider, borradorId }) => {
      como(lider);
      const r = await subir(borradorId, await pdfDePrueba([[612, 792]]));
      expect(r.status).toBe(201);
      const { id } = (await r.json()) as { id: number };
      const [a] = await tx`SELECT version_id, rol, mime, ruta FROM archivos WHERE id = ${id}`;
      expect(a).toMatchObject({ rol: "principal", mime: "application/pdf" });
      expect(Number(a.version_id)).toBe(borradorId);
      expect(existsSync(resolverRutaAlmacen(a.ruta)!)).toBe(true);
    }));

  it("sin sesión 401; Consulta 403; otro origen 403; un rol de archivo inválido 400", () =>
    conEdicion(async ({ tx, lider, borradorId }) => {
      const pdf = await pdfDePrueba([[612, 792]]);
      como(null);
      expect((await subir(borradorId, pdf)).status).toBe(401);
      como(await usuarioDePrueba(tx, { rol: "consulta" }));
      expect((await subir(borradorId, pdf)).status).toBe(403);
      como(lider);
      const ajena = await subir(borradorId, pdf, { origen: "http://otro.sitio" });
      expect(ajena.status).toBe(403);
      expect(await ajena.json()).toEqual({ error: "Origen no permitido" });
      expect((await subir(borradorId, pdf, { rol: "acta_aprobacion" })).status).toBe(400);
    }));

  it("el líder de otro proceso y una versión que no existe reciben 404; la versión vigente, 409", () =>
    conEdicion(async ({ tx, lider, vigenteId, borradorId }) => {
      const pdf = await pdfDePrueba([[612, 792]]);
      como(await sesionDe(tx, "lider.gth"));
      expect((await subir(borradorId, pdf)).status).toBe(404);
      como(lider);
      expect((await subir(987_654_321, pdf)).status).toBe(404);
      const vigente = await subir(vigenteId, pdf, { rol: "anexo" });
      expect(vigente.status).toBe(409);
      expect(await vigente.json()).toEqual({ error: "La edición ya no está en borrador" });
      expect(await tx`SELECT 1 FROM archivos WHERE version_id = ${vigenteId} AND rol = 'anexo'`).toHaveLength(0);
    }));
});

describe("DELETE /api/externos/[versionId]/archivos/[archivoId]", () => {
  it("quita el anexo del borrador, de la BD y del almacén; el de otra versión o de otra persona, 404", () =>
    conEdicion(async ({ tx, lider, vigenteId, borradorId }) => {
      como(lider);
      const r = await subir(borradorId, await pdfDePrueba([[612, 792]]), { rol: "anexo", nombre: "anexo.pdf" });
      expect(r.status).toBe(201);
      const { id } = (await r.json()) as { id: number };
      const [a] = await tx`SELECT ruta FROM archivos WHERE id = ${id}`;

      const [principalVigente] = await tx`SELECT id FROM archivos WHERE version_id = ${vigenteId} AND rol = 'principal'`;
      expect((await quitar(borradorId, Number(principalVigente.id))).status).toBe(404);
      como(await sesionDe(tx, "lider.gth"));
      expect((await quitar(borradorId, id)).status).toBe(404);
      como(null);
      expect((await quitar(borradorId, id)).status).toBe(401);
      como(lider);
      expect((await quitar(borradorId, id, "http://otro.sitio")).status).toBe(403);

      const borrado = await quitar(borradorId, id);
      expect(borrado.status).toBe(200);
      expect(await tx`SELECT 1 FROM archivos WHERE id = ${id}`).toHaveLength(0);
      expect(existsSync(resolverRutaAlmacen(a.ruta)!)).toBe(false);
      expect((await quitar(borradorId, id)).status).toBe(404);
    }));
});
