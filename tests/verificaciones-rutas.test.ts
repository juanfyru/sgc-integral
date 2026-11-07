/**
 * Las rutas de las fotos de una verificación: subir, quitar y servir. Corren contra la BD dentro de una transacción
 * que se revierte (el cliente de la app se sustituye por ella) y escriben solo en un almacén temporal.
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

import { DELETE } from "@/app/api/verificaciones/[id]/items/[itemId]/archivos/[archivoId]/route";
import { POST } from "@/app/api/verificaciones/[id]/items/[itemId]/archivos/route";
import { GET } from "@/app/(app)/distribucion/verificaciones/[id]/archivos/[archivoId]/[[...nombre]]/route";
import { obtenerSql } from "@/db/cliente";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import {
  abrirVerificacion,
  cerrarVerificacion,
  guardarAvance,
  obtenerVerificacion,
} from "@/db/consultas/distribucion/verificaciones";
import { pngDePrueba } from "./png-prueba";
import { puntoDePrueba, peticionDeSubida } from "./utiles/distribucion";
import { sesionAdmin, usuarioDePrueba } from "./utiles/tramites";
import { revertida } from "./utiles/transaccion";

const sql = obtenerSql();
const PNG = pngDePrueba(8, 8);

let almacen: string;
const previo = process.env.ALMACEN_RUTA;

beforeAll(() => {
  almacen = mkdtempSync(path.join(tmpdir(), "sgc-verificaciones-rutas-"));
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

type Contexto = {
  tx: TransactionSql;
  admin: SesionFlujo;
  resp: SesionFlujo;
  verificacionId: number;
  itemId: number;
  /** Un ítem de otra verificación abierta, para probar que no se mezclan. */
  itemAjeno: { verificacionId: number; itemId: number };
};

/** Una verificación abierta de un punto cuyo responsable es `resp`, dentro de la transacción de la prueba. */
async function conVerificacion(prueba: (c: Contexto) => Promise<void>) {
  await revertida(sql, async (tx) => {
    enCurso.sql = tx;
    try {
      const admin = await sesionAdmin(tx);
      const resp = await usuarioDePrueba(tx, { rol: "consulta" });
      const punto = await puntoDePrueba(tx, { responsable: resp });
      const otro = await puntoDePrueba(tx, { responsable: resp });
      const { verificacionId } = await abrirVerificacion(admin, punto.id, { sql: tx });
      const ajena = await abrirVerificacion(admin, otro.id, { sql: tx });
      const v = (await obtenerVerificacion(verificacionId, admin, { sql: tx }))!;
      const a = (await obtenerVerificacion(ajena.verificacionId, admin, { sql: tx }))!;
      await prueba({
        tx,
        admin,
        resp,
        verificacionId,
        itemId: v.items[0].id,
        itemAjeno: { verificacionId: ajena.verificacionId, itemId: a.items[0].id },
      });
    } finally {
      enCurso.sql = null;
    }
  });
}

async function cerrar(c: Contexto) {
  const v = (await obtenerVerificacion(c.verificacionId, c.admin, { sql: c.tx }))!;
  await guardarAvance(c.verificacionId, c.admin, v.items.map((i) => ({ itemId: i.id, respuesta: "conforme", nota: null })), { sql: c.tx });
  await cerrarVerificacion(c.verificacionId, c.admin, { retirados: [] }, { sql: c.tx });
}

const ruta = (verificacionId: number, itemId: number, archivoId?: number) =>
  `http://localhost:3002/api/verificaciones/${verificacionId}/items/${itemId}/archivos${archivoId === undefined ? "" : `/${archivoId}`}`;

const subir = (verificacionId: number, itemId: number, nombre = "foto.png", bytes: Uint8Array = PNG) =>
  POST(peticionDeSubida(nombre, bytes, { host: "localhost:3002" }), {
    params: Promise.resolve({ id: String(verificacionId), itemId: String(itemId) }),
  });

const quitar = (verificacionId: number, itemId: number, archivoId: number) =>
  DELETE(
    new NextRequest(ruta(verificacionId, itemId, archivoId), {
      method: "DELETE",
      headers: { origin: "http://localhost:3002", host: "localhost:3002" },
    }),
    { params: Promise.resolve({ id: String(verificacionId), itemId: String(itemId), archivoId: String(archivoId) }) },
  );

const pedir = (verificacionId: number, archivoId: number) =>
  GET(new NextRequest(`http://localhost:3002/distribucion/verificaciones/${verificacionId}/archivos/${archivoId}/foto.png`), {
    params: Promise.resolve({ id: String(verificacionId), archivoId: String(archivoId), nombre: ["foto.png"] }),
  });

describe("subir una foto", () => {
  it("a un ítem de una verificación abierta: 201, con contexto verificacion_item", () =>
    conVerificacion(async (c) => {
      como(c.admin);
      const r = await subir(c.verificacionId, c.itemId);
      expect(r.status).toBe(201);
      const [f] = await c.tx`SELECT contexto, contexto_id, rol, version_id, mime, ruta FROM archivos
        WHERE contexto = 'verificacion_item' AND contexto_id = ${c.itemId}`;
      expect(f).toMatchObject({ contexto: "verificacion_item", rol: "evidencia", version_id: null, mime: "image/png" });
      expect(Number(f.contexto_id)).toBe(c.itemId);
      expect(f.ruta).toContain(`verificaciones/${c.verificacionId}/items/${c.itemId}`);
    }));

  it("sin sesión 401; sin permiso 403; otro origen 403", () =>
    conVerificacion(async (c) => {
      como(null);
      expect((await subir(c.verificacionId, c.itemId)).status).toBe(401);
      como(c.resp);
      expect((await subir(c.verificacionId, c.itemId)).status).toBe(403);
      como(c.admin);
      const ajena = peticionDeSubida("foto.png", PNG, { origin: "http://otro.sitio", host: "localhost:3002" });
      expect(
        (await POST(ajena, { params: Promise.resolve({ id: String(c.verificacionId), itemId: String(c.itemId) }) })).status,
      ).toBe(403);
    }));

  it("un ítem que no es de esa verificación, o que no existe: 404", () =>
    conVerificacion(async (c) => {
      como(c.admin);
      expect((await subir(c.verificacionId, c.itemAjeno.itemId)).status).toBe(404);
      expect((await subir(c.verificacionId, 987_654_321)).status).toBe(404);
      expect((await subir(987_654_321, c.itemId)).status).toBe(404);
      expect(await c.tx`SELECT 1 FROM archivos WHERE contexto = 'verificacion_item'`).toHaveLength(0);
    }));

  it("a una verificación cerrada: 409 y no deja nada", () =>
    conVerificacion(async (c) => {
      como(c.admin);
      await cerrar(c);
      const r = await subir(c.verificacionId, c.itemId);
      expect(r.status).toBe(409);
      expect((await r.json()).error).toBe("La verificación ya está cerrada");
      expect(await c.tx`SELECT 1 FROM archivos WHERE contexto = 'verificacion_item' AND contexto_id = ${c.itemId}`).toHaveLength(0);
    }));

  it("solo PDF o imagen: un SVG no entra", () =>
    conVerificacion(async (c) => {
      como(c.admin);
      const svg = new TextEncoder().encode("<svg xmlns=\"http://www.w3.org/2000/svg\"/>");
      expect((await subir(c.verificacionId, c.itemId, "foto.svg", svg)).status).toBe(415);
    }));
});

describe("quitar una foto", () => {
  it("mientras la verificación esté abierta; cerrada, 409; ya quitada, 404; sin permiso, 403", () =>
    conVerificacion(async (c) => {
      como(c.admin);
      const { id } = await (await subir(c.verificacionId, c.itemId)).json();
      const otra = await (await subir(c.verificacionId, c.itemId, "otra.png")).json();

      como(c.resp);
      expect((await quitar(c.verificacionId, c.itemId, Number(id))).status).toBe(403);
      como(c.admin);
      expect((await quitar(c.verificacionId, c.itemAjeno.itemId, Number(id))).status).toBe(404);
      expect((await quitar(c.verificacionId, c.itemId, Number(id))).status).toBe(200);
      expect((await quitar(c.verificacionId, c.itemId, Number(id))).status).toBe(404);
      expect(await c.tx`SELECT 1 FROM archivos WHERE id = ${Number(id)}`).toHaveLength(0);

      await cerrar(c);
      expect((await quitar(c.verificacionId, c.itemId, Number(otra.id))).status).toBe(409);
      expect(await c.tx`SELECT 1 FROM archivos WHERE id = ${Number(otra.id)}`).toHaveLength(1);
    }));
});

describe("servir una foto", () => {
  it("el responsable y el administrador la reciben; un consulta ajeno, 404; sin sesión, 401", () =>
    conVerificacion(async (c) => {
      como(c.admin);
      const { id } = await (await subir(c.verificacionId, c.itemId)).json();

      for (const sesion of [c.admin, c.resp]) {
        como(sesion);
        const r = await pedir(c.verificacionId, Number(id));
        expect(r.status).toBe(200);
        expect(r.headers.get("Content-Type")).toBe("image/png");
        expect(r.headers.get("Cache-Control")).toBe("no-store");
        expect(Buffer.from(await r.arrayBuffer()).equals(Buffer.from(PNG))).toBe(true);
      }

      como(await usuarioDePrueba(c.tx, { rol: "consulta" }));
      expect((await pedir(c.verificacionId, Number(id))).status).toBe(404);

      // La foto solo se alcanza por la verificación de su ítem.
      como(c.admin);
      expect((await pedir(c.itemAjeno.verificacionId, Number(id))).status).toBe(404);
      expect((await pedir(c.verificacionId, Number(id) + 1)).status).toBe(404);

      // Cerrada, sigue siendo evidencia: se sirve.
      await cerrar(c);
      como(c.resp);
      expect((await pedir(c.verificacionId, Number(id))).status).toBe(200);

      como(null);
      expect((await pedir(c.verificacionId, Number(id))).status).toBe(401);
    }));
});
