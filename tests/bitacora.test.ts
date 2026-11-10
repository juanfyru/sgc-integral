/**
 * Consulta de la bitácora (Fase 8) contra la BD dev: filtros, paginación de
 * tamaño fijo, orden más reciente primero y búsqueda por texto en el detalle.
 */
import { existsSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
if (!process.env.DATABASE_URL && existsSync(".env.local")) process.loadEnvFile(".env.local");
import { obtenerSql } from "@/db/cliente";
import { obtenerBitacora } from "@/db/consultas/bitacora";
import { revertida } from "./utiles/transaccion";

const sql = () => obtenerSql();
// La bitácora es de solo inserción: no se limpia; la marca es única por corrida.
const MARCA = `ZZ_BIT_${Date.now()}`;

beforeAll(async () => {
  for (let i = 0; i < 3; i++)
    await sql()`INSERT INTO auditoria (usuario_id, accion, entidad, entidad_id, detalle)
      VALUES (NULL, ${MARCA}, 'prueba', ${i}, ${sql().json({ n: i })})`;
});
afterAll(async () => {
  await sql().end();
});

describe("obtenerBitacora", () => {
  it("filtra por acción y ordena más reciente primero", async () => {
    const r = await obtenerBitacora({ accion: MARCA });
    expect(r.filas).toHaveLength(3);
    expect(r.filas[0].creadoEn >= r.filas[2].creadoEn).toBe(true);
    expect(r.filas[0].usuario).toBe("sistema");
    expect(r.acciones).toContain(MARCA);
  });

  it("pagina con tamaño fijo", async () => {
    const r = await obtenerBitacora({ accion: MARCA, pagina: 2 });
    expect(r.pagina).toBe(2);
    expect(r.total).toBe(3);
    expect(r.filas).toHaveLength(0); // 3 caben en la página 1 (tamaño 50)
  });

  it("busca por texto en el detalle", async () => {
    const r = await obtenerBitacora({ accion: MARCA, texto: "2" });
    expect(r.filas.some((f) => (f.detalle as { n: number }).n === 2)).toBe(true);
  });

  it("una relación entre normas deja una fila en cada norma y la bitácora la muestra una vez (13C, resolución 4 de la Tarea 14)", () =>
    revertida(sql(), async (tx) => {
      const marca = `ZZ_REL_${Date.now()}`;
      // Como `auditarEnLasDos` (normograma/relaciones.ts): el mismo detalle en la norma que causa y en la afectada.
      for (const [accion, relacionId] of [["norma_relacion", 900001], ["norma_relacion_eliminada", 900001], ["norma_relacion", 900002]] as const) {
        const detalle = { relacionId, tipo: "deroga", normaId: 71, norma: `Resolución ${marca}`, afectadaId: 72, afectada: "Resolución 2003 de 2014" };
        for (const entidadId of [71, 72]) {
          await tx`INSERT INTO auditoria (usuario_id, accion, entidad, entidad_id, detalle) VALUES (NULL, ${accion}, 'norma', ${entidadId}, ${tx.json(detalle)})`;
        }
      }
      const r = await obtenerBitacora({ texto: marca }, { sql: tx });
      expect(r.total).toBe(3);
      expect(r.filas.map((f) => [f.accion, f.entidadId, f.detalle.relacionId])).toEqual([
        ["norma_relacion", 71, 900002],
        ["norma_relacion_eliminada", 71, 900001],
        ["norma_relacion", 71, 900001],
      ]);
      // La de la afectada se sigue encontrando por su norma: el detalle la nombra.
      expect((await obtenerBitacora({ texto: "72", accion: "norma_relacion_eliminada", entidad: "norma" }, { sql: tx })).filas.map((f) => f.detalle.relacionId)).toContain(900001);
      // Las filas no se tocan: las seis siguen en la tabla.
      const [{ total }] = await tx`SELECT count(*)::int AS total FROM auditoria WHERE detalle->>'norma' = ${`Resolución ${marca}`}`;
      expect(total).toBe(6);
    }));

  it("una fila de relación con un `normaId` que no es un número no tumba la bitácora y se muestra (R-M5)", () =>
    revertida(sql(), async (tx) => {
      const marca = `ZZ_REL_MAL_${Date.now()}`;
      await tx`INSERT INTO auditoria (usuario_id, accion, entidad, entidad_id, detalle)
        VALUES (NULL, 'norma_relacion', 'norma', 71, ${tx.json({ relacionId: 900003, normaId: "setenta y uno", norma: marca })})`;
      const r = await obtenerBitacora({ texto: marca }, { sql: tx });
      expect(r.total).toBe(1);
      expect(r.filas.map((f) => f.detalle.relacionId)).toEqual([900003]);
    }));
});
