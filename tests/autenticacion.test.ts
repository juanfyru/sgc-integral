/**
 * Capa de datos de autenticación contra la BD de desarrollo. El usuario de
 * prueba escribe en `accesos` y `auditoria` (solo inserción, ON DELETE
 * RESTRICT): nombre único por corrida y NO se borra al final.
 */
import { existsSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import { obtenerSql } from "@/db/cliente";
import { asegurarAdmin } from "@/db/consultas/admin";
import {
  aceptarAvisoDatos,
  activarTotp,
  buscarParaIngreso,
  cambiarClaveDeUsuario,
  consumirCodigoRecuperacion,
  desactivarTotp,
  guardarEstadoBloqueo,
  guardarSecretoTotpPendiente,
  obtenerSecretoTotp,
  registrarAcceso,
} from "@/db/consultas/autenticacion";
import { SIN_BLOQUEO } from "@/lib/bloqueo";
import { hashearClave } from "@/lib/clave";
import { crearSesion, validarSesion } from "@/lib/sesion";
import { generarCodigosRecuperacion, hashCodigoRecuperacion } from "@/lib/totp";

const sql = () => obtenerSql();
const NOMBRE = `zz_auth_${Date.now()}`;
let usuarioId: number;

beforeAll(async () => {
  await asegurarAdmin(NOMBRE, "Prueba autenticación", "clave-inicial-larga-1");
  const [u] = await sql()`SELECT id FROM usuarios WHERE usuario = ${NOMBRE}`;
  usuarioId = Number(u.id);
});

afterAll(async () => {
  await sql()`UPDATE usuarios SET activo = false WHERE id = ${usuarioId}`;
  await sql().end();
});

describe("ingreso y bloqueo", () => {
  it("buscarParaIngreso ignora mayúsculas y trae el estado de bloqueo", async () => {
    const u = await buscarParaIngreso(NOMBRE.toUpperCase());
    expect(u).toMatchObject({ usuario: NOMBRE, rol: "admin_sgc", intentosFallidos: 0, bloqueadoHasta: null });
    expect(typeof u?.id).toBe("number");
    expect(await buscarParaIngreso("nadie_existe_xyz")).toBeNull();
  });
  it("guardarEstadoBloqueo persiste y se refleja", async () => {
    const hasta = new Date(Date.now() + 60_000);
    await guardarEstadoBloqueo(usuarioId, { intentosFallidos: 0, bloqueosConsecutivos: 1, bloqueadoHasta: hasta });
    const u = await buscarParaIngreso(NOMBRE);
    expect(u?.bloqueosConsecutivos).toBe(1);
    expect(u?.bloqueadoHasta?.getTime()).toBe(hasta.getTime());
    await guardarEstadoBloqueo(usuarioId, SIN_BLOQUEO);
  });
  it("registrarAcceso escribe usuario tecleado, IP y resultado", async () => {
    await registrarAcceso({ usuarioId, usuarioTexto: NOMBRE, resultado: "fallo", ip: "10.1.1.1", userAgent: "vitest" });
    const [a] = await sql()`SELECT resultado, host(ip) AS ip FROM accesos WHERE usuario_id = ${usuarioId} ORDER BY id DESC LIMIT 1`;
    expect(a).toEqual({ resultado: "fallo", ip: "10.1.1.1" });
  });
  it("registrarAcceso admite usuario inexistente (usuarioId null) e IP nula", async () => {
    await registrarAcceso({ usuarioId: null, usuarioTexto: "nadie", resultado: "fallo", ip: null, userAgent: null });
    const [a] = await sql()`SELECT usuario_id, ip FROM accesos WHERE usuario_texto = 'nadie' ORDER BY id DESC LIMIT 1`;
    expect(a).toEqual({ usuario_id: null, ip: null });
  });
});

describe("clave, aviso y segundo factor", () => {
  it("cambiarClaveDeUsuario limpia debe_cambiar_clave y cierra las otras sesiones", async () => {
    const a = await crearSesion(usuarioId, { ip: null, userAgent: null });
    const b = await crearSesion(usuarioId, { ip: null, userAgent: null });
    const sa = await validarSesion(a.token);
    await cambiarClaveDeUsuario(usuarioId, await hashearClave("Nueva-clave-larga-2026"), sa!.sesionId);
    const [u] = await sql()`SELECT debe_cambiar_clave FROM usuarios WHERE id = ${usuarioId}`;
    expect(u.debe_cambiar_clave).toBe(false);
    expect(await validarSesion(a.token)).not.toBeNull();
    expect(await validarSesion(b.token)).toBeNull();
    const [aud] = await sql()`SELECT 1 FROM auditoria WHERE accion = 'cambiar_clave' AND usuario_id = ${usuarioId}`;
    expect(aud).toBeTruthy();
  });
  it("aceptarAvisoDatos deja fecha y auditoría", async () => {
    await aceptarAvisoDatos(usuarioId);
    const [u] = await sql()`SELECT acepto_datos_en FROM usuarios WHERE id = ${usuarioId}`;
    expect(u.acepto_datos_en).not.toBeNull();
    const [aud] = await sql()`SELECT 1 FROM auditoria WHERE accion = 'aceptar_aviso_datos' AND usuario_id = ${usuarioId}`;
    expect(aud).toBeTruthy();
  });
  it("activar TOTP guarda códigos hasheados de un solo uso; desactivar los borra", async () => {
    await guardarSecretoTotpPendiente(usuarioId, "cifrado-falso");
    expect((await obtenerSecretoTotp(usuarioId)).activo).toBe(false);
    const codigos = generarCodigosRecuperacion();
    await activarTotp(usuarioId, codigos.map(hashCodigoRecuperacion));
    expect((await obtenerSecretoTotp(usuarioId)).activo).toBe(true);
    expect(await consumirCodigoRecuperacion(usuarioId, hashCodigoRecuperacion(codigos[0]))).toBe(true);
    expect(await consumirCodigoRecuperacion(usuarioId, hashCodigoRecuperacion(codigos[0]))).toBe(false);
    await desactivarTotp(usuarioId, usuarioId);
    const filas = await sql()`SELECT 1 FROM codigos_recuperacion WHERE usuario_id = ${usuarioId}`;
    expect(filas).toHaveLength(0);
    expect(await obtenerSecretoTotp(usuarioId)).toEqual({ secretoCifrado: null, activo: false });
    const [aud] = await sql()`SELECT 1 FROM auditoria WHERE accion = 'quitar_segundo_factor' AND usuario_id = ${usuarioId}`;
    expect(aud).toBeTruthy();
  });

  it("desactivarTotp guarda el usuario afectado solo si lo quita otra persona", async () => {
    const propio = await sql()`SELECT detalle FROM auditoria WHERE accion = 'quitar_segundo_factor' AND usuario_id = ${usuarioId} ORDER BY id DESC LIMIT 1`;
    expect(propio[0].detalle?.usuario).toBeUndefined();
    const [u] = await sql()`SELECT usuario FROM usuarios WHERE id = ${usuarioId}`;
    const nombreActor = `zz_auth_actor_${Date.now()}`;
    await asegurarAdmin(nombreActor, "Actor de prueba", "clave-inicial-larga-1");
    const [actor] = await sql()`SELECT id FROM usuarios WHERE usuario = ${nombreActor}`;
    const actorId = Number(actor.id);
    await desactivarTotp(usuarioId, actorId);
    await sql()`UPDATE usuarios SET activo = false WHERE id = ${actorId}`;
    const [aud] = await sql()`SELECT detalle FROM auditoria WHERE accion = 'quitar_segundo_factor' AND usuario_id = ${actorId} ORDER BY id DESC LIMIT 1`;
    expect(aud.detalle).toEqual({ usuario: u.usuario });
  });
});
