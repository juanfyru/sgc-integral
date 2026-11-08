import { existsSync } from "node:fs";
import type { TransactionSql } from "postgres";
import { afterAll, describe, expect, it } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import { obtenerSql } from "@/db/cliente";
import { filtroPuntos, puedeVerDistribucion, type SujetoVisibilidad } from "@/lib/alcance";
import { puntoDePrueba } from "./utiles/distribucion";
import { revertida } from "./utiles/transaccion";
import { usuarioDePrueba } from "./utiles/tramites";

const sql = obtenerSql();
afterAll(async () => {
  await sql.end({ timeout: 5 });
});

describe("puedeVerDistribucion", () => {
  it("la ven admin, gerencia, control interno y líder; consulta solo si es responsable", () => {
    const base = { usuarioId: 1, verHistorial: false };
    expect(puedeVerDistribucion({ ...base, rol: "admin_sgc" })).toBe(true);
    expect(puedeVerDistribucion({ ...base, rol: "gerencia" })).toBe(true);
    expect(puedeVerDistribucion({ ...base, rol: "control_interno" })).toBe(true);
    expect(puedeVerDistribucion({ ...base, rol: "lider_proceso" })).toBe(true);
    expect(puedeVerDistribucion({ ...base, rol: "consulta" })).toBe(false);
    expect(puedeVerDistribucion({ ...base, rol: "consulta", responsableDePuntos: false })).toBe(false);
    expect(puedeVerDistribucion({ ...base, rol: "consulta", responsableDePuntos: true })).toBe(true);
  });
});

describe("filtroPuntos", () => {
  async function visibles(tx: TransactionSql, sujeto: SujetoVisibilidad, ids: number[]) {
    const filas = await tx`SELECT pu.id FROM puntos_uso pu WHERE pu.id IN ${tx(ids)} AND ${filtroPuntos(tx, sujeto)}`;
    return filas.map((f) => Number(f.id)).sort();
  }

  it("el líder de ATE ve el punto de ATE y no el de GTH, salvo que sea su responsable", () =>
    revertida(sql, async (tx) => {
      const [ate] = await tx`SELECT id FROM procesos WHERE sigla = 'ATE'`;
      const lider = await usuarioDePrueba(tx, { rol: "lider_proceso", procesos: [Number(ate.id)] });
      const otro = await usuarioDePrueba(tx, { rol: "consulta" });
      const deAte = await puntoDePrueba(tx, { responsable: otro, procesos: ["ATE"] });
      const deGth = await puntoDePrueba(tx, { responsable: otro, procesos: ["GTH"] });
      const suyo = await puntoDePrueba(tx, { responsable: lider, procesos: ["GTH"] });
      const ids = [deAte.id, deGth.id, suyo.id];
      expect(await visibles(tx, lider, ids)).toEqual([deAte.id, suyo.id].sort());
      expect(await visibles(tx, await usuarioDePrueba(tx, { rol: "gerencia" }), ids)).toEqual([...ids].sort());
      expect(await visibles(tx, await usuarioDePrueba(tx, { rol: "consulta" }), ids)).toEqual([]);
      expect(await visibles(tx, otro, ids)).toEqual([deAte.id, deGth.id].sort());
    }));
});
