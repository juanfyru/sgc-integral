/**
 * Administración de usuarios contra la BD de desarrollo. Los usuarios con
 * historia (accesos/auditoría) no se borran: todos llevan nombre único por corrida.
 */
import { existsSync, readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import { asegurarAdmin } from "@/db/consultas/admin";
import {
  cambiarActivo,
  contarAdminsActivos,
  crearUsuariosEnLote,
  crearUsuario,
  desbloquearUsuario,
  editarUsuario,
  exigirOtroAdminActivo,
  listarUsuarios,
  obtenerUsuario,
  quitarSegundoFactor,
  restablecerClave,
  type DatosUsuario,
} from "@/db/consultas/usuarios";
import { obtenerSql } from "@/db/cliente";
import { EsquemaUsuario, parsearUsuario, type DatosUsuarioFormulario } from "@/lib/esquemas/usuarios";
import { verificarClave } from "@/lib/clave";
import { generarClaveTemporal } from "@/lib/clave-politica";
import { crearSesion, validarSesion } from "@/lib/sesion";

// El tipo del formulario debe poder pasarse a las consultas.
const _comprobacion: DatosUsuario = {} as DatosUsuarioFormulario;
void _comprobacion;

const sql = () => obtenerSql();
const ts = Date.now();
const nombreU1 = `zz_u1_${ts}`;
const correoU1 = `zz_u1_${ts}@h.gov.co`;
let actorId: number;
let procesoId: number;
let procesoId2: number;
let u1: number;
const base: DatosUsuario = {
  usuario: `zz_base_${ts}`, nombre: "Persona de Prueba", correo: null, rol: "consulta",
  cargoId: null, jefeInmediatoId: null, procesoIds: [], verHistorial: false,
};
const claveLarga = "x".repeat(12);

beforeAll(async () => {
  await asegurarAdmin(`zz_admin_u_${ts}`, "Admin de prueba", "clave-de-prueba-1");
  const [a] = await sql()`SELECT id FROM usuarios WHERE usuario = ${`zz_admin_u_${ts}`}`;
  actorId = Number(a.id);
  const ps = await sql()`SELECT id FROM procesos WHERE activo ORDER BY id LIMIT 2`;
  procesoId = Number(ps[0].id);
  procesoId2 = Number(ps[1].id);
});

afterAll(async () => {
  // Con historia: se desactivan, no se borran.
  await sql()`UPDATE usuarios SET activo = false WHERE usuario LIKE ${`zz\\_%\\_${ts}%`}`;
});

describe("crear", () => {
  it("deja clave temporal válida, cambio obligatorio, procesos y auditoría", async () => {
    const temporal = generarClaveTemporal();
    ({ id: u1 } = await crearUsuario(
      { ...base, usuario: nombreU1, correo: correoU1, rol: "lider_proceso", procesoIds: [procesoId] },
      temporal, actorId,
    ));
    const [u] = await sql()`SELECT hash_clave, debe_cambiar_clave, rol FROM usuarios WHERE id = ${u1}`;
    expect(await verificarClave(u.hash_clave, temporal)).toBe(true);
    expect(u.debe_cambiar_clave).toBe(true);
    expect((await sql()`SELECT proceso_id FROM usuario_procesos WHERE usuario_id = ${u1}`).map((f) => Number(f.proceso_id))).toEqual([procesoId]);
    const [a] = await sql()`SELECT detalle FROM auditoria WHERE accion = 'crear_usuario' AND entidad_id = ${u1}`;
    expect(a.detalle).toMatchObject({ usuario: nombreU1, rol: "lider_proceso" });
    expect(JSON.stringify(a.detalle)).not.toContain(temporal);
  });

  it("rechaza usuario y correo repetidos con mensajes propios", async () => {
    await expect(crearUsuario({ ...base, usuario: nombreU1 }, claveLarga, actorId)).rejects.toThrow(/nombre/);
    await expect(
      crearUsuario({ ...base, usuario: `zz_u2_${ts}`, correo: correoU1.toUpperCase() }, claveLarga, actorId),
    ).rejects.toThrow(/correo/);
  });

  it("deduplica procesoIds repetidos al crear y al editar", async () => {
    const { id } = await crearUsuario(
      { ...base, usuario: `zz_dup_${ts}`, rol: "lider_proceso", procesoIds: [procesoId, procesoId, procesoId2] },
      claveLarga, actorId,
    );
    const filas = await sql()`SELECT proceso_id FROM usuario_procesos WHERE usuario_id = ${id} ORDER BY proceso_id`;
    expect(filas.map((f) => Number(f.proceso_id))).toEqual([procesoId, procesoId2].sort((a, b) => a - b));
    await editarUsuario(id, { ...base, rol: "lider_proceso", procesoIds: [procesoId2, procesoId2] }, actorId);
    const tras = await sql()`SELECT proceso_id FROM usuario_procesos WHERE usuario_id = ${id}`;
    expect(tras.map((f) => Number(f.proceso_id))).toEqual([procesoId2]);
  });
});

describe("parsearUsuario", () => {
  it("acepta el campo id de ruta del formulario de edición", () => {
    const f = new FormData();
    f.set("id", "5");
    f.set("usuario", "persona.x");
    f.set("nombre", "Persona Equis");
    f.set("rol", "consulta");
    const d = parsearUsuario(f);
    expect(d.usuario).toBe("persona.x");
    expect(d.procesoIds).toEqual([]);
    expect(EsquemaUsuario).toBeDefined();
  });
  it("exige procesos para líder de proceso", () => {
    const f = new FormData();
    f.set("usuario", "persona.x");
    f.set("nombre", "Persona Equis");
    f.set("rol", "lider_proceso");
    expect(() => parsearUsuario(f)).toThrow(/proceso/i);
  });
});

describe("editar", () => {
  it("registra antes y después del rol", async () => {
    await editarUsuario(u1, { ...base, rol: "gerencia", procesoIds: [] }, actorId);
    const [a] = await sql()`SELECT detalle FROM auditoria WHERE accion = 'editar_usuario' AND entidad_id = ${u1} ORDER BY id DESC LIMIT 1`;
    expect(a.detalle).toMatchObject({ usuario: nombreU1, antes: { rol: "lider_proceso" }, despues: { rol: "gerencia" } });
    expect(a.detalle.antes).not.toHaveProperty("verHistorial");
  });

  it("autoprotección: el actor no se desactiva ni se degrada", async () => {
    await expect(cambiarActivo(actorId, false, actorId)).rejects.toThrow(/propia cuenta/);
    await expect(editarUsuario(actorId, { ...base, rol: "consulta" }, actorId)).rejects.toThrow(/administrador/);
  });
});

describe("estado de la cuenta", () => {
  it("desactivar cierra sesiones; restablecer da clave nueva, limpia bloqueo y cierra sesiones", async () => {
    const { token } = await crearSesion(u1, { ip: null, userAgent: null });
    await cambiarActivo(u1, false, actorId);
    expect(await validarSesion(token)).toBeNull();
    await cambiarActivo(u1, true, actorId);
    const { token: token2 } = await crearSesion(u1, { ip: null, userAgent: null });
    await sql()`UPDATE usuarios SET bloqueado_hasta = now() + interval '1 hour', bloqueos_consecutivos = 2 WHERE id = ${u1}`;
    const { claveTemporal } = await restablecerClave(u1, actorId);
    const [u] = await sql()`SELECT hash_clave, bloqueado_hasta, bloqueos_consecutivos, debe_cambiar_clave FROM usuarios WHERE id = ${u1}`;
    expect(await verificarClave(u.hash_clave, claveTemporal)).toBe(true);
    expect(u).toMatchObject({ bloqueado_hasta: null, bloqueos_consecutivos: 0, debe_cambiar_clave: true });
    expect(await validarSesion(token2)).toBeNull();
    const [acc] = await sql()`SELECT resultado, usuario_texto FROM accesos WHERE usuario_id = ${u1} ORDER BY id DESC LIMIT 1`;
    expect(acc).toMatchObject({ resultado: "restablecimiento", usuario_texto: nombreU1 });
    const [a] = await sql()`SELECT detalle FROM auditoria WHERE accion = 'restablecer_clave' AND entidad_id = ${u1}`;
    expect(JSON.stringify(a.detalle)).not.toContain(claveTemporal);
  });

  it("desbloquear limpia el bloqueo y registra acceso y auditoría", async () => {
    await sql()`UPDATE usuarios SET bloqueado_hasta = now() + interval '1 hour', intentos_fallidos = 3 WHERE id = ${u1}`;
    await desbloquearUsuario(u1, actorId);
    const [u] = await sql()`SELECT bloqueado_hasta, intentos_fallidos FROM usuarios WHERE id = ${u1}`;
    expect(u).toMatchObject({ bloqueado_hasta: null, intentos_fallidos: 0 });
    const [acc] = await sql()`SELECT resultado FROM accesos WHERE usuario_id = ${u1} ORDER BY id DESC LIMIT 1`;
    expect(acc.resultado).toBe("desbloqueo");
    expect((await sql()`SELECT 1 FROM auditoria WHERE accion = 'desbloquear_usuario' AND entidad_id = ${u1}`).length).toBe(1);
  });

  it("quitar segundo factor falla sin auditar si no está activo, y funciona si lo está", async () => {
    const contar = async () =>
      (await sql()`SELECT 1 FROM auditoria WHERE accion = 'quitar_segundo_factor' AND entidad_id = ${u1}`).length;
    const antes = await contar();
    await expect(quitarSegundoFactor(u1, actorId)).rejects.toThrow(/segundo factor activo/);
    expect(await contar()).toBe(antes);
    await sql()`UPDATE usuarios SET totp_activo = true, totp_secreto_cifrado = 'x' WHERE id = ${u1}`;
    await quitarSegundoFactor(u1, actorId);
    const [u] = await sql()`SELECT totp_activo FROM usuarios WHERE id = ${u1}`;
    expect(u.totp_activo).toBe(false);
    expect(await contar()).toBe(antes + 1);
  });
});

describe("siempre queda un Administrador del SGC activo (M10)", () => {
  const ULTIMO = "Debe quedar al menos un Administrador del SGC activo.";
  class Revertir extends Error {}
  let a: number;
  let b: number;
  beforeAll(async () => {
    ({ id: a } = await crearUsuario({ ...base, usuario: `zz_m10a_${ts}`, rol: "admin_sgc" }, claveLarga, actorId));
    ({ id: b } = await crearUsuario({ ...base, usuario: `zz_m10b_${ts}`, rol: "admin_sgc" }, claveLarga, actorId));
  });

  it("dos administradores que se bajan mutuamente: el segundo cambio se rechaza", async () => {
    await expect(
      obtenerSql().begin(async (tx) => {
        // Solo en esta transacción, que se revierte: los demás administradores dejan de contar.
        await tx`UPDATE usuarios SET activo = false WHERE rol = 'admin_sgc' AND activo AND id NOT IN (${a}, ${b})`;
        await exigirOtroAdminActivo(tx, b); // A le quita el rol a B: queda A
        await tx`UPDATE usuarios SET rol = 'consulta' WHERE id = ${b}`;
        await expect(exigirOtroAdminActivo(tx, a)).rejects.toThrow(ULTIMO); // B intenta lo mismo con A
        await exigirOtroAdminActivo(tx, b); // B ya no es admin activo: tocarlo no cambia la cuenta
        throw new Revertir();
      }),
    ).rejects.toBeInstanceOf(Revertir);
    const [fila] = await sql()`SELECT rol FROM usuarios WHERE id = ${b}`;
    expect(fila.rol).toBe("admin_sgc");
  });

  it("editarUsuario y cambiarActivo pasan por la regla antes de bloquear la fila del usuario", () => {
    const src = readFileSync("src/db/consultas/usuarios.ts", "utf8");
    for (const funcion of ["editarUsuario", "cambiarActivo"]) {
      const inicio = src.indexOf(`export async function ${funcion}(`);
      const cuerpo = src.slice(inicio, src.indexOf("\nexport ", inicio + 1));
      const regla = cuerpo.indexOf("exigirOtroAdminActivo(tx, id)");
      expect(regla, funcion).toBeGreaterThan(0);
      expect(regla, funcion).toBeLessThan(cuerpo.indexOf("WHERE id = ${id} FOR UPDATE"));
    }
  });

  it("con otro administrador activo, A y B se bajan mutuamente a la vez sin interbloqueo", async () => {
    await Promise.all([
      editarUsuario(b, { ...base, rol: "consulta" }, a),
      cambiarActivo(a, false, b),
    ]);
    const filas = await sql()`SELECT id, rol, activo FROM usuarios WHERE id IN (${a}, ${b}) ORDER BY id`;
    expect(filas.map((f) => [f.rol, f.activo])).toEqual([["admin_sgc", false], ["consulta", true]]);
  });
});

describe("el actor no se aplica estas acciones a sí mismo", () => {
  it("restablecer clave y quitar segundo factor propios fallan sin escribir ni auditar", async () => {
    const contar = async () =>
      (await sql()`SELECT 1 FROM auditoria WHERE entidad_id = ${actorId} AND accion IN ('restablecer_clave', 'quitar_segundo_factor')`).length;
    const [antes] = await sql()`SELECT hash_clave FROM usuarios WHERE id = ${actorId}`;
    const n = await contar();
    await expect(restablecerClave(actorId, actorId)).rejects.toThrow(/Mi cuenta/);
    await expect(quitarSegundoFactor(actorId, actorId)).rejects.toThrow(/Mi cuenta/);
    const [despues] = await sql()`SELECT hash_clave FROM usuarios WHERE id = ${actorId}`;
    expect(despues.hash_clave).toBe(antes.hash_clave);
    expect(await contar()).toBe(n);
  });
});

describe("consultas", () => {
  it("listar filtra por texto, rol y estado; contarAdminsActivos cuenta", async () => {
    expect((await listarUsuarios({ texto: nombreU1 })).map((f) => f.usuario)).toEqual([nombreU1]);
    expect((await listarUsuarios({ texto: nombreU1.toUpperCase() })).length).toBe(1);
    expect((await listarUsuarios({ rol: "gerencia" })).some((f) => f.usuario === nombreU1)).toBe(true);
    expect((await listarUsuarios({ rol: "gerencia", activo: false })).some((f) => f.usuario === nombreU1)).toBe(false);
    expect(await contarAdminsActivos()).toBeGreaterThanOrEqual(1);
  });

  it("listar trae el último ingreso", async () => {
    await sql()`INSERT INTO accesos (usuario_id, usuario_texto, resultado) VALUES (${u1}, ${nombreU1}, 'ingreso')`;
    const [f] = await listarUsuarios({ texto: nombreU1 });
    expect(f.ultimoIngreso).not.toBeNull();
  });

  it("obtenerUsuario devuelve el detalle o null", async () => {
    const d = await obtenerUsuario(u1);
    expect(d).toMatchObject({ id: u1, usuario: nombreU1, rol: "gerencia", activo: true, procesoIds: [] });
    expect(d?.sesionesActivas).toBe(0);
    expect(await obtenerUsuario(2_000_000_000)).toBeNull();
  });
});

describe("crearUsuariosEnLote", () => {
  it("crea las válidas, informa la repetida y audita sin claves", async () => {
    const mk = (usuario: string, linea: number) => ({ linea, datos: { ...base, usuario } });
    const a = `zz_lote_a_${ts}`;
    const b = `zz_lote_b_${ts}`;
    const r = await crearUsuariosEnLote([mk(a, 2), mk(b, 3), mk(a, 4)], actorId);
    expect(r.creados.map((c) => c.usuario)).toEqual([a, b]);
    expect(r.fallidos).toHaveLength(1);
    expect(r.fallidos[0]).toMatchObject({ linea: 4, usuario: a });
    expect(r.fallidos[0].error).toMatch(/nombre/);
    const [fila] = await sql()`SELECT detalle FROM auditoria WHERE accion = 'crear_usuarios_lote' AND usuario_id = ${actorId} ORDER BY id DESC LIMIT 1`;
    expect(fila.detalle).toMatchObject({ creados: 2, fallidos: 1, usuarios: [a, b] });
    for (const c of r.creados) expect(JSON.stringify(fila.detalle)).not.toContain(c.claveTemporal);
  });

  it("las filas rechazadas antes cuentan en fallidos, ordenadas por línea, y en la auditoría", async () => {
    const mk = (usuario: string, linea: number) => ({ linea, datos: { ...base, usuario } });
    const a = `zz_lote_c_${ts}`;
    const b = `zz_lote_d_${ts}`;
    const rechazada = { linea: 3, usuario: `zz_rechazada_${ts}`, error: "Rol no válido" };
    const r = await crearUsuariosEnLote([mk(a, 2), mk(b, 4), mk(a, 5)], actorId, [rechazada]);
    expect(r.creados.map((c) => c.usuario)).toEqual([a, b]);
    expect(r.fallidos.map((f) => f.linea)).toEqual([3, 5]);
    expect(r.fallidos[0]).toEqual(rechazada);
    const [fila] = await sql()`SELECT detalle FROM auditoria WHERE accion = 'crear_usuarios_lote' AND usuario_id = ${actorId} ORDER BY id DESC LIMIT 1`;
    expect(fila.detalle).toMatchObject({ creados: 2, fallidos: 2 });
  });
});
