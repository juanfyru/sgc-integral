/**
 * El responsable de un punto con rol Consulta entra a «Distribución» por sus copias, pero los porcentajes de
 * lectura no son suyos (spec 13B §6.4): ni la pestaña, ni la página, ni el resumen. Contra la BD de desarrollo,
 * dentro de una transacción que se revierte.
 */
import { existsSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, describe, expect, it, vi } from "vitest";

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
}));

import PaginaAcuses from "@/app/(app)/distribucion/acuses/page";
import { PestanasDistribucion } from "@/componentes/distribucion/PestanasDistribucion";
import { obtenerSql } from "@/db/cliente";
import { pedirAcuses, resumenAcuses } from "@/db/consultas/distribucion/acuses";
import { puntoDePrueba } from "./utiles/distribucion";
import { documentoLibre, sesionAdmin, usuarioDePrueba } from "./utiles/tramites";
import { revertida } from "./utiles/transaccion";

const sql = obtenerSql();
const T1 = new Date("2026-11-20T15:00:00Z");
const PERIODO = { desde: new Date("2026-01-01T05:00:00Z"), hasta: new Date("2027-01-01T05:00:00Z") };

afterAll(async () => {
  await sql.end();
  globalThis.__sql = undefined;
});

describe("acuses y el responsable de un punto con rol Consulta", () => {
  it("el resumen sale vacío y la página responde «no encontrada»; el Admin SGC sí los ve", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const responsable = await usuarioDePrueba(tx, { rol: "consulta" });
      await puntoDePrueba(tx, { responsable });
      const doc = await documentoLibre(tx, { proceso: "GTH", tipo: "PR" });
      const [gth] = await tx`SELECT id FROM procesos WHERE sigla = 'GTH'`;
      await tx`INSERT INTO usuario_procesos (usuario_id, proceso_id) VALUES (${responsable.usuarioId}, ${gth.id})`;
      await pedirAcuses(admin, doc.id, { sql: tx, ahora: T1 });
      const [v] = await tx`SELECT id FROM documento_versiones WHERE documento_id = ${doc.id}`;

      expect((await resumenAcuses(admin, PERIODO, { sql: tx })).versiones.some((x) => x.versionId === Number(v.id))).toBe(true);
      expect(await resumenAcuses(responsable, PERIODO, { sql: tx })).toEqual({
        versiones: [],
        porProceso: [],
        entidad: { confirmados: 0, pendientes: 0, porcentaje: null },
      });

      contexto.tx = tx;
      contexto.sesion = responsable;
      try {
        await expect(PaginaAcuses({ searchParams: Promise.resolve({}) })).rejects.toThrow("no encontrada");
      } finally {
        contexto.tx = null;
        contexto.sesion = null;
      }
    }));

  it("sin «Acuses de lectura» entre las pestañas; las demás siguen", () => {
    const html = renderToStaticMarkup(<PestanasDistribucion activa="copias" conAcuses={false} />);
    expect(html).not.toContain("Acuses de lectura");
    for (const texto of ["Copias controladas", "Socializaciones", "Verificaciones"]) expect(html).toContain(texto);
  });
});
