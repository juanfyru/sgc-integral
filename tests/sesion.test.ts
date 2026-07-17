/**
 * Ciclo de sesión del admin contra la BD de desarrollo (migrada y sembrada).
 */
import { existsSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// vitest pone NODE_ENV=test y en ese modo @next/env ignora .env.local;
// se carga con el mecanismo nativo de Node (>=20.12).
if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import { obtenerSql } from "@/db/cliente";
import { cerrarSesion, crearSesion, validarSesion } from "@/lib/sesion";

const sql = () => obtenerSql();
let usuarioId: number;

beforeAll(async () => {
  const [u] = await sql()`
    INSERT INTO usuarios (usuario, nombre, hash_clave)
    VALUES ('prueba_sesion', 'Prueba', 'hash-falso')
    ON CONFLICT (usuario) DO UPDATE SET activo = true
    RETURNING id`;
  usuarioId = u.id;
});

afterAll(async () => {
  await sql()`DELETE FROM usuarios WHERE usuario = 'prueba_sesion'`;
  await sql().end();
});

describe("sesiones", () => {
  it("crea y valida una sesión; en BD nunca está el token", async () => {
    const { token } = await crearSesion(usuarioId);
    const valida = await validarSesion(token);
    expect(valida?.usuario).toBe("prueba_sesion");
    const filas = await sql()`SELECT id FROM sesiones WHERE usuario_id = ${usuarioId}`;
    expect(filas.some((f) => f.id === token)).toBe(false); // solo el hash
  });

  it("rechaza token inventado y token vacío", async () => {
    expect(await validarSesion("token-inventado")).toBeNull();
    expect(await validarSesion(null)).toBeNull();
    expect(await validarSesion(undefined)).toBeNull();
  });

  it("una sesión vencida no vale y se limpia", async () => {
    const { token } = await crearSesion(usuarioId);
    await sql()`UPDATE sesiones SET expira_en = now() - interval '1 minute'
      WHERE usuario_id = ${usuarioId}`;
    expect(await validarSesion(token)).toBeNull();
    const vivas = await sql()`SELECT 1 FROM sesiones
      WHERE usuario_id = ${usuarioId} AND expira_en < now()`;
    expect(vivas.length).toBe(0); // limpieza oportunista
  });

  it("renueva cuando quedan menos de 6 h (deslizante)", async () => {
    const { token } = await crearSesion(usuarioId);
    await sql()`UPDATE sesiones SET expira_en = now() + interval '1 hour'
      WHERE usuario_id = ${usuarioId}`;
    await validarSesion(token);
    const [s] = await sql()`SELECT expira_en FROM sesiones WHERE usuario_id = ${usuarioId}`;
    expect(new Date(s.expira_en).getTime()).toBeGreaterThan(Date.now() + 11 * 3600_000);
  });

  it("un usuario inactivo no valida aunque su sesión viva", async () => {
    const { token } = await crearSesion(usuarioId);
    await sql()`UPDATE usuarios SET activo = false WHERE id = ${usuarioId}`;
    expect(await validarSesion(token)).toBeNull();
    await sql()`UPDATE usuarios SET activo = true WHERE id = ${usuarioId}`;
  });

  it("cerrarSesion invalida el token", async () => {
    const { token } = await crearSesion(usuarioId);
    await cerrarSesion(token);
    expect(await validarSesion(token)).toBeNull();
  });
});
