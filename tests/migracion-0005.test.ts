/**
 * Migración 0005 (F13A-R37 y R38): los ocho ítems de la lista si la tabla está vacía, y los índices
 * parciales de `todosLosCodigos` y `codigoAbandonado`.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import postgres, { type Sql, type TransactionSql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Cliente } from "@/db/cliente";
import { codigoAbandonado, todosLosCodigos } from "@/db/consultas/codigos";
import { ITEMS_VERIFICACION } from "@/db/semillas/minima";
import { revertida } from "./utiles/transaccion";

// vitest pone NODE_ENV=test y en ese modo @next/env ignora .env.local.
if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

const drizzle = path.resolve(import.meta.dirname, "../drizzle");
const migracion = readFileSync(path.join(drizzle, "0005_fase13a-lista-e-indices.sql"), "utf8");
const insercion = migracion.split("--> statement-breakpoint").find((s) => s.trim().startsWith("INSERT")) ?? "";

let sql: Sql;

beforeAll(() => {
  sql = postgres(process.env.DATABASE_URL!, { max: 1 });
});

afterAll(async () => {
  await sql.end();
});

/** `pg_temp` va primero en la ruta de búsqueda: esta tabla vacía tapa a la real, y la migración escribe en ella. */
const sombraDeLaLista = (tx: TransactionSql) =>
  tx`CREATE TEMP TABLE lista_verificacion_items (LIKE public.lista_verificacion_items INCLUDING ALL) ON COMMIT DROP`;

describe("los ítems de la lista de verificación", () => {
  it("con la tabla vacía inserta los ocho de la semilla: mismos textos, crítico y orden, y activos", () => revertida(sql, async (tx) => {
    await sombraDeLaLista(tx);
    await tx.unsafe(insercion);
    const filas = await tx`SELECT texto, critico, orden, activo FROM lista_verificacion_items ORDER BY orden`;
    expect(filas.map((f) => [f.texto, f.critico])).toEqual(ITEMS_VERIFICACION);
    expect(filas.map((f) => f.orden)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(filas.every((f) => f.activo)).toBe(true);
  }));

  it("con un ítem en la tabla no inserta nada: la lista de la entidad no se toca", () => revertida(sql, async (tx) => {
    await sombraDeLaLista(tx);
    await tx`INSERT INTO lista_verificacion_items (texto, critico, orden, activo) VALUES ('Propio de la entidad', false, 1, false)`;
    await tx.unsafe(insercion);
    const filas = await tx`SELECT texto, activo FROM lista_verificacion_items`;
    expect(filas).toEqual([{ texto: "Propio de la entidad", activo: false }]);
  }));
});

describe("el diario de migraciones", () => {
  it("cada entrada es posterior a la anterior: el migrador se salta la que no lo sea", () => {
    const { entries } = JSON.parse(readFileSync(path.join(drizzle, "meta/_journal.json"), "utf8")) as {
      entries: { tag: string; when: number }[];
    };
    expect(entries.map((e) => e.tag)).toContain("0005_fase13a-lista-e-indices");
    for (const [i, entrada] of entries.entries()) {
      if (i > 0) expect(entrada.when).toBeGreaterThan(entries[i - 1].when);
    }
  });
});

/** Un `Cliente` que deja pasar las consultas y guarda su texto, con `$n` en lugar de cada valor. */
function capturando(tx: TransactionSql) {
  const consultas: { texto: string; valores: unknown[] }[] = [];
  const espia = (partes: TemplateStringsArray, ...valores: never[]) => {
    consultas.push({ texto: partes.reduce((texto, parte, i) => `${texto}$${i}${parte}`), valores });
    return tx(partes, ...valores);
  };
  return { espia: espia as unknown as Cliente, consultas };
}

const literal = (v: unknown) => (v === null ? "NULL" : typeof v === "number" ? String(v) : `'${String(v)}'`);

/**
 * El plan de la consulta real como sentencia preparada con plan genérico: el peor caso, porque ahí el
 * planificador no conoce los parámetros y un índice parcial solo sirve si el filtro va escrito en el SQL.
 * Sin `seqscan`, porque en la base de desarrollo la tabla es pequeña y recorrerla siempre gana.
 */
async function planGenerico(tx: TransactionSql, consultar: (sql: Cliente) => Promise<unknown>): Promise<string> {
  const { espia, consultas } = capturando(tx);
  await consultar(espia);
  expect(consultas).toHaveLength(1);
  const [{ texto, valores }] = consultas;
  await tx`SET LOCAL enable_seqscan = off`;
  await tx`SET LOCAL plan_cache_mode = force_generic_plan`;
  await tx.unsafe(`PREPARE plan_0005 AS ${texto}`);
  const argumentos = valores.length > 0 ? `(${valores.map(literal).join(", ")})` : "";
  const plan = await tx.unsafe(`EXPLAIN EXECUTE plan_0005${argumentos}`);
  await tx.unsafe("DEALLOCATE plan_0005");
  return plan.map((f) => f["QUERY PLAN"]).join("\n");
}

/**
 * Una copia vacía de la tabla con ese único índice, tal como quedó en la base: el resultado no depende
 * de las estadísticas ni de que otro índice salga más barato. Si el filtro no prueba el predicado, el
 * plan no lo usa.
 */
async function soloConElIndice(tx: TransactionSql, tabla: string, indice: string) {
  await tx.unsafe(`CREATE TEMP TABLE ${tabla} (LIKE public.${tabla}) ON COMMIT DROP`);
  const [{ indexdef }] = await tx`SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND indexname = ${indice}`;
  await tx.unsafe(indexdef.replace(`ON public.${tabla}`, `ON pg_temp.${tabla}`));
}

const conLosDosIndices = async (tx: TransactionSql) => {
  await soloConElIndice(tx, "auditoria", "auditoria_cambios_codigo_idx");
  await soloConElIndice(tx, "tramite_eventos", "tramite_eventos_codigo_corregido_idx");
};

describe("los índices de los códigos abandonados", () => {
  it("todosLosCodigos usa los dos índices parciales", () => revertida(sql, async (tx) => {
    await conLosDosIndices(tx);
    const plan = await planGenerico(tx, (s) => todosLosCodigos({ sql: s }));
    expect(plan).toContain("auditoria_cambios_codigo_idx");
    expect(plan).toContain("tramite_eventos_codigo_corregido_idx");
  }));

  it("codigoAbandonado usa los dos índices parciales", () => revertida(sql, async (tx) => {
    await conLosDosIndices(tx);
    const plan = await planGenerico(tx, (s) => codigoAbandonado("ZZ-CD-99", null, { sql: s, documentoId: 1 }));
    expect(plan).toContain("auditoria_cambios_codigo_idx");
    expect(plan).toContain("tramite_eventos_codigo_corregido_idx");
  }));
});
