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
  await sql()`DELETE FROM usuarios WHERE usuario IN ('zz_perfil', 'zz_perfil_jefe')`;
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

  it("con cargo y superior, el perfil lista al supervisor", async () => {
    const sufijo = Date.now();
    const [a] = await sql()`INSERT INTO areas (nombre) VALUES (${`ZZ Perfil ${sufijo}`}) RETURNING id`;
    const [cJefe] = await sql()`INSERT INTO cargos (nombre, area_id) VALUES ('ZZ Jefe', ${a.id}) RETURNING id`;
    const [cSub] = await sql()`INSERT INTO cargos (nombre, area_id, superior_id)
      VALUES ('ZZ Sub', ${a.id}, ${cJefe.id}) RETURNING id`;
    const [j] = await sql()`INSERT INTO usuarios (usuario, nombre, hash_clave, rol, cargo_id)
      VALUES ('zz_perfil_jefe', 'Jefa de prueba', 'x', 'consulta', ${cJefe.id}) RETURNING id`;
    try {
      await sql()`UPDATE usuarios SET cargo_id = ${cSub.id} WHERE id = ${usuarioId}`;
      const p = await obtenerPerfil(usuarioId);
      expect(p?.cargo).toBe("ZZ Sub");
      expect(p?.supervisores).toEqual([{ nombre: "Jefa de prueba", cargo: "ZZ Jefe" }]);
    } finally {
      await sql()`UPDATE usuarios SET cargo_id = NULL WHERE id = ${usuarioId}`;
      await sql()`DELETE FROM usuarios WHERE id = ${j.id}`;
      await sql()`DELETE FROM cargos WHERE id = ${cSub.id}`;
      await sql()`DELETE FROM cargos WHERE id = ${cJefe.id}`;
      await sql()`DELETE FROM areas WHERE id = ${a.id}`;
    }
  });
});
