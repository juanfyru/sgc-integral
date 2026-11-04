/**
 * Clave inicial contra la BD de desarrollo. Escribe en `auditoria`: usuario
 * único por corrida, no se borra.
 */
import { existsSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import { obtenerSql } from "@/db/cliente";
import { hashearClave, verificarClave } from "@/lib/clave";
import { fijarClaveInicial } from "@/lib/clave-inicial";
import { generarClaveTemporal } from "@/lib/clave-politica";
import { crearSesion, validarSesion } from "@/lib/sesion";

const sql = () => obtenerSql();
const NOMBRE = `zz_inicial_${Date.now()}`;
const TEMPORAL = generarClaveTemporal();
const SIN_CONTEXTO = { ip: null, userAgent: null };
let usuarioId: number;

const cambiosDeClave = async () =>
  Number((await sql()`SELECT count(*)::int n FROM auditoria
    WHERE usuario_id = ${usuarioId} AND accion = 'cambiar_clave'`)[0].n);

async function sesionNueva() {
  const { token } = await crearSesion(usuarioId, SIN_CONTEXTO);
  const s = await validarSesion(token);
  return { token, sesionId: s!.sesionId };
}

beforeAll(async () => {
  const [u] = await sql()`INSERT INTO usuarios (usuario, nombre, hash_clave, rol, debe_cambiar_clave)
    VALUES (${NOMBRE}, 'Prueba clave inicial', ${await hashearClave(TEMPORAL)}, 'consulta', true)
    RETURNING id`;
  usuarioId = Number(u.id);
});

afterAll(async () => {
  await sql()`UPDATE usuarios SET activo = false WHERE id = ${usuarioId}`;
  await sql().end();
});

describe("fijarClaveInicial", () => {
  it("rechaza la clave temporal como clave nueva y no toca la cuenta", async () => {
    const { sesionId } = await sesionNueva();
    const r = await fijarClaveInicial({ usuarioId, usuario: NOMBRE, sesionId, claveNueva: TEMPORAL });
    expect(r).toBe("La clave nueva debe ser distinta de la clave temporal.");
    const [u] = await sql()`SELECT hash_clave, debe_cambiar_clave FROM usuarios WHERE id = ${usuarioId}`;
    expect(u.debe_cambiar_clave).toBe(true);
    expect(await verificarClave(u.hash_clave, TEMPORAL)).toBe(true);
    expect(await cambiosDeClave()).toBe(0);
  });

  it("aplica la política de claves", async () => {
    const { sesionId } = await sesionNueva();
    const r = await fijarClaveInicial({ usuarioId, usuario: NOMBRE, sesionId, claveNueva: "corta" });
    expect(r).toMatch(/12 caracteres/);
    expect(await cambiosDeClave()).toBe(0);
  });

  it("con otra clave la guarda, limpia el cambio obligatorio y conserva solo la sesión actual", async () => {
    const otra = await sesionNueva();
    const actual = await sesionNueva();
    const nueva = "frase larga de prueba inicial";
    const r = await fijarClaveInicial({ usuarioId, usuario: NOMBRE, sesionId: actual.sesionId, claveNueva: nueva });
    expect(r).toBeNull();
    const [u] = await sql()`SELECT hash_clave, debe_cambiar_clave FROM usuarios WHERE id = ${usuarioId}`;
    expect(u.debe_cambiar_clave).toBe(false);
    expect(await verificarClave(u.hash_clave, nueva)).toBe(true);
    expect(await validarSesion(actual.token)).not.toBeNull();
    expect(await validarSesion(otra.token)).toBeNull();
    expect(await cambiosDeClave()).toBe(1);
  });
});
