/**
 * Perfil de la cuenta contra la BD de desarrollo. El usuario solo tiene un
 * proceso asignado y sesiones (sin auditoría ni accesos), así que se puede borrar.
 */
import { existsSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import { obtenerSql } from "@/db/cliente";
import { obtenerPerfil } from "@/db/consultas/perfil";

const sql = () => obtenerSql();
let usuarioId: number;
let procesoId: number;

beforeAll(async () => {
  await sql()`DELETE FROM usuarios WHERE usuario = 'zz_perfil'`;
  const [p] = await sql()`SELECT id FROM procesos ORDER BY id LIMIT 1`;
  procesoId = Number(p.id);
  const [u] = await sql()`INSERT INTO usuarios (usuario, nombre, hash_clave, rol)
    VALUES ('zz_perfil', 'Prueba perfil', 'x', 'lider_proceso') RETURNING id`;
  usuarioId = Number(u.id);
  await sql()`INSERT INTO usuario_procesos (usuario_id, proceso_id) VALUES (${usuarioId}, ${procesoId})`;
});

afterAll(async () => {
  await sql()`DELETE FROM usuarios WHERE id = ${usuarioId}`;
  await sql().end();
});

describe("obtenerPerfil", () => {
  it("arma el perfil con rol, procesos y sin supervisores todavía", async () => {
    const p = await obtenerPerfil(usuarioId);
    expect(p).toMatchObject({ usuario: "zz_perfil", rol: "lider_proceso", totpActivo: false, supervisores: [] });
    expect(p?.procesos.map((x) => x.id)).toEqual([procesoId]);
    expect(await obtenerPerfil(-1)).toBeNull();
  });
});
