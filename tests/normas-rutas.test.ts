/**
 * Las rutas del PDF de una norma: subir (un archivo por norma: el nuevo reemplaza al anterior) y quitar. Corren
 * contra la BD dentro de una transacción que se revierte (el cliente de la app se sustituye por ella) y escriben
 * solo en un almacén temporal.
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

import { DELETE } from "@/app/api/normas/[id]/archivos/[archivoId]/route";
import { POST } from "@/app/api/normas/[id]/archivos/route";
import { obtenerSql } from "@/db/cliente";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { obtenerNorma } from "@/db/consultas/normograma/normas";
import { resolverRutaAlmacen } from "@/lib/almacen";
import { pngDePrueba } from "./png-prueba";
import { normaDePrueba } from "./utiles/normograma";
import { pdfDePrueba } from "./utiles/pdf";
import { sesionAdmin, usuarioDePrueba } from "./utiles/tramites";
import { revertida } from "./utiles/transaccion";

const sql = obtenerSql();

let almacen: string;
const previo = process.env.ALMACEN_RUTA;

beforeAll(() => {
  almacen = mkdtempSync(path.join(tmpdir(), "sgc-normas-rutas-"));
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

const subir = (normaId: number | string, bytes: Uint8Array, d: { nombre?: string; origen?: string; largo?: number } = {}) =>
  POST(
    new NextRequest(`http://localhost:3002/api/normas/${normaId}/archivos`, {
      method: "POST",
      body: bytes as BodyInit,
      duplex: "half",
      headers: {
        origin: d.origen ?? "http://localhost:3002",
        host: "localhost:3002",
        "x-nombre-archivo": encodeURIComponent(d.nombre ?? "resolucion.pdf"),
        "content-length": String(d.largo ?? bytes.byteLength),
      },
    } as ConstructorParameters<typeof NextRequest>[1]),
    { params: Promise.resolve({ id: String(normaId) }) },
  );

const quitar = (normaId: number | string, archivoId: number | string, origen = "http://localhost:3002") =>
  DELETE(
    new NextRequest(`http://localhost:3002/api/normas/${normaId}/archivos/${archivoId}`, {
      method: "DELETE",
      headers: { origin: origen, host: "localhost:3002" },
    }),
    { params: Promise.resolve({ id: String(normaId), archivoId: String(archivoId) }) },
  );

/** Una norma de prueba dentro de la transacción, con el cliente de la app apuntando a ella. */
async function conNorma(prueba: (c: { tx: TransactionSql; admin: SesionFlujo; normaId: number }) => Promise<void>) {
  await revertida(sql, async (tx) => {
    enCurso.sql = tx;
    try {
      const admin = await sesionAdmin(tx);
      const n = await normaDePrueba(tx, admin);
      await prueba({ tx, admin, normaId: n.id });
    } finally {
      enCurso.sql = null;
    }
  });
}

const archivosDe = (tx: TransactionSql, normaId: number) =>
  tx`SELECT id, ruta, mime, rol, version_id FROM archivos WHERE contexto = 'norma' AND contexto_id = ${normaId} ORDER BY id`;

describe("POST /api/normas/[id]/archivos", () => {
  it("sin sesión 401; un líder de proceso 403; otro origen 403; un PNG 415", () =>
    conNorma(async ({ tx, admin, normaId }) => {
      const pdf = await pdfDePrueba([[612, 792]]);
      como(null);
      expect((await subir(normaId, pdf)).status).toBe(401);
      como(await usuarioDePrueba(tx, { rol: "lider_proceso" }));
      expect((await subir(normaId, pdf)).status).toBe(403);
      como(admin);
      const ajena = await subir(normaId, pdf, { origen: "http://otro.sitio" });
      expect(ajena.status).toBe(403);
      expect(await ajena.json()).toEqual({ error: "Origen no permitido" });
      // Solo PDF, por los bytes: una imagen (que sí es evidencia en otros contextos) o un PNG con nombre .pdf no.
      const png = await subir(normaId, pngDePrueba(4, 4), { nombre: "foto.png" });
      expect(png.status).toBe(415);
      expect(await png.json()).toEqual({ error: "El archivo de la norma debe ser un PDF" });
      expect((await subir(normaId, pngDePrueba(4, 4), { nombre: "disfrazado.pdf" })).status).toBe(415);
      expect(await archivosDe(tx, normaId)).toEqual([]);
    }));

  it("una norma que no existe o un id que no es un número responde 404", () =>
    conNorma(async ({ admin }) => {
      const pdf = await pdfDePrueba([[612, 792]]);
      como(admin);
      expect((await subir(987_654_321, pdf)).status).toBe(404);
      expect((await subir("abc", pdf)).status).toBe(404);
      expect((await subir("99999999999999999999", pdf)).status).toBe(404);
    }));

  it("201 con un PDF; subir otro reemplaza al anterior: queda un solo archivo por norma, también en disco", () =>
    conNorma(async ({ tx, admin, normaId }) => {
      como(admin);
      const primera = await subir(normaId, await pdfDePrueba([[612, 792]]));
      expect(primera.status).toBe(201);
      const { id: primeraId } = (await primera.json()) as { id: number };
      const [a] = await archivosDe(tx, normaId);
      expect(a).toMatchObject({ id: primeraId, mime: "application/pdf", rol: "evidencia", version_id: null });
      expect(a.ruta).toMatch(new RegExp(`^normas/${normaId}/`));
      const rutaPrimera = resolverRutaAlmacen(a.ruta)!;
      expect(existsSync(rutaPrimera)).toBe(true);
      expect((await obtenerNorma(normaId, admin, { sql: tx }))?.archivo).toMatchObject({ id: primeraId, mime: "application/pdf" });

      const segunda = await subir(normaId, await pdfDePrueba([[612, 792], [612, 792]]), { nombre: "resolucion-compilada.pdf" });
      expect(segunda.status).toBe(201);
      const { id: segundaId } = (await segunda.json()) as { id: number };
      const quedan = await archivosDe(tx, normaId);
      expect(quedan.map((f) => f.id)).toEqual([segundaId]);
      expect(existsSync(rutaPrimera)).toBe(false);
      expect(existsSync(resolverRutaAlmacen(quedan[0].ruta)!)).toBe(true);
      const [reemplazo] = await tx`SELECT detalle FROM auditoria WHERE accion = 'eliminar_archivo' AND entidad = 'archivo' AND entidad_id = ${primeraId}`;
      expect(reemplazo.detalle).toMatchObject({ contexto: "norma", contextoId: normaId, reemplazadoPor: segundaId });
      expect((await obtenerNorma(normaId, admin, { sql: tx }))?.archivo).toMatchObject({ id: segundaId, nombreOriginal: "resolucion-compilada.pdf" });
    }));

  it("un cuerpo más corto que su content-length no se guarda", () =>
    conNorma(async ({ tx, admin, normaId }) => {
      como(admin);
      const pdf = await pdfDePrueba([[612, 792]]);
      const r = await subir(normaId, pdf, { largo: pdf.byteLength + 10 });
      expect(r.status).toBe(400);
      expect(await archivosDe(tx, normaId)).toEqual([]);
    }));
});

describe("DELETE /api/normas/[id]/archivos/[archivoId]", () => {
  it("quita el PDF de la norma, del almacén y de la ficha; otro archivo, otra norma u otro origen no", () =>
    conNorma(async ({ tx, admin, normaId }) => {
      como(admin);
      const r = await subir(normaId, await pdfDePrueba([[612, 792]]));
      const { id } = (await r.json()) as { id: number };
      const [a] = await archivosDe(tx, normaId);
      const otra = await normaDePrueba(tx, admin);

      expect((await quitar(otra.id, id)).status).toBe(404);
      expect((await quitar(normaId, 987_654_321)).status).toBe(404);
      expect((await quitar(normaId, "abc")).status).toBe(404);
      expect((await quitar(normaId, id, "http://otro.sitio")).status).toBe(403);
      como(await usuarioDePrueba(tx, { rol: "lider_proceso" }));
      expect((await quitar(normaId, id)).status).toBe(403);
      como(null);
      expect((await quitar(normaId, id)).status).toBe(401);

      como(admin);
      const quitado = await quitar(normaId, id);
      expect(quitado.status).toBe(200);
      expect(await archivosDe(tx, normaId)).toEqual([]);
      expect(existsSync(resolverRutaAlmacen(a.ruta)!)).toBe(false);
      expect((await obtenerNorma(normaId, admin, { sql: tx }))?.archivo).toBeNull();
    }));
});
