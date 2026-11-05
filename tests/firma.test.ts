/**
 * Firma con reingreso de clave contra la BD de desarrollo. La verificación escribe en
 * `accesos` desde otra conexión, así que esos casos no van en una transacción revertida:
 * usuario único por corrida, sin borrar. Lo de `registrarFirma` sí se revierte.
 */
import { existsSync } from "node:fs";
import { afterAll, describe, expect, it, vi } from "vitest";
import type { TransactionSql } from "postgres";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import { obtenerSql } from "@/db/cliente";
import { obtenerAccesos } from "@/db/consultas/accesos";
import { registrarAcceso } from "@/db/consultas/autenticacion";
import { listarFirmas, registrarFirma } from "@/db/consultas/firmas";
import { cifrar } from "@/lib/cifrado";
import { hashearClave } from "@/lib/clave";
import { verificarParaFirmar, type ResultadoVerificacion } from "@/lib/firma";
import { comprobarCodigoFactor } from "@/lib/ingreso";
import { crearSesion, validarSesion } from "@/lib/sesion";
import { generarCodigoTotp, generarCodigosRecuperacion, generarSecretoTotp, hashCodigoRecuperacion } from "@/lib/totp";
import { revertida } from "./utiles/transaccion";

const sql = obtenerSql();
const CLAVE = "Clave-Firma-13A-ok";
const ctx = { ip: null, userAgent: "test-firma" };

async function usuarioConSesion(caso: string, opciones: { totp?: boolean } = {}) {
  const usuario = `zz_firma_${caso}_${Date.now()}`;
  const [u] = await sql`INSERT INTO usuarios (usuario, nombre, hash_clave, rol, acepto_datos_en)
    VALUES (${usuario}, ${`Prueba firma ${caso}`}, ${await hashearClave(CLAVE)}, 'consulta', now()) RETURNING id`;
  const id = Number(u.id);
  const secreto = generarSecretoTotp();
  const [recuperacion] = generarCodigosRecuperacion(1);
  if (opciones.totp) {
    await sql`UPDATE usuarios SET totp_activo = true, totp_secreto_cifrado = ${cifrar(secreto)} WHERE id = ${id}`;
    await sql`INSERT INTO codigos_recuperacion (usuario_id, hash) VALUES (${id}, ${hashCodigoRecuperacion(recuperacion)})`;
  }
  const { token } = await crearSesion(id, ctx);
  const sesion = (await validarSesion(token))!;
  return { sesion, id, token, secreto, recuperacion };
}

async function tramiteDePrueba(tx: TransactionSql, usuarioId: number): Promise<number> {
  const [t] = await tx`INSERT INTO tramites (numero, anio, consecutivo, tipo, motivo, justificacion, solicitante_id, proceso_id, etapa)
    SELECT 'SOL-9998-001', 9998, 1, 'crear', 'mejora', 'prueba de firma', ${usuarioId}, id, 'elaboracion' FROM procesos LIMIT 1 RETURNING id`;
  return Number(t.id);
}

afterAll(async () => {
  await sql.end();
});

describe("verificarParaFirmar", () => {
  it("clave correcta firma y reinicia el contador", async () => {
    const { sesion, id } = await usuarioConSesion("ok");
    await sql`UPDATE usuarios SET intentos_fallidos = 2 WHERE id = ${id}`;
    expect(await verificarParaFirmar(sesion, { clave: CLAVE }, ctx)).toEqual({ ok: true, metodo: "clave" });
    const [u] = await sql`SELECT intentos_fallidos FROM usuarios WHERE id = ${id}`;
    expect(u.intentos_fallidos).toBe(0);
  });

  it("clave errada no firma, suma al bloqueo y queda en accesos", async () => {
    const { sesion, id } = await usuarioConSesion("mala");
    const r = await verificarParaFirmar(sesion, { clave: "otra-clave-larga-1" }, ctx);
    expect(r).toEqual({ ok: false, mensaje: "Clave o código incorrectos", sesionCerrada: false });
    const [a] = await sql`SELECT resultado FROM accesos WHERE usuario_id = ${id} ORDER BY id DESC LIMIT 1`;
    expect(a.resultado).toBe("firma_fallo");
    const [u] = await sql`SELECT intentos_fallidos FROM usuarios WHERE id = ${id}`;
    expect(u.intentos_fallidos).toBe(1);
  });

  it("el quinto fallo bloquea la cuenta y cierra la sesión", async () => {
    const { sesion, id, token } = await usuarioConSesion("bloqueo");
    let r: ResultadoVerificacion = { ok: true, metodo: "clave" };
    for (let i = 0; i < 5; i++) r = await verificarParaFirmar(sesion, { clave: "otra-clave-larga-1" }, ctx);
    expect(r).toMatchObject({ ok: false, sesionCerrada: true });
    expect(await validarSesion(token)).toBeNull();
    const [a] = await sql`SELECT resultado FROM accesos WHERE usuario_id = ${id} ORDER BY id DESC LIMIT 1`;
    expect(a.resultado).toBe("bloqueo");
  });

  it("con la cuenta ya bloqueada no evalúa la clave correcta y cierra la sesión", async () => {
    const { sesion, id, token } = await usuarioConSesion("ya-bloqueada");
    await sql`UPDATE usuarios SET bloqueado_hasta = now() + interval '10 minutes' WHERE id = ${id}`;
    expect(await verificarParaFirmar(sesion, { clave: CLAVE }, ctx)).toMatchObject({ ok: false, sesionCerrada: true });
    expect(await validarSesion(token)).toBeNull();
  });

  it("con segundo factor exige el código, y una clave errada no gasta un código de recuperación", async () => {
    const { sesion, id, secreto, recuperacion } = await usuarioConSesion("totp", { totp: true });
    expect((await verificarParaFirmar(sesion, { clave: CLAVE }, ctx)).ok).toBe(false); // falta el código
    expect((await verificarParaFirmar(sesion, { clave: "otra-clave-larga-1", codigo: recuperacion }, ctx)).ok).toBe(false);
    expect(await verificarParaFirmar(sesion, { clave: CLAVE, codigo: recuperacion }, ctx)).toEqual({ ok: true, metodo: "clave_totp" });
    expect(await verificarParaFirmar(sesion, { clave: CLAVE, codigo: generarCodigoTotp(secreto, Date.now()) }, ctx)).toEqual({ ok: true, metodo: "clave_totp" });
    void id;
  });

  it("con la cuenta inactiva no evalúa la clave, cierra la sesión y deja firma_fallo", async () => {
    const { sesion, id } = await usuarioConSesion("inactiva");
    await sql`UPDATE usuarios SET activo = false WHERE id = ${id}`;
    const r = await verificarParaFirmar(sesion, { clave: CLAVE }, ctx);
    expect(r).toEqual({ ok: false, mensaje: "Clave o código incorrectos", sesionCerrada: true });
    const [s] = await sql`SELECT count(*)::int n FROM sesiones WHERE usuario_id = ${id}`;
    expect(s.n).toBe(0);
    const [a] = await sql`SELECT resultado FROM accesos WHERE usuario_id = ${id} ORDER BY id DESC LIMIT 1`;
    expect(a.resultado).toBe("firma_fallo");
    const [u] = await sql`SELECT intentos_fallidos FROM usuarios WHERE id = ${id}`;
    expect(u.intentos_fallidos).toBe(0);
  });

  it("si el usuario ya no existe, el intento queda en accesos sin usuario y no lanza", async () => {
    const usuario = `zz_firma_inexistente_${Date.now()}`;
    const sesion = { sesionId: "sesion-inexistente", usuarioId: -1, usuario };
    expect(await verificarParaFirmar(sesion, { clave: CLAVE }, ctx)).toMatchObject({ ok: false, sesionCerrada: true });
    const [a] = await sql`SELECT resultado, usuario_id FROM accesos WHERE usuario_texto = ${usuario}`;
    expect(a).toEqual({ resultado: "firma_fallo", usuario_id: null });
  });

  it("un código errado con la clave correcta también cuenta para el bloqueo", async () => {
    const { sesion, id } = await usuarioConSesion("codigo-malo", { totp: true });
    const r = await verificarParaFirmar(sesion, { clave: CLAVE, codigo: "000000" }, ctx);
    expect(r).toEqual({ ok: false, mensaje: "Clave o código incorrectos", sesionCerrada: false });
    const [u] = await sql`SELECT intentos_fallidos FROM usuarios WHERE id = ${id}`;
    expect(u.intentos_fallidos).toBe(1);
  });

  it("sin segundo factor un código de más se ignora y el método es solo la clave", async () => {
    const { sesion } = await usuarioConSesion("sin-factor");
    expect(await verificarParaFirmar(sesion, { clave: CLAVE, codigo: "123456" }, ctx)).toEqual({ ok: true, metodo: "clave" });
  });

  it("un código de recuperación no sirve dos veces", async () => {
    const { sesion, recuperacion } = await usuarioConSesion("recuperacion", { totp: true });
    expect((await verificarParaFirmar(sesion, { clave: CLAVE, codigo: recuperacion }, ctx)).ok).toBe(true);
    expect((await verificarParaFirmar(sesion, { clave: CLAVE, codigo: recuperacion }, ctx)).ok).toBe(false);
  });

  it("cinco fallos en paralelo se cuentan en serie bajo el candado de la cuenta", async () => {
    const { sesion, id } = await usuarioConSesion("paralelo");
    await Promise.all(Array.from({ length: 5 }, () => verificarParaFirmar(sesion, { clave: "otra-clave-larga-1" }, ctx)));
    const filas = await sql`SELECT resultado FROM accesos WHERE usuario_id = ${id} ORDER BY id`;
    expect(filas.map((f) => f.resultado)).toEqual(["firma_fallo", "firma_fallo", "firma_fallo", "firma_fallo", "bloqueo"]);
    const [u] = await sql`SELECT bloqueos_consecutivos FROM usuarios WHERE id = ${id}`;
    expect(u.bloqueos_consecutivos).toBe(1);
  });

  it("el filtro de Accesos separa las firmas fallidas", async () => {
    const { sesion, id } = await usuarioConSesion("filtro");
    await verificarParaFirmar(sesion, { clave: "otra-clave-larga-1" }, ctx);
    await registrarAcceso({ usuarioId: id, usuarioTexto: sesion.usuario, resultado: "fallo", ip: null, userAgent: null });
    const r = await obtenerAccesos({ usuario: sesion.usuario, resultado: "firma_fallo" });
    expect(r.filas.map((f) => f.resultado)).toEqual(["firma_fallo"]);
  });
});

describe("comprobarCodigoFactor", () => {
  it("acepta el código escrito con espacios o guiones, como el ingreso", async () => {
    const { id, secreto, recuperacion } = await usuarioConSesion("normaliza", { totp: true });
    const codigo = generarCodigoTotp(secreto, Date.now());
    expect(await comprobarCodigoFactor(id, `${codigo.slice(0, 3)} ${codigo.slice(3)}`)).toBe(true);
    expect(await comprobarCodigoFactor(id, ` ${recuperacion.toLowerCase()} `)).toBe(true);
    expect(await comprobarCodigoFactor(id, recuperacion)).toBe(false);
  });

  it("si el secreto no se puede descifrar responde false y registra solo el tipo de error", async () => {
    const { id } = await usuarioConSesion("secreto-roto", { totp: true });
    await sql`UPDATE usuarios SET totp_secreto_cifrado = 'no-es-un-secreto-cifrado' WHERE id = ${id}`;
    const registro = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      expect(await comprobarCodigoFactor(id, "123456")).toBe(false);
      expect(registro).toHaveBeenCalledTimes(1);
      expect(registro).toHaveBeenCalledWith("[factor] no se pudo descifrar el secreto TOTP:", expect.any(String));
    } finally {
      registro.mockRestore();
    }
  });
});

describe("registrarFirma", () => {
  it("registrarFirma copia nombre y cargo, y la fila no se puede cambiar", () => revertida(sql, async (tx) => {
    const [u] = await tx`SELECT u.id, u.nombre, c.nombre AS cargo FROM usuarios u LEFT JOIN cargos c ON c.id = u.cargo_id WHERE u.usuario = 'lider.gth'`;
    const [t] = await tx`INSERT INTO tramites (numero, anio, consecutivo, tipo, motivo, justificacion, solicitante_id, proceso_id, etapa)
      SELECT 'SOL-9998-001', 9998, 1, 'crear', 'mejora', 'prueba de firma', ${u.id}, id, 'elaboracion' FROM procesos LIMIT 1 RETURNING id`;
    await registrarFirma(tx, { tramiteId: t.id, versionId: null, usuarioId: u.id, firma: "elaboro", ronda: 1, hashSha256: "abc", metodo: "clave", contexto: ctx });
    const [f] = await listarFirmas(t.id, { sql: tx });
    expect(f).toMatchObject({ firma: "elaboro", nombre: u.nombre, cargo: u.cargo, hashSha256: "abc" });
    expect(await tx.savepoint((s) => s`UPDATE firmas SET hash_sha256 = 'x'`).then(() => null, (e) => e.code)).toBe("42501");
  }));

  it("con ahora fijo, listarFirmas devuelve ese creadoEn", () => revertida(sql, async (tx) => {
    const [u] = await tx`SELECT id FROM usuarios WHERE usuario = 'lider.gth'`;
    const tramiteId = await tramiteDePrueba(tx, u.id);
    const ahora = new Date("2026-03-04T05:06:07.000Z");
    await registrarFirma(tx, { tramiteId, versionId: null, usuarioId: u.id, firma: "elaboro", ronda: 1, hashSha256: "abc", metodo: "clave", contexto: ctx, ahora });
    const [f] = await listarFirmas(tramiteId, { sql: tx });
    expect(f.creadoEn).toEqual(ahora);
  }));

  it("el nombre y el cargo quedan como estaban al firmar, y un firmante sin cargo guarda null", () => revertida(sql, async (tx) => {
    const [u] = await tx`SELECT id, nombre FROM usuarios WHERE usuario = 'lider.gth'`;
    const [sinCargo] = await tx`INSERT INTO usuarios (usuario, nombre, hash_clave, rol) VALUES ('zz_firma_sin_cargo', 'Sin cargo', 'h', 'consulta') RETURNING id`;
    const tramiteId = await tramiteDePrueba(tx, u.id);
    const base = { tramiteId, versionId: null, ronda: 1, hashSha256: "abc", metodo: "clave", contexto: ctx } as const;
    await registrarFirma(tx, { ...base, usuarioId: u.id, firma: "elaboro" });
    await registrarFirma(tx, { ...base, usuarioId: sinCargo.id, firma: "reviso" });
    await tx`UPDATE usuarios SET nombre = 'Nombre posterior', cargo_id = NULL WHERE id = ${u.id}`;
    const [primera, segunda] = await listarFirmas(tramiteId, { sql: tx });
    expect(primera.nombre).toBe(u.nombre);
    expect(primera.cargo).not.toBeNull();
    expect(segunda).toMatchObject({ nombre: "Sin cargo", cargo: null });
  }));

  it("guarda el contexto y lista por orden de creación aunque compartan la hora (firma doble)", () => revertida(sql, async (tx) => {
    const [u] = await tx`SELECT id FROM usuarios WHERE usuario = 'lider.gth'`;
    const tramiteId = await tramiteDePrueba(tx, u.id);
    const ahora = new Date("2026-03-04T05:06:07.000Z");
    const base = { tramiteId, versionId: null, usuarioId: u.id, ronda: 2, hashSha256: "abc", metodo: "clave_totp", ahora } as const;
    const id = await registrarFirma(tx, { ...base, firma: "aprobo", contexto: { ip: "10.1.2.3", userAgent: "navegador" } });
    await registrarFirma(tx, { ...base, firma: "publico", contexto: ctx });
    expect((await listarFirmas(tramiteId, { sql: tx })).map((f) => [f.firma, f.ronda, f.metodo, f.usuarioId])).toEqual([
      ["aprobo", 2, "clave_totp", u.id],
      ["publico", 2, "clave_totp", u.id],
    ]);
    const [fila] = await tx`SELECT host(ip) AS ip, user_agent FROM firmas WHERE id = ${id}`;
    expect(fila).toEqual({ ip: "10.1.2.3", user_agent: "navegador" });
  }));
});
