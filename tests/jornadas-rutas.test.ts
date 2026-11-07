/**
 * Las rutas de la evidencia de una jornada: subir, quitar y servir. Corren contra la BD dentro de una transacción
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

import { DELETE } from "@/app/api/socializaciones/[id]/archivos/[archivoId]/route";
import { POST } from "@/app/api/socializaciones/[id]/archivos/route";
import { GET } from "@/app/(app)/distribucion/socializaciones/[id]/archivos/[archivoId]/[[...nombre]]/route";
import { obtenerSql } from "@/db/cliente";
import { registrarJornada } from "@/db/consultas/distribucion/jornadas";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { fechaEnZona } from "@/lib/tramites/plazos";
import { zonaHoraria } from "@/lib/zona-horaria";
import { pngDePrueba } from "./png-prueba";
import { documentoLibre, sesionDe, usuarioDePrueba } from "./utiles/tramites";
import { peticionDeSubida } from "./utiles/distribucion";
import { revertida } from "./utiles/transaccion";

const sql = obtenerSql();
const PNG = pngDePrueba(8, 8);

let almacen: string;
const previo = process.env.ALMACEN_RUTA;

beforeAll(() => {
  almacen = mkdtempSync(path.join(tmpdir(), "sgc-jornadas-rutas-"));
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

const params = (id: number, archivoId?: number) => ({ params: Promise.resolve({ id: String(id), archivoId: String(archivoId) }) });
const como = (sesion: SesionFlujo | null) => sesionDePeticion.mockResolvedValue(sesion);

/** Una jornada de la líder de GTH sobre un documento de GTH, dentro de la transacción de la prueba. */
async function conJornada(prueba: (c: { tx: TransactionSql; lider: SesionFlujo; jornadaId: number }) => Promise<void>) {
  await revertida(sql, async (tx) => {
    enCurso.sql = tx;
    try {
      const lider = await sesionDe(tx, "lider.gth");
      const documento = await documentoLibre(tx, { proceso: "GTH", tipo: "PR" });
      const [v] = await tx`SELECT id FROM documento_versiones WHERE documento_id = ${documento.id}`;
      const { jornadaId } = await registrarJornada(lider, {
        fecha: fechaEnZona(new Date(), zonaHoraria()),
        modalidad: "presencial",
        facilitadorId: lider.usuarioId,
        versionIds: [Number(v.id)],
        asistenteIds: [lider.usuarioId],
        asistentesExternos: null,
        observaciones: null,
      }, { sql: tx });
      await prueba({ tx, lider, jornadaId });
    } finally {
      enCurso.sql = null;
    }
  });
}

const subir = (jornadaId: number, nombre = "acta.png", bytes: Uint8Array = PNG) =>
  POST(peticionDeSubida(nombre, bytes, { host: "localhost:3002" }), params(jornadaId));

const pedir = (jornadaId: number, archivoId: number) =>
  GET(new NextRequest(`http://localhost:3002/distribucion/socializaciones/${jornadaId}/archivos/${archivoId}/acta.png`), {
    params: Promise.resolve({ id: String(jornadaId), archivoId: String(archivoId), nombre: ["acta.png"] }),
  });

const quitar = (jornadaId: number, archivoId: number) =>
  DELETE(
    new NextRequest(`http://localhost:3002/api/socializaciones/${jornadaId}/archivos/${archivoId}`, {
      method: "DELETE",
      headers: { origin: "http://localhost:3002", host: "localhost:3002" },
    }),
    params(jornadaId, archivoId),
  );

describe("subir la evidencia", () => {
  it("quien registró la jornada sube un PNG: 201, con contexto jornada", () =>
    conJornada(async ({ tx, lider, jornadaId }) => {
      como(lider);
      const r = await subir(jornadaId);
      expect(r.status).toBe(201);
      const [f] = await tx`SELECT contexto, contexto_id, rol, version_id, mime FROM archivos WHERE contexto = 'jornada' AND contexto_id = ${jornadaId}`;
      expect(f).toMatchObject({ contexto: "jornada", rol: "evidencia", version_id: null, mime: "image/png" });
      expect(Number(f.contexto_id)).toBe(jornadaId);
    }));

  it("sin sesión 401; sin permiso 403; otro origen 403", () =>
    conJornada(async ({ tx, jornadaId }) => {
      como(null);
      expect((await subir(jornadaId)).status).toBe(401);
      como(await usuarioDePrueba(tx, { rol: "consulta" }));
      expect((await subir(jornadaId)).status).toBe(403);
      como(await sesionDe(tx, "lider.gth"));
      const ajena = peticionDeSubida("acta.png", PNG, { origin: "http://otro.sitio", host: "localhost:3002" });
      expect((await POST(ajena, params(jornadaId))).status).toBe(403);
    }));

  it("otra persona, aunque pueda registrar, recibe 404", () =>
    conJornada(async ({ tx, jornadaId }) => {
      como(await usuarioDePrueba(tx, { rol: "lider_proceso" }));
      expect((await subir(jornadaId)).status).toBe(404);
      como(await sesionDe(tx, "lider.cex"));
      expect((await subir(jornadaId)).status).toBe(404);
      expect((await subir(987_654_321)).status).toBe(404);
    }));

  it("a las 25 horas responde 409 y no deja nada; una jornada anulada, igual", () =>
    conJornada(async ({ tx, lider, jornadaId }) => {
      como(lider);
      await tx`UPDATE jornadas SET creado_en = now() - interval '25 hours' WHERE id = ${jornadaId}`;
      const r = await subir(jornadaId);
      expect(r.status).toBe(409);
      expect((await r.json()).error).toBe("La evidencia de esta jornada ya no se puede cambiar");
      expect(await tx`SELECT 1 FROM archivos WHERE contexto = 'jornada' AND contexto_id = ${jornadaId}`).toHaveLength(0);

      await tx`UPDATE jornadas SET creado_en = now() - interval '23 hours' WHERE id = ${jornadaId}`;
      expect((await subir(jornadaId)).status).toBe(201);
      await tx`UPDATE jornadas SET anulada_en = now(), anulada_por = ${lider.usuarioId}, motivo_anulacion = 'Prueba' WHERE id = ${jornadaId}`;
      expect((await subir(jornadaId, "otra.png")).status).toBe(409);
    }));

  it("solo PDF o imagen: un SVG no entra", () =>
    conJornada(async ({ lider, jornadaId }) => {
      como(lider);
      const svg = new TextEncoder().encode("<svg xmlns=\"http://www.w3.org/2000/svg\"/>");
      expect((await subir(jornadaId, "acta.svg", svg)).status).toBe(415);
    }));
});

describe("quitar la evidencia", () => {
  it("la autora la quita dentro de las 24 horas; después, 409; otra persona, 404", () =>
    conJornada(async ({ tx, lider, jornadaId }) => {
      como(lider);
      const { id } = await (await subir(jornadaId)).json();
      como(await usuarioDePrueba(tx, { rol: "lider_proceso" }));
      expect((await quitar(jornadaId, Number(id))).status).toBe(404);

      como(lider);
      await tx`UPDATE jornadas SET creado_en = now() - interval '25 hours' WHERE id = ${jornadaId}`;
      expect((await quitar(jornadaId, Number(id))).status).toBe(409);

      await tx`UPDATE jornadas SET creado_en = now() WHERE id = ${jornadaId}`;
      expect((await quitar(jornadaId, Number(id))).status).toBe(200);
      expect((await quitar(jornadaId, Number(id))).status).toBe(404);
      expect(await tx`SELECT 1 FROM archivos WHERE id = ${Number(id)}`).toHaveLength(0);
    }));
});

describe("servir la evidencia", () => {
  it("quien ve la evidencia recibe el archivo; quien solo ve el documento, 404; sin sesión, 401", () =>
    conJornada(async ({ tx, lider, jornadaId }) => {
      como(lider);
      const { id } = await (await subir(jornadaId)).json();

      const r = await pedir(jornadaId, Number(id));
      expect(r.status).toBe(200);
      expect(r.headers.get("Content-Type")).toBe("image/png");
      expect(r.headers.get("Cache-Control")).toBe("no-store");
      expect(Buffer.from(await r.arrayBuffer()).equals(Buffer.from(PNG))).toBe(true);

      como(await usuarioDePrueba(tx, { rol: "control_interno" }));
      expect((await pedir(jornadaId, Number(id))).status).toBe(200);

      como(await usuarioDePrueba(tx, { rol: "consulta" }));
      expect((await pedir(jornadaId, Number(id))).status).toBe(404);
      como(await sesionDe(tx, "lider.cex"));
      expect((await pedir(jornadaId, Number(id))).status).toBe(404);

      como(lider);
      expect((await pedir(jornadaId, Number(id) + 1)).status).toBe(404);
      expect((await pedir(jornadaId + 1, Number(id))).status).toBe(404);

      como(null);
      expect((await pedir(jornadaId, Number(id))).status).toBe(401);
    }));
});
