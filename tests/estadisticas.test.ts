/**
 * Estadísticas del panel (Fase 8) contra la BD dev: KPIs, Top-N de vistos y
 * descargados, búsquedas sin resultados y serie temporal, con reloj inyectado
 * para que el filtrado por rango sea determinista.
 */
import { existsSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
if (!process.env.DATABASE_URL && existsSync(".env.local")) process.loadEnvFile(".env.local");
import { obtenerSql } from "@/db/cliente";
import { obtenerEstadisticas } from "@/db/consultas/estadisticas";

const sql = () => obtenerSql();
let docA: number, docB: number;
const AHORA = new Date("2026-07-18T12:00:00Z");
const TERMINO = "zz-est-fantasma";

async function limpiar() {
  await sql()`DELETE FROM eventos_consulta WHERE documento_id IN
    (SELECT id FROM documentos WHERE codigo LIKE 'ZZ-EST-%')`;
  await sql()`DELETE FROM busquedas WHERE termino = ${TERMINO}`;
  await sql()`DELETE FROM documento_versiones WHERE documento_id IN
    (SELECT id FROM documentos WHERE codigo LIKE 'ZZ-EST-%')`;
  await sql()`DELETE FROM documentos WHERE codigo LIKE 'ZZ-EST-%'`;
}

beforeAll(async () => {
  await limpiar();
  const [{ id: tipoId }] = await sql()`SELECT id FROM tipos_documento LIMIT 1`;
  [{ id: docA }] = await sql()`INSERT INTO documentos (codigo, titulo, tipo_id)
    VALUES ('ZZ-EST-001', 'Doc A', ${tipoId}) RETURNING id`;
  [{ id: docB }] = await sql()`INSERT INTO documentos (codigo, titulo, tipo_id)
    VALUES ('ZZ-EST-002', 'Doc B', ${tipoId}) RETURNING id`;
  const reciente = "2026-07-17T10:00:00Z";
  const viejo = "2026-05-01T10:00:00Z";
  for (let i = 0; i < 3; i++)
    await sql()`INSERT INTO eventos_consulta (tipo, documento_id, creado_en)
      VALUES ('vista', ${docA}, ${reciente})`;
  await sql()`INSERT INTO eventos_consulta (tipo, documento_id, creado_en)
    VALUES ('vista', ${docB}, ${reciente})`;
  for (let i = 0; i < 2; i++)
    await sql()`INSERT INTO eventos_consulta (tipo, documento_id, creado_en)
      VALUES ('descarga', ${docB}, ${reciente})`;
  // Vista vieja de docA: fuera del rango de 7 días.
  await sql()`INSERT INTO eventos_consulta (tipo, documento_id, creado_en)
    VALUES ('vista', ${docA}, ${viejo})`;
  // Búsqueda sin resultados, 2 veces.
  for (let i = 0; i < 2; i++)
    await sql()`INSERT INTO busquedas (termino, cantidad_resultados, creado_en)
      VALUES (${TERMINO}, 0, ${reciente})`;
});
afterAll(async () => {
  await limpiar();
  await sql().end();
});

describe("obtenerEstadisticas", () => {
  it("cuenta vistas/descargas del rango y ordena Top-N", async () => {
    const e = await obtenerEstadisticas({ rango: "7", ahora: AHORA });
    const a = e.masVistos.find((d) => d.codigo === "ZZ-EST-001");
    expect(a?.conteo).toBe(3); // no incluye la vista vieja
    const b = e.masDescargados.find((d) => d.codigo === "ZZ-EST-002");
    expect(b?.conteo).toBe(2);
    expect(e.totalVistas).toBeGreaterThanOrEqual(4);
  });

  it("agrupa búsquedas sin resultados por término", async () => {
    const e = await obtenerEstadisticas({ rango: "30", ahora: AHORA });
    const t = e.sinResultados.find((x) => x.termino === TERMINO);
    expect(t?.veces).toBe(2);
  });

  it("rango 'todo' incluye eventos viejos", async () => {
    const e = await obtenerEstadisticas({ rango: "todo", ahora: AHORA });
    const a = e.masVistos.find((d) => d.codigo === "ZZ-EST-001");
    expect(a?.conteo).toBe(4); // 3 recientes + 1 vieja
  });
});
