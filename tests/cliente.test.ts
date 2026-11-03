/** bigint de PostgreSQL (ids identity, count) llega como number. */
import { existsSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import { obtenerSql } from "@/db/cliente";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

describe("obtenerSql: int8 como number", () => {
  const sql = () => obtenerSql();
  afterAll(async () => {
    await sql().end();
    globalThis.__sql = undefined;
  });

  it("id de SELECT es number", async () => {
    const [r] = await sql()`SELECT id FROM usuarios LIMIT 1`;
    expect(typeof r.id).toBe("number");
  });
  it("count(*) es number", async () => {
    const [r] = await sql()`SELECT count(*) AS n FROM usuarios`;
    expect(typeof r.n).toBe("number");
  });
  it("INSERT ... RETURNING id es number y la serialización funciona", async () => {
    const [u] = await sql()`INSERT INTO usuarios (usuario, nombre, hash_clave) VALUES (${"zz_cli_" + Date.now()}, 'x', 'h') RETURNING id`;
    expect(typeof u.id).toBe("number");
    const [b] = await sql()`SELECT id FROM usuarios WHERE id = ${u.id}`;
    expect(b.id).toBe(u.id);
    await sql()`DELETE FROM usuarios WHERE id = ${u.id}`;
  });
});
