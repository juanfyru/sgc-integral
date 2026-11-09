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
import { GET as verArchivoDeEdicion } from "@/app/(app)/vigencia/externos/[id]/archivos/[archivoId]/[[...nombre]]/route";
import { POST } from "@/app/api/externos/[versionId]/archivos/route";
import { DELETE as quitarDelPanel } from "@/app/admin/api/archivos/[archivoId]/route";
import { POST as subirAlPanel } from "@/app/admin/api/archivos/route";
import { obtenerSql } from "@/db/cliente";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { abrirEdicion, adoptarEdicion } from "@/db/consultas/vigencia/externos";
import { resolverRutaAlmacen } from "@/lib/almacen";
import { pdfDePrueba } from "./utiles/pdf";
import { archivoPrincipal, sesionAdmin, sesionDe, usuarioDePrueba } from "./utiles/tramites";
import { revertida } from "./utiles/transaccion";
import { externoDePrueba, firmaDePrueba } from "./utiles/vigencia";

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

  it("un archivo de la edición ya adoptada responde 409 y no se borra", () =>
    conEdicion(async ({ tx, lider, vigenteId }) => {
      como(lider);
      const [principal] = await tx`SELECT id FROM archivos WHERE version_id = ${vigenteId} AND rol = 'principal'`;
      const r = await quitar(vigenteId, Number(principal.id));
      expect(r.status).toBe(409);
      expect(await r.json()).toEqual({ error: "La edición ya no está en borrador" });
      expect(await tx`SELECT 1 FROM archivos WHERE id = ${principal.id}`).toHaveLength(1);
    }));
});

describe("las rutas de archivos del panel no tocan la edición de un externo", () => {
  const SE_ADOPTA = "Un documento externo se adopta desde Vigencia → Externos";

  it("la subida por /admin/api/archivos responde 409 antes de recibir el archivo; el borrado, 409 y el archivo queda", () =>
    conEdicion(async ({ tx, lider, borradorId }) => {
      como(lider);
      const subida = await subir(borradorId, await pdfDePrueba([[612, 792]]), { rol: "anexo", nombre: "anexo.pdf" });
      const { id } = (await subida.json()) as { id: number };

      como(await sesionAdmin(tx));
      const bytes = await pdfDePrueba([[612, 792]]);
      const r = await subirAlPanel(
        new NextRequest(`http://localhost:3002/admin/api/archivos?version=${borradorId}&rol=principal`, {
          method: "POST",
          body: bytes as BodyInit,
          duplex: "half",
          headers: {
            origin: "http://localhost:3002",
            host: "localhost:3002",
            "x-nombre-archivo": encodeURIComponent("guia.pdf"),
            "content-length": String(bytes.byteLength),
          },
        } as ConstructorParameters<typeof NextRequest>[1]),
      );
      expect(r.status).toBe(409);
      expect(await r.json()).toEqual({ error: SE_ADOPTA });
      expect(await tx`SELECT 1 FROM archivos WHERE version_id = ${borradorId} AND rol = 'principal'`).toHaveLength(0);

      const borrado = await quitarDelPanel(
        new NextRequest(`http://localhost:3002/admin/api/archivos/${id}`, {
          method: "DELETE",
          headers: { origin: "http://localhost:3002", host: "localhost:3002" },
        }),
        { params: Promise.resolve({ archivoId: String(id) }) },
      );
      expect(borrado.status).toBe(409);
      expect(await borrado.json()).toEqual({ error: SE_ADOPTA });
      expect(await tx`SELECT 1 FROM archivos WHERE id = ${id}`).toHaveLength(1);
    }));
});

describe("GET /vigencia/externos/[id]/archivos/[archivoId]: los archivos de la edición en borrador", () => {
  const ver = (documentoId: number | string, archivoId: number | string) =>
    verArchivoDeEdicion(new NextRequest(`http://localhost:3002/vigencia/externos/${documentoId}/archivos/${archivoId}/principal.pdf`), {
      params: Promise.resolve({ id: String(documentoId), archivoId: String(archivoId), nombre: ["principal.pdf"] }),
    });

  it("401 sin sesión; lo abren quien lo gestiona y su responsable técnico, sin caché; 404 a los demás, a otro externo y fuera del borrador", () =>
    revertida(sql, async (tx) => {
      enCurso.sql = tx;
      try {
        const lider = await sesionDe(tx, "lider.cex");
        const responsable = await usuarioDePrueba(tx, { rol: "consulta" });
        const e = await externoDePrueba(tx, lider, { proceso: "CEX", edicion: "2017", responsableId: responsable.usuarioId });
        const otro = await externoDePrueba(tx, lider, { proceso: "CEX", edicion: "2019" });
        const { versionId } = await abrirEdicion(lider, e.documentoId, { edicion: "2023", fechaEdicion: null, resumenCambios: "Metas nuevas" }, { sql: tx });
        const a = await archivoPrincipal(tx, versionId);
        try {
          como(null);
          expect((await ver(e.documentoId, a.archivoId)).status).toBe(401);

          for (const sesion of [lider, responsable]) {
            como(sesion);
            const r = await ver(e.documentoId, a.archivoId);
            expect(r.status).toBe(200);
            expect(r.headers.get("Content-Type")).toBe("application/pdf");
            expect(r.headers.get("Cache-Control")).toBe("no-store");
            expect(r.headers.get("Content-Disposition")).toMatch(/^inline; filename="principal\.pdf"/);
            expect(Buffer.from(await r.arrayBuffer()).subarray(0, 5).toString()).toBe("%PDF-");
          }
          como(lider);
          const descarga = await verArchivoDeEdicion(
            new NextRequest(`http://localhost:3002/vigencia/externos/${e.documentoId}/archivos/${a.archivoId}/principal.pdf?descarga=1`),
            { params: Promise.resolve({ id: String(e.documentoId), archivoId: String(a.archivoId), nombre: ["principal.pdf"] }) },
          );
          expect(descarga.headers.get("Content-Disposition")).toMatch(/^attachment;/);

          // El líder de otro proceso y un Consulta cualquiera no lo ven: no existe.
          for (const sesion of [await sesionDe(tx, "lider.gth"), await usuarioDePrueba(tx, { rol: "consulta" })]) {
            como(sesion);
            expect((await ver(e.documentoId, a.archivoId)).status).toBe(404);
          }
          como(lider);
          // El archivo no es de ese externo, o el id no es un número.
          expect((await ver(otro.documentoId, a.archivoId)).status).toBe(404);
          expect((await ver("abc", a.archivoId)).status).toBe(404);
          expect((await ver(e.documentoId, "abc")).status).toBe(404);
          // Adoptada, la edición ya no está en borrador: sus archivos los sirve la ficha de lectura.
          await adoptarEdicion(
            lider,
            { versionId, pedirAcuses: false, requiereSocializacion: false, credenciales: { clave: "ok" } },
            { sql: tx, verificar: firmaDePrueba },
          );
          expect((await ver(e.documentoId, a.archivoId)).status).toBe(404);
        } finally {
          await a.limpiar();
          await e.limpiar();
          await otro.limpiar();
        }
      } finally {
        enCurso.sql = null;
      }
    }));
});
