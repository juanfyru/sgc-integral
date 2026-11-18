/**
 * La página de los impresos de un hallazgo (Fase 15A, Tarea 21; spec 15 §16.4): quién la abre, qué imprime con y sin `?analisis=` y
 * el encabezado del formato elegido. Contra la BD de desarrollo, dentro de una transacción que se revierte (el cliente de la app se
 * sustituye por ella). Lo que pinta cada impreso, sin base, en `tests/mejora-impresos.test.tsx`.
 */
import { existsSync } from "node:fs";
import type { TransactionSql } from "postgres";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, describe, expect, it, vi } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

const contexto = vi.hoisted(() => ({ sql: null as unknown, sesion: null as unknown }));

vi.mock("@/db/cliente", async (original) => {
  const real = await original<typeof import("@/db/cliente")>();
  return { ...real, obtenerSql: () => (contexto.sql ?? real.obtenerSql()) as ReturnType<typeof real.obtenerSql> };
});
vi.mock("@/lib/paginas", () => ({ exigirSesion: async () => contexto.sesion }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NO_ENCONTRADA");
  },
  usePathname: () => "/mejoramiento",
}));

import PaginaImprimirHallazgo from "@/app/(app)/mejoramiento/[id]/imprimir/page";
import { obtenerSql } from "@/db/cliente";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { CONFIG_MEJORA_DEFECTO, guardarConfigMejora } from "@/db/consultas/mejoramiento/config";
import { baseDeMejora, hallazgoEn } from "./utiles/mejoramiento";
import { revertida } from "./utiles/transaccion";
import { documentoLibre, opc, usuarioDePrueba } from "./utiles/tramites";

const sql = obtenerSql();
afterAll(async () => {
  await sql.end();
  globalThis.__sql = undefined;
});

const enTransaccion = (prueba: (tx: TransactionSql) => Promise<void>) =>
  revertida(sql, async (tx) => {
    contexto.sql = tx;
    try {
      await prueba(tx);
    } finally {
      contexto.sql = null;
      contexto.sesion = null;
    }
  });

async function imprimir(sesion: SesionFlujo, id: number | string, analisis?: string | string[]): Promise<string> {
  contexto.sesion = sesion;
  const pagina = await PaginaImprimirHallazgo({
    params: Promise.resolve({ id: String(id) }),
    searchParams: Promise.resolve(analisis === undefined ? {} : { analisis }),
  });
  return renderToStaticMarkup(pagina);
}

describe("/mejoramiento/[id]/imprimir", () => {
  it("quien ve el hallazgo completo imprime el registro con el encabezado del formato elegido y el pie", () =>
    enTransaccion(async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await hallazgoEn(tx, b, "en_ejecucion");
      const sinFormato = await imprimir(b.lider, h.id);
      expect(sinFormato).toContain(">1. Identificación<");
      expect(sinFormato).toContain(">7. Cierre<");
      expect(sinFormato).not.toContain("Fecha de emisión");
      expect(sinFormato).toContain(`por ${b.lider.nombre}`);

      const doc = await documentoLibre(tx, { proceso: "CEX", tipo: "FO" });
      await guardarConfigMejora(b.admin, { ...CONFIG_MEJORA_DEFECTO, formatos: { registro: doc.id, porques: null, ishikawa: null } }, opc(tx));
      const conFormato = await imprimir(b.lider, h.id);
      expect(conFormato).toContain(doc.codigo);
      expect(conFormato).toContain("Fecha de emisión");
      // Con `?analisis=`, ese análisis en su formato: el de 5 porqués no tiene documento elegido.
      const [a] = await tx`SELECT id FROM mejora_analisis WHERE hallazgo_id = ${h.id}`;
      const analisis = await imprimir(b.lider, h.id, String(a.id));
      expect(analisis).toContain("Los cinco porqués");
      expect(analisis).toContain("Nadie asignó el registro al turno de noche");
      expect(analisis).not.toContain(doc.codigo);
      expect(analisis).not.toContain(">1. Identificación<");
    }));

  it("quien lo ve solo por una actividad, un análisis de otro hallazgo o un id que no se entiende: «no encontrado»", () =>
    enTransaccion(async (tx) => {
      const b = await baseDeMejora(tx);
      const responsable = await usuarioDePrueba(tx, { rol: "consulta" });
      const h = await hallazgoEn(tx, b, "en_ejecucion", undefined, { responsableId: responsable.usuarioId });
      const otro = await hallazgoEn(tx, b, "en_ejecucion");
      const [deOtro] = await tx`SELECT id FROM mejora_analisis WHERE hallazgo_id = ${otro.id}`;

      await expect(imprimir(responsable, h.id)).rejects.toThrow("NO_ENCONTRADA");
      await expect(imprimir(b.consulta, h.id)).rejects.toThrow("NO_ENCONTRADA");
      for (const raro of [String(deOtro.id), "abc", "0", ["1", "2"]]) {
        await expect(imprimir(b.admin, h.id, raro)).rejects.toThrow("NO_ENCONTRADA");
      }
      // Control positivo: quien lo ve completo sí lo imprime.
      expect(await imprimir(b.admin, h.id)).toContain(h.codigo);
    }));
});
