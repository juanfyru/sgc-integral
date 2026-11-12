/**
 * La pasada de los indicadores aísla los fallos por indicador (Fase 14A, Tarea 13, ronda 1): un indicador cuya búsqueda
 * de responsables falla, o que no se puede abrir, se registra y se salta en esa pasada; los demás siguen. Contra la BD de
 * desarrollo, dentro de una transacción que se revierte, en 2003 (antes de todo inicio de medición de la base), con dos
 * funciones reales envueltas para poder hacerlas fallar con un indicador.
 */
import { existsSync } from "node:fs";
import type { TransactionSql } from "postgres";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

vi.mock("@/lib/alcance", async (original) => {
  const real = await original<typeof import("@/lib/alcance")>();
  return { ...real, responsablesDeMedir: vi.fn(real.responsablesDeMedir) };
});
vi.mock("@/lib/indicadores/periodos", async (original) => {
  const real = await original<typeof import("@/lib/indicadores/periodos")>();
  return { ...real, periodosTerminados: vi.fn(real.periodosTerminados) };
});

import { obtenerSql } from "@/db/cliente";
import { CONFIG_DOCUMENTAL_DEFECTO } from "@/db/consultas/config-documental";
import { asegurarMediciones } from "@/db/consultas/indicadores/mediciones";
import { revisarVencimientosDeIndicadores } from "@/db/consultas/indicadores/vencimientos";
import { responsablesDeMedir } from "@/lib/alcance";
import { periodosTerminados } from "@/lib/indicadores/periodos";
import { indicadorDePrueba } from "./utiles/indicadores";
import { usuarioDePrueba } from "./utiles/tramites";
import { revertida } from "./utiles/transaccion";

const sql = obtenerSql();

afterAll(async () => {
  await sql.end();
  globalThis.__sql = undefined;
});

afterEach(() => {
  vi.mocked(responsablesDeMedir).mockReset();
  vi.mocked(periodosTerminados).mockReset();
  vi.restoreAllMocks();
});

let consecutivo = 0;
const unico = () => `${Date.now() % 100_000_000}${(consecutivo += 1)}`;

const APROBADA = new Date("2002-12-15T15:00:00Z");
const abril = (d: number) => new Date(`2003-04-${String(d).padStart(2, "0")}T15:00:00Z`);
const pasada = (tx: TransactionSql, ahora: Date) =>
  revisarVencimientosDeIndicadores({ sql: tx, ahora, config: { ...CONFIG_DOCUMENTAL_DEFECTO, escalamientoDias: 3 } });

async function procesoNuevo(tx: TransactionSql): Promise<number> {
  const sigla = `Z${unico()}`;
  const [macro] = await tx`SELECT id FROM macroprocesos ORDER BY id LIMIT 1`;
  const [p] = await tx`INSERT INTO procesos (macroproceso_id, nombre, sigla, slug, icono, orden)
    VALUES (${macro.id}, ${`Proceso ${sigla}`}, ${sigla}, ${sigla.toLowerCase()}, 'circle', 99) RETURNING id`;
  return Number(p.id);
}

const vencidos = async (tx: TransactionSql, usuarioId: number) =>
  (await tx`SELECT titulo FROM notificaciones WHERE usuario_id = ${usuarioId} AND tipo = 'indicadores.vencido' ORDER BY id`).map((f) => f.titulo);

describe("la pasada de los indicadores aísla los fallos", () => {
  it("un indicador cuya búsqueda de responsables falla no impide los avisos de otro en la misma pasada", () =>
    revertida(sql, async (tx) => {
      const proceso = await procesoNuevo(tx);
      const mideRoto = await usuarioDePrueba(tx, { rol: "consulta" });
      const mideSano = await usuarioDePrueba(tx, { rol: "consulta" });
      const roto = await indicadorDePrueba(tx, { procesoId: proceso, inicioMedicion: "2003-03", aprobadaEn: APROBADA, mide: [mideRoto.usuarioId] });
      const sano = await indicadorDePrueba(tx, { procesoId: proceso, inicioMedicion: "2003-03", aprobadaEn: APROBADA, mide: [mideSano.usuarioId] });
      for (const i of [roto, sano]) await asegurarMediciones({ sql: tx, ahora: abril(5), indicadorId: i.id });
      const real = (await vi.importActual<typeof import("@/lib/alcance")>("@/lib/alcance")).responsablesDeMedir;
      vi.mocked(responsablesDeMedir).mockImplementation(async (id, o) => {
        if (id === roto.id) throw new Error("sin conexión");
        return real(id, o);
      });
      const registro = vi.spyOn(console, "error").mockImplementation(() => {});

      expect(await pasada(tx, abril(12))).toEqual({ avisados: 1, escalados: 0 });
      expect(await vencidos(tx, mideSano.usuarioId)).toEqual(["Tiene 1 indicador por reportar con el plazo vencido"]);
      expect(await vencidos(tx, mideRoto.usuarioId)).toEqual([]);
      expect(registro).toHaveBeenCalledWith(expect.stringContaining(`indicador ${roto.id}`), expect.any(Error));
      const [m] = await tx`SELECT aviso_vencido_en FROM mediciones WHERE indicador_id = ${roto.id}`;
      expect(m.aviso_vencido_en).toBeNull();

      // En la pasada siguiente, ya sin el fallo, sale.
      vi.mocked(responsablesDeMedir).mockImplementation(real);
      expect(await pasada(tx, abril(13))).toEqual({ avisados: 1, escalados: 0 });
      expect(await vencidos(tx, mideRoto.usuarioId)).toEqual(["Tiene 1 indicador por reportar con el plazo vencido"]);
    }));

  it("un indicador que falla al abrir sus periodos no impide abrir los de otro", () =>
    revertida(sql, async (tx) => {
      const proceso = await procesoNuevo(tx);
      // El que falla va primero: se abre en orden de id.
      const roto = await indicadorDePrueba(tx, { procesoId: proceso, inicioMedicion: "2003-02", aprobadaEn: APROBADA });
      const sano = await indicadorDePrueba(tx, { procesoId: proceso, inicioMedicion: "2003-03", aprobadaEn: APROBADA });
      const real = (await vi.importActual<typeof import("@/lib/indicadores/periodos")>("@/lib/indicadores/periodos")).periodosTerminados;
      vi.mocked(periodosTerminados).mockImplementation((p, desde, ahora, zona) => {
        if (desde === "2003-02") throw new Error("periodo ilegible");
        return real(p, desde, ahora, zona);
      });
      const registro = vi.spyOn(console, "error").mockImplementation(() => {});

      await pasada(tx, abril(20));
      expect((await tx`SELECT periodo FROM mediciones WHERE indicador_id = ${sano.id}`).map((f) => f.periodo)).toEqual(["2003-03"]);
      expect(await tx`SELECT id FROM mediciones WHERE indicador_id = ${roto.id}`).toHaveLength(0);
      expect(registro).toHaveBeenCalledWith(expect.stringContaining(`indicador ${roto.id}`), expect.any(Error));
    }));
});
