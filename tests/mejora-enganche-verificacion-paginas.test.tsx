/**
 * La lista de hallazgos de `/distribucion/verificaciones` con lo de mejoramiento (Fase 15B, anexo §7.1 y §7.4): la página pasa a la
 * tabla lo que decide `engancheDeVerificacion` y, filtrada por un punto que acumula hallazgos, la sugerencia del punto va encima de la
 * tabla. Pintada sobre la BD de trabajo, dentro de una transacción que se revierte; la sesión y el cliente se sustituyen.
 */
import { renderToReadableStream } from "react-dom/server";
import type { TransactionSql } from "postgres";
import { afterAll, describe, expect, it, vi } from "vitest";

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

import PaginaVerificaciones from "@/app/(app)/distribucion/verificaciones/page";
import { obtenerSql } from "@/db/cliente";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { hallazgoDeVerificacion } from "./utiles/mejoramiento";
import { revertida } from "./utiles/transaccion";
import { sesionAdmin, usuarioDePrueba } from "./utiles/tramites";

const sql = obtenerSql();
afterAll(async () => {
  await sql.end();
  globalThis.__sql = undefined;
});

const ACUMULA = "Este punto acumula 3 hallazgos en 12 meses. Puede abrir una no conformidad para tratar la causa.";

async function pagina(tx: TransactionSql, sesion: SesionFlujo, q: Record<string, string>): Promise<string> {
  contexto.tx = tx;
  contexto.sesion = sesion;
  try {
    const elemento = await PaginaVerificaciones({ searchParams: Promise.resolve(q) });
    const flujo = await renderToReadableStream(elemento);
    await flujo.allReady;
    return (await new Response(flujo).text()).replaceAll("<!-- -->", "");
  } finally {
    contexto.tx = null;
    contexto.sesion = null;
  }
}

describe("/distribucion/verificaciones con lo de mejoramiento", () => {
  it("al Admin SGC: «Abrir no conformidad» en cada fila y, filtrada por el punto que acumula, la sugerencia sobre la tabla", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const responsable = await usuarioDePrueba(tx, { rol: "consulta" });
      // Tres hallazgos del mismo punto en los últimos doce meses (la página se pinta con la hora real).
      const ahora = Date.now();
      const hace = (dias: number) => new Date(ahora - dias * 86_400_000).toISOString();
      const primero = await hallazgoDeVerificacion(tx, { responsable, ahora: hace(3) });
      await hallazgoDeVerificacion(tx, { responsable, punto: primero.punto, ahora: hace(40), origen: "recogida" });
      await hallazgoDeVerificacion(tx, { responsable, punto: primero.punto, ahora: hace(80), origen: "recogida" });

      const filtrada = await pagina(tx, admin, { punto: String(primero.punto.id) });
      const tabla = filtrada.slice(filtrada.indexOf(">Hallazgos</h2>"));
      // Encima de la tabla, antes de su primera fila, y además en cada fila.
      expect(tabla.indexOf(ACUMULA)).toBeGreaterThan(0);
      expect(tabla.indexOf(ACUMULA)).toBeLessThan(tabla.indexOf("<table"));
      expect(tabla.split(ACUMULA).length - 1).toBe(4);
      expect(filtrada).toContain(`href="/mejoramiento/nuevo?verificacion=${primero.id}"`);
      // Sin el filtro, la sugerencia solo va en las filas.
      const sinFiltro = await pagina(tx, admin, {});
      const tablaSinFiltro = sinFiltro.slice(sinFiltro.indexOf(">Hallazgos</h2>"));
      expect(tablaSinFiltro.indexOf(ACUMULA)).toBeGreaterThan(tablaSinFiltro.indexOf("<table"));

      // Al responsable del punto: la lista de siempre, sin nada de mejoramiento.
      const delResponsable = await pagina(tx, responsable, { punto: String(primero.punto.id) });
      expect(delResponsable).toContain("Copia obsoleta del protocolo de triage");
      expect(delResponsable).not.toContain("Abrir no conformidad");
      expect(delResponsable).not.toContain("Puede abrir una no conformidad");
    }));
});
