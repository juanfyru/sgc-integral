/**
 * Los hallazgos de una recogida («No se encontró») se atienden desde la página de su copia (Ruling 57): el responsable
 * del punto marca «Corregido» y el Admin SGC valida o reabre. Pintada sobre la BD de desarrollo, dentro de una
 * transacción que se revierte.
 */
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { renderToReadableStream } from "react-dom/server";
import type { TransactionSql } from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

const contexto = vi.hoisted(() => ({ tx: null as unknown, sesion: null as unknown }));

vi.mock("@/db/cliente", async (importar) => {
  const real = await importar<typeof import("@/db/cliente")>();
  return { ...real, obtenerSql: () => contexto.tx ?? real.obtenerSql() };
});
vi.mock("@/lib/paginas", () => ({ exigirSesion: async () => contexto.sesion }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("no encontrada");
  },
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("@/app/acciones-distribucion", () => ({
  anularCopiaAccion: vi.fn(),
  cerrarHallazgoAccion: vi.fn(),
  confirmarRecibidoAccion: vi.fn(),
  confirmarRecogidaAccion: vi.fn(),
  confirmarReemplazoAccion: vi.fn(),
  corregirHallazgoAccion: vi.fn(),
  reabrirHallazgoAccion: vi.fn(),
  validarHallazgoAccion: vi.fn(),
}));

import PaginaCopia from "@/app/(app)/distribucion/copias/[id]/page";
import { obtenerSql } from "@/db/cliente";
import { corregirHallazgo } from "@/db/consultas/distribucion/hallazgos";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { copiaDePrueba, puntoDePrueba, vigenteConPdf } from "./utiles/distribucion";
import { sesionAdmin, usuarioDePrueba } from "./utiles/tramites";
import { revertida } from "./utiles/transaccion";

const sql = obtenerSql();
const T0 = new Date("2026-11-12T15:00:00Z");

let almacen: string;
const previo = process.env.ALMACEN_RUTA;

beforeAll(() => {
  almacen = mkdtempSync(path.join(tmpdir(), "sgc-copia-hallazgos-"));
  process.env.ALMACEN_RUTA = almacen;
});

afterAll(async () => {
  if (previo === undefined) delete process.env.ALMACEN_RUTA;
  else process.env.ALMACEN_RUTA = previo;
  rmSync(almacen, { recursive: true, force: true });
  await sql.end();
  globalThis.__sql = undefined;
});

async function pagina(tx: TransactionSql, sesion: SesionFlujo, copiaId: number): Promise<string> {
  contexto.tx = tx;
  contexto.sesion = sesion;
  try {
    const elemento = await PaginaCopia({ params: Promise.resolve({ id: String(copiaId) }), searchParams: Promise.resolve({}) });
    const flujo = await renderToReadableStream(elemento);
    await flujo.allReady;
    return (await new Response(flujo).text()).replaceAll("<!-- -->", "");
  } catch (err) {
    if ((err as Error).message === "no encontrada") return "NO ENCONTRADA";
    throw err;
  } finally {
    contexto.tx = null;
    contexto.sesion = null;
  }
}

/** Una copia de un documento de GTH en un punto de ATE, con el hallazgo de recogida que deja «No se encontró». */
async function copiaConHallazgo(tx: TransactionSql) {
  const admin = await sesionAdmin(tx);
  const responsable = await usuarioDePrueba(tx, { rol: "consulta" });
  const punto = await puntoDePrueba(tx, { responsable, procesos: ["ATE"] });
  const v = await vigenteConPdf(tx, { proceso: "GTH", tipo: "PR" });
  const { copiaId } = await copiaDePrueba(tx, { emisor: admin, documento: v.documento, punto, ahora: T0 });
  const [h] = await tx`INSERT INTO hallazgos (punto_uso_id, origen, copia_id, documento_id, descripcion, responsable_id, estado, vence_en, creado_en)
    VALUES (${punto.id}, 'recogida', ${copiaId}, ${v.documento.id}, 'La copia N.º 01 no se encontró al recogerla', ${responsable.usuarioId},
            'abierto', ${new Date("2026-11-20T15:00:00Z")}, ${T0})
    RETURNING id`;
  return { admin, responsable, punto, copiaId, hallazgoId: Number(h.id), limpiar: v.limpiar };
}

describe("hallazgos de esta copia", () => {
  it("el responsable del punto marca «Corregido» desde la copia; el Admin SGC lo valida o lo reabre", () =>
    revertida(sql, async (tx) => {
      const c = await copiaConHallazgo(tx);
      try {
        const deResponsable = await pagina(tx, c.responsable, c.copiaId);
        expect(deResponsable).toContain("Hallazgos de esta copia (1)");
        expect(deResponsable).toContain("La copia N.º 01 no se encontró al recogerla");
        expect(deResponsable).toMatch(/<button[^>]*>Corregido<\/button>/);
        expect(deResponsable).toContain(`name="copia" value="${c.copiaId}"`);
        expect(deResponsable).not.toContain('name="verificacion"');

        await corregirHallazgo(c.hallazgoId, c.responsable, "Apareció en el archivo y se devolvió", { sql: tx, ahora: T0 });
        const deAdmin = await pagina(tx, c.admin, c.copiaId);
        expect(deAdmin).toContain("Por validar");
        expect(deAdmin).toContain("Apareció en el archivo y se devolvió");
        expect(deAdmin).toMatch(/<button[^>]*>Validar<\/button>/);
        expect(deAdmin).toContain("Reabrir…");
        expect(await pagina(tx, c.responsable, c.copiaId)).not.toMatch(/>Corregido<\/button>/);
      } finally {
        await c.limpiar();
      }
    }));

  it("quien ve la copia sin ver el punto la ve como hoy, sin la sección; quien no la ve, no encontrada", () =>
    revertida(sql, async (tx) => {
      const c = await copiaConHallazgo(tx);
      try {
        const [{ id: gth }] = await tx`SELECT id FROM procesos WHERE sigla = 'GTH'`;
        // El líder de GTH ve la copia por su documento (`documentoEnAlcance`), pero el punto es de ATE.
        const lider = await usuarioDePrueba(tx, { rol: "lider_proceso", procesos: [Number(gth)] });
        const html = await pagina(tx, lider, c.copiaId);
        expect(html).toContain("Copia controlada N.º 01");
        expect(html).not.toContain("Hallazgos de esta copia");
        expect(await pagina(tx, await usuarioDePrueba(tx, { rol: "consulta" }), c.copiaId)).toBe("NO ENCONTRADA");
      } finally {
        await c.limpiar();
      }
    }));

  it("sin hallazgos, la sección no se pinta", () =>
    revertida(sql, async (tx) => {
      const c = await copiaConHallazgo(tx);
      try {
        await tx`UPDATE hallazgos SET origen = 'verificacion' WHERE id = ${c.hallazgoId}`;
        expect(await pagina(tx, c.admin, c.copiaId)).not.toContain("Hallazgos de esta copia");
      } finally {
        await c.limpiar();
      }
    }));
});
