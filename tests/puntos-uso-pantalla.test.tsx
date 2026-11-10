/**
 * La página de un punto de uso dice qué copias impiden desactivarlo, con enlace a cada una (spec 13B §7), y la
 * del subproceso ofrece crear un punto desde él (F13B-DC18). Pintadas sobre la BD de desarrollo, dentro de una
 * transacción que se revierte.
 */
import { existsSync } from "node:fs";
import { renderToReadableStream } from "react-dom/server";
import type { ReactNode } from "react";
import { afterAll, describe, expect, it, vi } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

const contexto = vi.hoisted(() => ({ tx: null as unknown, sesion: null as unknown }));

vi.mock("@/db/cliente", async (importar) => {
  const real = await importar<typeof import("@/db/cliente")>();
  return { ...real, obtenerSql: () => contexto.tx ?? real.obtenerSql() };
});
vi.mock("@/lib/paginas", () => ({ exigirPermiso: async () => contexto.sesion, exigirSesion: async () => contexto.sesion }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("no encontrada");
  },
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("@/app/admin/acciones-puntos-uso", () => ({
  alternarPuntoUsoAccion: vi.fn(),
  editarPuntoUsoAccion: vi.fn(),
}));
vi.mock("@/app/admin/acciones-mapa", () => ({ editarSubprocesoAccion: vi.fn() }));

import PaginaSubproceso from "@/app/(app)/admin/(panel)/mapa/subprocesos/[id]/page";
import PaginaPuntoUso from "@/app/(app)/admin/(catalogos)/puntos-uso/[id]/page";
import { obtenerSql } from "@/db/cliente";
import { documentoLibre, sesionAdmin, usuarioDePrueba } from "./utiles/tramites";
import { puntoDePrueba } from "./utiles/distribucion";
import { revertida } from "./utiles/transaccion";

const sql = obtenerSql();

afterAll(async () => {
  await sql.end();
  globalThis.__sql = undefined;
});

async function texto(elemento: ReactNode): Promise<string> {
  const flujo = await renderToReadableStream(elemento);
  await flujo.allReady;
  return (await new Response(flujo).text()).replaceAll("<!-- -->", "");
}

describe("pantallas del punto de uso", () => {
  it("la página del punto lista las copias vivas que impiden desactivarlo, con su estado y su enlace", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const resp = await usuarioDePrueba(tx, { rol: "consulta" });
      const punto = await puntoDePrueba(tx, { responsable: resp });
      const doc = await documentoLibre(tx, { proceso: "ATE", tipo: "PR" });
      const [v] = await tx`SELECT id FROM documento_versiones WHERE documento_id = ${doc.id}`;
      const [copia] = await tx`INSERT INTO copias_controladas
          (version_id, numero, punto_uso_id, responsable_id, responsable_nombre, emitida_por, hash_principal, emitida_en)
        VALUES (${v.id}, 1, ${punto.id}, ${resp.usuarioId}, 'Prueba', ${admin.usuarioId}, 'x', now()) RETURNING id`;

      contexto.tx = tx;
      contexto.sesion = admin;
      try {
        const html = await texto(await PaginaPuntoUso({ params: Promise.resolve({ id: String(punto.id) }) }));
        expect(html).toContain("1 copia por recibir, en uso o por recoger.");
        expect(html).toContain("No se puede desactivar mientras tenga 1 copia viva: recójala o anúlela desde su página.");
        expect(html).toMatch(new RegExp(`<a [^>]*href="/distribucion/copias/${copia.id}"[^>]*>${doc.codigo} v1 · Copia N.º 01</a> · Emitida`));

        await tx`UPDATE copias_controladas SET estado = 'anulada', anulada_en = now(), motivo_anulacion = 'error' WHERE id = ${copia.id}`;
        const sinCopias = await texto(await PaginaPuntoUso({ params: Promise.resolve({ id: String(punto.id) }) }));
        expect(sinCopias).toContain("0 copias por recibir, en uso o por recoger.");
        expect(sinCopias).not.toContain("No se puede desactivar");
      } finally {
        contexto.tx = null;
        contexto.sesion = null;
      }
    }));

  it("la página del subproceso enlaza al formulario del punto con el subproceso", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const [s] = await tx`INSERT INTO subprocesos (proceso_id, nombre, slug, orden)
        SELECT id, 'Sala de prueba', ${`zz-sala-${Date.now()}`}, 99 FROM procesos WHERE sigla = 'ATE' RETURNING id`;
      contexto.tx = tx;
      contexto.sesion = admin;
      try {
        const html = await texto(await PaginaSubproceso({ params: Promise.resolve({ id: String(s.id) }) }));
        expect(html).toMatch(new RegExp(`<a [^>]*href="/admin/puntos-uso/nuevo\\?subproceso=${s.id}"[^>]*>Nuevo punto de uso para este subproceso</a>`));
      } finally {
        contexto.tx = null;
        contexto.sesion = null;
      }
    }));
});
