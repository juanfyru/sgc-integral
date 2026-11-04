/**
 * Regla de sesiones pendientes en sesionDePeticion, con un NextRequest real
 * que lleva la cookie de sesión.
 */
import { existsSync } from "node:fs";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import { obtenerSql } from "@/db/cliente";
import { COOKIE_SESION, crearSesion } from "@/lib/sesion";
import { sesionDePeticion } from "@/lib/sesion-actual";

const sql = () => obtenerSql();
let usuarioId: number;

// Usuario sin historia (solo sesiones): se puede borrar al final.
beforeAll(async () => {
  const [u] = await sql()`
    INSERT INTO usuarios (usuario, nombre, hash_clave, rol)
    VALUES ('prueba_sesion_actual', 'Prueba', 'hash-falso', 'control_interno')
    ON CONFLICT (usuario) DO UPDATE SET activo = true
    RETURNING id`;
  usuarioId = Number(u.id);
});

afterAll(async () => {
  await sql()`DELETE FROM usuarios WHERE usuario = 'prueba_sesion_actual'`;
  await sql().end();
});

async function peticionCon(
  marcas: { debeCambiarClave: boolean; aceptoDatos: boolean },
  factorPendiente = false,
) {
  await sql()`UPDATE usuarios SET debe_cambiar_clave = ${marcas.debeCambiarClave},
    acepto_datos_en = ${marcas.aceptoDatos ? new Date() : null} WHERE id = ${usuarioId}`;
  const { token } = await crearSesion(usuarioId, { ip: null, userAgent: null, factorPendiente });
  return new NextRequest("http://localhost:3002/", { headers: { cookie: `${COOKIE_SESION}=${token}` } });
}

describe("sesionDePeticion y sesiones pendientes", () => {
  it("factor pendiente nunca pasa, ni con permitirPendientes", async () => {
    const p = await peticionCon({ debeCambiarClave: false, aceptoDatos: true }, true);
    expect(await sesionDePeticion(p, { permitirPendientes: true })).toBeNull();
    expect(await sesionDePeticion(p)).toBeNull();
  });
  it("debeCambiarClave: sin la opción null; con la opción, la sesión", async () => {
    const p = await peticionCon({ debeCambiarClave: true, aceptoDatos: true });
    expect(await sesionDePeticion(p)).toBeNull();
    expect((await sesionDePeticion(p, { permitirPendientes: true }))?.usuarioId).toBe(usuarioId);
  });
  it("sin aviso de datos aceptado: sin la opción null; con la opción, la sesión", async () => {
    const p = await peticionCon({ debeCambiarClave: false, aceptoDatos: false });
    expect(await sesionDePeticion(p)).toBeNull();
    expect((await sesionDePeticion(p, { permitirPendientes: true }))?.usuarioId).toBe(usuarioId);
  });
  it("cuenta completa: pasa sin opciones", async () => {
    const p = await peticionCon({ debeCambiarClave: false, aceptoDatos: true });
    expect((await sesionDePeticion(p))?.usuarioId).toBe(usuarioId);
  });
  it("TOTP obligatorio sin TOTP: sin la opción null; con la opción, la sesión", async () => {
    const previo = process.env.EXIGIR_2FA_ROLES;
    process.env.EXIGIR_2FA_ROLES = "control_interno";
    try {
      const p = await peticionCon({ debeCambiarClave: false, aceptoDatos: true });
      expect(await sesionDePeticion(p)).toBeNull();
      expect((await sesionDePeticion(p, { permitirPendientes: true }))?.usuarioId).toBe(usuarioId);
    } finally {
      if (previo === undefined) delete process.env.EXIGIR_2FA_ROLES;
      else process.env.EXIGIR_2FA_ROLES = previo;
    }
  });
});
