/**
 * Núcleo del ingreso y del factor contra la BD de desarrollo. Los usuarios
 * escriben en `accesos`/`auditoria`: nombre único por corrida, sin borrar.
 */
import { existsSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import { obtenerSql } from "@/db/cliente";
import { asegurarAdmin } from "@/db/consultas/admin";
import { activarTotp, guardarEstadoBloqueo, guardarSecretoTotpPendiente } from "@/db/consultas/autenticacion";
import { SIN_BLOQUEO } from "@/lib/bloqueo";
import { cifrar } from "@/lib/cifrado";
import { MENSAJE_CREDENCIALES, intentarFactor, intentarIngreso } from "@/lib/ingreso";
import { validarSesion } from "@/lib/sesion";
import { generarCodigoTotp, generarCodigosRecuperacion, generarSecretoTotp, hashCodigoRecuperacion } from "@/lib/totp";

const sql = () => obtenerSql();
const CLAVE = "Clave-de-prueba-larga-2026";
const ctx = { ip: null, userAgent: "vitest" };
const sufijo = Date.now();
const nombre = (p: string) => `zz_${p}_${sufijo}`;

async function crearUsuario(n: string) {
  await asegurarAdmin(n, "Prueba", CLAVE);
  const [u] = await sql()`SELECT id FROM usuarios WHERE usuario = ${n}`;
  return Number(u.id);
}
async function estado(id: number) {
  const [u] = await sql()`SELECT intentos_fallidos, bloqueos_consecutivos, bloqueado_hasta FROM usuarios WHERE id = ${id}`;
  return u;
}
async function accesos(id: number) {
  const f = await sql()`SELECT resultado FROM accesos WHERE usuario_id = ${id} ORDER BY id`;
  return f.map((x) => x.resultado as string);
}

afterAll(async () => {
  await sql().end();
});

describe("intentarIngreso", () => {
  const n = nombre("par");
  let id: number;
  beforeAll(async () => {
    id = await crearUsuario(n);
  });

  it("10 claves erróneas en paralelo se cuentan en serie (no 1)", async () => {
    const r = await Promise.all(
      Array.from({ length: 10 }, () => intentarIngreso({ usuario: n, clave: "mala", ...ctx })),
    );
    expect(r.every((x) => x.tipo === "error")).toBe(true);
    const e = await estado(id);
    // 5 fallos bloquean (bloqueo 1); los otros 5 llegan con la cuenta bloqueada y no suman.
    expect(e.bloqueos_consecutivos).toBe(1);
    expect(e.bloqueado_hasta).not.toBeNull();
    const a = await accesos(id);
    expect(a).toHaveLength(10);
    expect(a.filter((x) => x === "bloqueo")).toHaveLength(1);
    expect(a.filter((x) => x === "fallo")).toHaveLength(9);
  });

  it("R19: bloqueada, la clave correcta recibe el mismo mensaje que la incorrecta y que un inexistente; el estado no cambia", async () => {
    const antes = await estado(id);
    const correcta = await intentarIngreso({ usuario: n, clave: CLAVE, ...ctx });
    const mala = await intentarIngreso({ usuario: n, clave: "otra", ...ctx });
    const nadie = await intentarIngreso({ usuario: `zz_nadie_${sufijo}`, clave: "x", ...ctx });
    expect(correcta).toEqual({ tipo: "error", mensaje: MENSAJE_CREDENCIALES });
    expect(mala).toEqual(correcta);
    expect(nadie).toEqual(correcta);
    expect(await estado(id)).toEqual(antes);
  });

  it("libre, la clave correcta crea sesión y reinicia contadores", async () => {
    await guardarEstadoBloqueo(id, { intentosFallidos: 3, bloqueosConsecutivos: 2, bloqueadoHasta: null });
    const r = await intentarIngreso({ usuario: n.toUpperCase(), clave: CLAVE, ...ctx });
    expect(r).toMatchObject({ tipo: "sesion", factorPendiente: false });
    expect((await estado(id)).intentos_fallidos).toBe(0);
    expect((await estado(id)).bloqueos_consecutivos).toBe(0);
    expect((await accesos(id)).at(-1)).toBe("ingreso");
    if (r.tipo === "sesion") expect((await validarSesion(r.token))?.usuarioId).toBe(id);
  });
});

describe("segundo factor", () => {
  const n = nombre("fac");
  let id: number;
  const secreto = generarSecretoTotp();
  const codigos = generarCodigosRecuperacion();

  beforeAll(async () => {
    id = await crearUsuario(n);
    await guardarSecretoTotpPendiente(id, cifrar(secreto));
    await activarTotp(id, codigos.map(hashCodigoRecuperacion));
  });

  async function sesionPendiente() {
    const r = await intentarIngreso({ usuario: n, clave: CLAVE, ...ctx });
    if (r.tipo !== "sesion") throw new Error("se esperaba sesión");
    expect(r.factorPendiente).toBe(true);
    const s = await validarSesion(r.token);
    return { token: r.token, s: s! };
  }

  it("R20: la clave correcta con TOTP activo NO reinicia los contadores", async () => {
    await guardarEstadoBloqueo(id, { intentosFallidos: 3, bloqueosConsecutivos: 1, bloqueadoHasta: null });
    await sesionPendiente();
    const e = await estado(id);
    expect(e.intentos_fallidos).toBe(3);
    expect(e.bloqueos_consecutivos).toBe(1);
  });

  it("R24: cinco códigos malos bloquean la cuenta y el quinto cierra la sesión", async () => {
    await guardarEstadoBloqueo(id, SIN_BLOQUEO);
    const { token, s } = await sesionPendiente();
    for (let i = 0; i < 4; i++) {
      expect(await intentarFactor({ sesion: s, codigo: "000000", ...ctx })).toEqual({ tipo: "error", mensaje: "Código incorrecto" });
    }
    expect(await validarSesion(token)).not.toBeNull();
    expect(await intentarFactor({ sesion: s, codigo: "000000", ...ctx })).toEqual({ tipo: "cerrada" });
    expect(await validarSesion(token)).toBeNull();
    const e = await estado(id);
    expect(e.bloqueos_consecutivos).toBe(1);
    expect(e.bloqueado_hasta).not.toBeNull();
  });

  it("R20: con la cuenta bloqueada un código correcto devuelve cerrada sin confirmar", async () => {
    await guardarEstadoBloqueo(id, SIN_BLOQUEO);
    const { token, s } = await sesionPendiente();
    await guardarEstadoBloqueo(id, { intentosFallidos: 0, bloqueosConsecutivos: 1, bloqueadoHasta: new Date(Date.now() + 600_000) });
    const bueno = generarCodigoTotp(secreto, Date.now());
    expect(await intentarFactor({ sesion: s, codigo: bueno, ...ctx })).toEqual({ tipo: "cerrada" });
    expect(await validarSesion(token)).toBeNull();
  });

  it("código TOTP correcto en cuenta libre: ok, confirma y reinicia contadores", async () => {
    await guardarEstadoBloqueo(id, { intentosFallidos: 2, bloqueosConsecutivos: 1, bloqueadoHasta: null });
    const { token, s } = await sesionPendiente();
    const r = await intentarFactor({ sesion: s, codigo: generarCodigoTotp(secreto, Date.now()), ...ctx });
    expect(r).toEqual({ tipo: "ok" });
    expect((await validarSesion(token))?.factorPendiente).toBe(false);
    const e = await estado(id);
    expect([e.intentos_fallidos, e.bloqueos_consecutivos]).toEqual([0, 0]);
    expect((await accesos(id)).at(-1)).toBe("ingreso");
  });

  it("código de recuperación: sirve una vez", async () => {
    const a = await sesionPendiente();
    expect(await intentarFactor({ sesion: a.s, codigo: codigos[0], ...ctx })).toEqual({ tipo: "ok" });
    const b = await sesionPendiente();
    expect(await intentarFactor({ sesion: b.s, codigo: codigos[0], ...ctx })).toEqual({ tipo: "error", mensaje: "Código incorrecto" });
  });

  it("secreto ilegible: cuenta como fallo de factor, sin lanzar", async () => {
    await sql()`UPDATE usuarios SET totp_secreto_cifrado = 'basura' WHERE id = ${id}`;
    const { s } = await sesionPendiente();
    expect(await intentarFactor({ sesion: s, codigo: "123456", ...ctx })).toEqual({ tipo: "error", mensaje: "Código incorrecto" });
  });
});
