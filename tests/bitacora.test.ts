/**
 * Consulta de la bitácora (Fase 8) contra la BD dev: filtros, paginación de
 * tamaño fijo, orden más reciente primero y búsqueda por texto en el detalle.
 */
import { existsSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
if (!process.env.DATABASE_URL && existsSync(".env.local")) process.loadEnvFile(".env.local");
import { obtenerSql } from "@/db/cliente";
import { obtenerBitacora } from "@/db/consultas/bitacora";

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
});
