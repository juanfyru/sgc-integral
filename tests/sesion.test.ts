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
    expect(new Date(b.ultimo_uso_en).getTime()).toBe(new Date(a.ultimo_uso_en).getTime());
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
  // forzarClave deja fila en `accesos`: nombres únicos por corrida que no se borran.
  const ts = Date.now();
  const ADMIN = `zz_sesion_admin_${ts}`;
  const idDe = async (usuario: string) =>
    Number((await sql()`SELECT id FROM usuarios WHERE usuario = ${usuario}`)[0].id);

  afterAll(async () => {
    await sql()`UPDATE usuarios SET activo = false WHERE usuario LIKE ${`zz\\_sesion\\_%\\_${ts}`}`;
  });

  it("crea, no duplica, y solo cambia la clave con forzar", async () => {
    expect(await asegurarAdmin(ADMIN, "Admin", "clave-uno")).toBe("creado");
    expect(await asegurarAdmin(ADMIN, "Admin", "clave-dos")).toBe("existente");

    let [u] = await sql()`SELECT hash_clave FROM usuarios WHERE usuario = ${ADMIN}`;
    expect(await verificarClave(u.hash_clave, "clave-uno")).toBe(true);

    expect(await asegurarAdmin(ADMIN, "Admin", "clave-dos", true)).toBe("clave_actualizada");
    [u] = await sql()`SELECT hash_clave FROM usuarios WHERE usuario = ${ADMIN}`;
    expect(await verificarClave(u.hash_clave, "clave-dos")).toBe(true);
  });

  it("crea con rol admin_sgc y debe_cambiar_clave; forzarClave desbloquea y reinicia contadores", async () => {
    let [u] = await sql()`SELECT rol, debe_cambiar_clave FROM usuarios WHERE usuario = ${ADMIN}`;
    expect(u).toEqual({ rol: "admin_sgc", debe_cambiar_clave: true });
    await sql()`UPDATE usuarios SET debe_cambiar_clave = false, activo = false, intentos_fallidos = 3,
      bloqueos_consecutivos = 2, bloqueado_hasta = now() + interval '1 hour' WHERE usuario = ${ADMIN}`;
    await asegurarAdmin(ADMIN, "Admin", "clave-tres", true);
    [u] = await sql()`SELECT debe_cambiar_clave, activo, intentos_fallidos, bloqueos_consecutivos, bloqueado_hasta
      FROM usuarios WHERE usuario = ${ADMIN}`;
    expect(u).toEqual({ debe_cambiar_clave: true, activo: true, intentos_fallidos: 0, bloqueos_consecutivos: 0, bloqueado_hasta: null });
    const { token } = await crearSesion(await idDe(ADMIN), SIN_CONTEXTO);
    await asegurarAdmin(ADMIN, "Admin", "clave-cuatro", true);
    expect(await validarSesion(token)).toBeNull(); // restablecer cierra sesiones
  });

  it("sin forzarClave no toca rol, estado ni segundo factor", async () => {
    const id = await idDe(ADMIN);
    await sql()`UPDATE usuarios SET rol = 'consulta', activo = false, totp_activo = true,
      totp_secreto_cifrado = 'secreto-de-prueba' WHERE id = ${id}`;
    expect(await asegurarAdmin(ADMIN, "Admin", "otra-clave")).toBe("existente");
    const [u] = await sql()`SELECT rol, activo, totp_activo, totp_secreto_cifrado FROM usuarios WHERE id = ${id}`;
    expect(u).toEqual({ rol: "consulta", activo: false, totp_activo: true, totp_secreto_cifrado: "secreto-de-prueba" });
  });

  it("el rescate repone el rol, quita el segundo factor, cierra sesiones y deja fila en accesos", async () => {
    const id = await idDe(ADMIN);
    await sql()`UPDATE usuarios SET rol = 'consulta', activo = false, totp_activo = true,
      totp_secreto_cifrado = 'secreto-de-prueba' WHERE id = ${id}`;
    await sql()`INSERT INTO codigos_recuperacion (usuario_id, hash) VALUES (${id}, ${`hash-${ts}`})`;
    const { token } = await crearSesion(id, SIN_CONTEXTO);
    expect(await asegurarAdmin(ADMIN, "Admin", "clave-rescate", true)).toBe("clave_actualizada");

    const [u] = await sql()`SELECT rol, activo, totp_activo, totp_secreto_cifrado, debe_cambiar_clave
      FROM usuarios WHERE id = ${id}`;
    expect(u).toEqual({ rol: "admin_sgc", activo: true, totp_activo: false, totp_secreto_cifrado: null, debe_cambiar_clave: true });
    expect(await sql()`SELECT 1 FROM codigos_recuperacion WHERE usuario_id = ${id}`).toHaveLength(0);
    expect(await validarSesion(token)).toBeNull();
    const [acc] = await sql()`SELECT usuario_texto, resultado, ip, user_agent FROM accesos
      WHERE usuario_id = ${id} ORDER BY id DESC LIMIT 1`;
    expect(acc).toEqual({ usuario_texto: ADMIN, resultado: "restablecimiento", ip: null, user_agent: null });
  });

  it("busca sin distinguir mayúsculas y crea el usuario en minúsculas", async () => {
    const mixto = `ZZ_Sesion_Mayus_${ts}`;
    expect(await asegurarAdmin(mixto, "Admin", "clave-uno")).toBe("creado");
    const filas = await sql()`SELECT usuario FROM usuarios WHERE lower(usuario) = lower(${mixto})`;
    expect(filas.map((f) => f.usuario)).toEqual([mixto.toLowerCase()]);
    expect(await asegurarAdmin(mixto.toUpperCase(), "Admin", "clave-dos")).toBe("existente");
    expect(await asegurarAdmin(mixto.toUpperCase(), "Admin", "clave-tres", true)).toBe("clave_actualizada");
    const [acc] = await sql()`SELECT usuario_texto FROM accesos
      WHERE usuario_id = ${await idDe(mixto.toLowerCase())} ORDER BY id DESC LIMIT 1`;
    expect(acc.usuario_texto).toBe(mixto.toLowerCase());
  });
});
