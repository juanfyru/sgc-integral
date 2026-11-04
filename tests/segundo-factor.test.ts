/**
 * Núcleo de activación/desactivación del segundo factor contra la BD de
 * desarrollo. Escribe en `auditoria`: usuario único por corrida, no se borra.
 */
import { existsSync } from "node:fs";
import { beforeAll, afterAll, describe, expect, it } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import { obtenerSql } from "@/db/cliente";
import { guardarSecretoTotpPendiente, obtenerSecretoTotp } from "@/db/consultas/autenticacion";
import { hashearClave } from "@/lib/clave";
import { cifrar, descifrar } from "@/lib/cifrado";
import { inscripcionBloqueada } from "@/lib/cuenta-estado";
import { confirmarSegundoFactor, quitarSegundoFactor } from "@/lib/segundo-factor";
import { EsquemaConfirmarTotp } from "@/lib/esquemas/cuenta";
import { generarCodigoTotp, generarSecretoTotp } from "@/lib/totp";

const sql = () => obtenerSql();
const NOMBRE = `zz_factor_${Date.now()}`;
const CLAVE = "Clave-De-Prueba-4321";
let usuarioId: number;

const filasAuditoria = async (accion: string) =>
  Number((await sql()`SELECT count(*)::int n FROM auditoria WHERE usuario_id = ${usuarioId} AND accion = ${accion}`)[0].n);

beforeAll(async () => {
  const [u] = await sql()`INSERT INTO usuarios (usuario, nombre, hash_clave, rol)
    VALUES (${NOMBRE}, 'Prueba factor', ${await hashearClave(CLAVE)}, 'consulta') RETURNING id`;
  usuarioId = Number(u.id);
});

afterAll(async () => {
  await sql()`UPDATE usuarios SET activo = false WHERE id = ${usuarioId}`;
  await sql().end();
});

describe("EsquemaConfirmarTotp", () => {
  it("acepta código de 6 dígitos con clave y rechaza el resto", () => {
    expect(EsquemaConfirmarTotp.safeParse({ codigo: "123456", clave: "x" }).success).toBe(true);
    expect(EsquemaConfirmarTotp.safeParse({ codigo: "12345", clave: "x" }).success).toBe(false);
    expect(EsquemaConfirmarTotp.safeParse({ codigo: "ABCDE-FGHIJ", clave: "x" }).success).toBe(false);
    expect(EsquemaConfirmarTotp.safeParse({ codigo: "123456" }).success).toBe(false);
  });
});

describe("decisión de inscripción", () => {
  it("solo clave y aviso bloquean; el TOTP obligatorio permite inscribirse", () => {
    expect(inscripcionBloqueada("clave")).toBe(true);
    expect(inscripcionBloqueada("aviso")).toBe(true);
    expect(inscripcionBloqueada("totp_obligatorio")).toBe(false);
    expect(inscripcionBloqueada(null)).toBe(false);
  });
});

describe("confirmarSegundoFactor (R30)", () => {
  it("con clave incorrecta no activa, aunque el código sea bueno", async () => {
    const secreto = generarSecretoTotp();
    await guardarSecretoTotpPendiente(usuarioId, cifrar(secreto));
    const r = await confirmarSegundoFactor({
      usuarioId, clave: "otra-clave-cualquiera", codigo: generarCodigoTotp(secreto, Date.now()),
    });
    expect(r).toEqual({ ok: false, error: "Clave incorrecta" });
    expect((await obtenerSecretoTotp(usuarioId)).activo).toBe(false);
  });

  it("con clave correcta y código errado no activa", async () => {
    const r = await confirmarSegundoFactor({ usuarioId, clave: CLAVE, codigo: "000000" });
    expect(r).toEqual({ ok: false, error: "Código incorrecto" });
    expect((await obtenerSecretoTotp(usuarioId)).activo).toBe(false);
  });

  it("con clave y código correctos activa y entrega 8 códigos", async () => {
    const { secretoCifrado } = await obtenerSecretoTotp(usuarioId);
    const codigo = generarCodigoTotp(descifrar(secretoCifrado!), Date.now());
    const r = await confirmarSegundoFactor({ usuarioId, clave: CLAVE, codigo });
    expect(r).toMatchObject({ ok: true });
    expect(r && r.ok === true && r.codigos).toHaveLength(8);
    expect((await obtenerSecretoTotp(usuarioId)).activo).toBe(true);
  });

  it("activarlo otra vez da error y no regenera códigos", async () => {
    const r = await confirmarSegundoFactor({ usuarioId, clave: CLAVE, codigo: "123456" });
    expect(r).toEqual({ ok: false, error: "El segundo factor ya está activo." });
  });
});

describe("quitarSegundoFactor (R29, R31)", () => {
  it("un rol con TOTP obligatorio no puede quitarlo y no se audita", async () => {
    const previo = process.env.EXIGIR_2FA_ROLES;
    process.env.EXIGIR_2FA_ROLES = "consulta";
    try {
      const antes = await filasAuditoria("quitar_segundo_factor");
      const r = await quitarSegundoFactor({ usuarioId, rol: "consulta", clave: CLAVE });
      expect(r).toEqual({ ok: false, error: "Su rol exige segundo factor; no puede desactivarlo." });
      expect(await filasAuditoria("quitar_segundo_factor")).toBe(antes);
      expect((await obtenerSecretoTotp(usuarioId)).activo).toBe(true);
    } finally {
      if (previo === undefined) delete process.env.EXIGIR_2FA_ROLES;
      else process.env.EXIGIR_2FA_ROLES = previo;
    }
  });

  it("con factor activo y clave correcta lo quita y audita una vez", async () => {
    const antes = await filasAuditoria("quitar_segundo_factor");
    const r = await quitarSegundoFactor({ usuarioId, rol: "consulta", clave: CLAVE });
    expect(r).toBeNull();
    expect(await filasAuditoria("quitar_segundo_factor")).toBe(antes + 1);
  });

  it("sin factor activo devuelve error y no audita ni borra el secreto pendiente", async () => {
    const pendiente = cifrar(generarSecretoTotp());
    await guardarSecretoTotpPendiente(usuarioId, pendiente);
    const antes = await filasAuditoria("quitar_segundo_factor");
    const r = await quitarSegundoFactor({ usuarioId, rol: "consulta", clave: CLAVE });
    expect(r).toEqual({ ok: false, error: "El segundo factor no está activo." });
    expect(await filasAuditoria("quitar_segundo_factor")).toBe(antes);
    expect((await obtenerSecretoTotp(usuarioId)).secretoCifrado).toBe(pendiente);
  });
});
