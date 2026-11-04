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
import { asegurarAdmin } from "@/db/consultas/admin";
import { verificarClave } from "@/lib/clave";
import {
  cerrarSesion,
  cerrarSesionesDeUsuario,
  cerrarSesionPorId,
  confirmarSegundoFactor,
  crearSesion,
  listarSesionesActivas,
  validarSesion,
} from "@/lib/sesion";

const SIN_CONTEXTO = { ip: null, userAgent: null };

const sql = () => obtenerSql();
let usuarioId: number;

beforeAll(async () => {
  const [u] = await sql()`
    INSERT INTO usuarios (usuario, nombre, hash_clave, rol)
    VALUES ('prueba_sesion', 'Prueba', 'hash-falso', 'control_interno')
    ON CONFLICT (usuario) DO UPDATE SET activo = true, rol = 'control_interno',
      acepto_datos_en = NULL, debe_cambiar_clave = false, totp_activo = false
    RETURNING id`;
  usuarioId = u.id;
});

afterAll(async () => {
  await sql()`DELETE FROM usuarios WHERE usuario = 'prueba_sesion'`;
  await sql().end();
});

describe("sesiones", () => {
  it("crea y valida una sesión; en BD nunca está el token", async () => {
    const { token } = await crearSesion(usuarioId, SIN_CONTEXTO);
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
    const { token } = await crearSesion(usuarioId, SIN_CONTEXTO);
    await sql()`UPDATE sesiones SET expira_en = now() - interval '1 minute'
      WHERE usuario_id = ${usuarioId}`;
    expect(await validarSesion(token)).toBeNull();
    const vivas = await sql()`SELECT 1 FROM sesiones
      WHERE usuario_id = ${usuarioId} AND expira_en < now()`;
    expect(vivas.length).toBe(0); // limpieza oportunista
  });

  it("renueva cuando quedan menos de 6 h (deslizante)", async () => {
    const { token } = await crearSesion(usuarioId, SIN_CONTEXTO);
    await sql()`UPDATE sesiones SET expira_en = now() + interval '1 hour'
      WHERE usuario_id = ${usuarioId}`;
    await validarSesion(token);
    const [s] = await sql()`SELECT expira_en FROM sesiones WHERE usuario_id = ${usuarioId}`;
    expect(new Date(s.expira_en).getTime()).toBeGreaterThan(Date.now() + 11 * 3600_000);
  });

  it("un usuario inactivo no valida aunque su sesión viva", async () => {
    const { token } = await crearSesion(usuarioId, SIN_CONTEXTO);
    await sql()`UPDATE usuarios SET activo = false WHERE id = ${usuarioId}`;
    expect(await validarSesion(token)).toBeNull();
    await sql()`UPDATE usuarios SET activo = true WHERE id = ${usuarioId}`;
  });

  it("cerrarSesion invalida el token", async () => {
    const { token } = await crearSesion(usuarioId, SIN_CONTEXTO);
    await cerrarSesion(token);
    expect(await validarSesion(token)).toBeNull();
  });
  it("devuelve rol, marcas de cuenta y sesionId", async () => {
    const { token } = await crearSesion(usuarioId, { ip: "10.0.0.1", userAgent: "vitest" });
    const s = await validarSesion(token);
    expect(s).toMatchObject({ rol: "control_interno", factorPendiente: false, debeCambiarClave: false, aceptoDatos: false, totpActivo: false });
    expect(typeof s?.usuarioId).toBe("number");
    expect(s?.sesionId).toHaveLength(64);
    const [fila] = await sql()`SELECT host(ip) AS ip, user_agent FROM sesiones WHERE id = ${s!.sesionId}`;
    expect(fila).toEqual({ ip: "10.0.0.1", user_agent: "vitest" });
  });
  it("una sesión inactiva más del límite no vale", async () => {
    const { token } = await crearSesion(usuarioId, SIN_CONTEXTO);
    await sql()`UPDATE sesiones SET ultimo_uso_en = now() - interval '61 minutes' WHERE usuario_id = ${usuarioId}`;
    expect(await validarSesion(token, { inactividadMs: 60 * 60_000 })).toBeNull();
  });
  it("ultimo_uso_en solo se escribe si tiene más de 60 s", async () => {
    const { token } = await crearSesion(usuarioId, SIN_CONTEXTO);
    const s = await validarSesion(token);
    const [a] = await sql()`SELECT ultimo_uso_en FROM sesiones WHERE id = ${s!.sesionId}`;
    await validarSesion(token);
    const [b] = await sql()`SELECT ultimo_uso_en FROM sesiones WHERE id = ${s!.sesionId}`;
    expect(String(b.ultimo_uso_en)).toBe(String(a.ultimo_uso_en));
    await sql()`UPDATE sesiones SET ultimo_uso_en = now() - interval '2 minutes' WHERE id = ${s!.sesionId}`;
    await validarSesion(token);
    const [c] = await sql()`SELECT ultimo_uso_en FROM sesiones WHERE id = ${s!.sesionId}`;
    expect(new Date(c.ultimo_uso_en).getTime()).toBeGreaterThan(Date.now() - 60_000);
  });
  it("factor pendiente se crea, se refleja y se confirma", async () => {
    const { token } = await crearSesion(usuarioId, { ip: null, userAgent: null, factorPendiente: true });
    const s = await validarSesion(token);
    expect(s?.factorPendiente).toBe(true);
    await confirmarSegundoFactor(s!.sesionId);
    expect((await validarSesion(token))?.factorPendiente).toBe(false);
  });
  it("cerrarSesionesDeUsuario conserva la indicada y cierra las demás", async () => {
    const a = await crearSesion(usuarioId, SIN_CONTEXTO);
    const b = await crearSesion(usuarioId, SIN_CONTEXTO);
    const sa = await validarSesion(a.token);
    const cerradas = await cerrarSesionesDeUsuario(usuarioId, sa!.sesionId);
    expect(cerradas).toBeGreaterThanOrEqual(1);
    expect(await validarSesion(a.token)).not.toBeNull();
    expect(await validarSesion(b.token)).toBeNull();
  });
  it("listarSesionesActivas y cerrarSesionPorId", async () => {
    const { token } = await crearSesion(usuarioId, { ip: "10.0.0.9", userAgent: "x" });
    const s = await validarSesion(token);
    const lista = await listarSesionesActivas();
    expect(lista.some((x) => x.sesionId === s!.sesionId && x.usuario === "prueba_sesion")).toBe(true);
    expect(await cerrarSesionPorId(s!.sesionId)).toEqual({ usuarioId });
    expect(await validarSesion(token)).toBeNull();
  });
});

describe("asegurarAdmin", () => {
  afterAll(async () => {
    await sql()`DELETE FROM usuarios WHERE usuario = 'admin_prueba'`;
  });

  it("crea, no duplica, y solo cambia la clave con forzar", async () => {
    expect(await asegurarAdmin("admin_prueba", "Admin", "clave-uno")).toBe("creado");
    expect(await asegurarAdmin("admin_prueba", "Admin", "clave-dos")).toBe("existente");

    let [u] = await sql()`SELECT hash_clave FROM usuarios WHERE usuario = 'admin_prueba'`;
    expect(await verificarClave(u.hash_clave, "clave-uno")).toBe(true);

    expect(await asegurarAdmin("admin_prueba", "Admin", "clave-dos", true)).toBe("clave_actualizada");
    [u] = await sql()`SELECT hash_clave FROM usuarios WHERE usuario = 'admin_prueba'`;
    expect(await verificarClave(u.hash_clave, "clave-dos")).toBe(true);
  });
});
