/**
 * Configuración documental del panel: formato del código, plazos, publicación directa y lista de
 * verificación. Las funciones públicas abren su propia transacción (decisión P2); los tests usan sus
 * versiones `…En` dentro de una transacción que se revierte, y solo uno prueba el envoltorio, con
 * restauración en `finally`. El actor de ese uno es único por corrida.
 */
import { existsSync } from "node:fs";
import type { TransactionSql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import { obtenerSql } from "@/db/cliente";
import { asegurarAdmin } from "@/db/consultas/admin";
import {
  alternarItemVerificacionEn,
  crearItemVerificacionEn,
  editarItemVerificacionEn,
  guardarConfigDocumental,
  guardarConfigDocumentalEn,
  moverItemVerificacionEn,
  obtenerConfigDocumental,
  type ConfigDocumental,
} from "@/db/consultas/config-documental";
import { listarItemsVerificacion } from "@/db/consultas/revision";
import { FORMATO_CODIGO_DEFECTO } from "@/lib/tramites/codigo";
import { sesionAdmin } from "./utiles/tramites";
import { revertida } from "./utiles/transaccion";

const sql = obtenerSql();
const USUARIO = `zz_config_${Date.now()}`;
let actorId: number;

beforeAll(async () => {
  await asegurarAdmin(USUARIO, "Admin Config", "x");
  [{ id: actorId }] = await sql`SELECT id FROM usuarios WHERE usuario = ${USUARIO}`;
});

afterAll(async () => {
  await sql.end();
  globalThis.__sql = undefined;
});

const aGuardar = (c: ConfigDocumental) => ({
  formatoCodigo: c.formatoCodigo ?? FORMATO_CODIGO_DEFECTO,
  plazos: c.plazos,
  escalamientoDias: c.escalamientoDias,
  publicacionDirecta: c.publicacionDirecta,
});

const ultimaAuditoria = async (tx: TransactionSql, actorId: number) => {
  const [a] = await tx`SELECT detalle FROM auditoria WHERE usuario_id = ${actorId} AND accion = 'editar_config_documental' ORDER BY id DESC LIMIT 1`;
  return a.detalle;
};

describe("guardarConfigDocumental", () => {
  it("guarda la configuración, valida y audita", () => revertida(sql, async (tx) => {
    const { usuarioId } = await sesionAdmin(tx);
    const antes = await obtenerConfigDocumental({ sql: tx });
    await guardarConfigDocumentalEn(tx, { ...aGuardar(antes), plazos: { ...antes.plazos, revision: 7 }, publicacionDirecta: false }, usuarioId);
    const despues = await obtenerConfigDocumental({ sql: tx });
    expect(despues.plazos.revision).toBe(7);
    expect(despues.publicacionDirecta).toBe(false);
    const detalle = await ultimaAuditoria(tx, usuarioId);
    expect(Object.keys(detalle.cambios).sort()).toEqual(["plazo_revision_dias", "publicacion_directa"]);
    expect(detalle.cambios.publicacion_directa).toEqual({ antes: antes.publicacionDirecta ? "1" : "0", despues: "0" });

    const rechaza = (cambio: Partial<ReturnType<typeof aGuardar>>, mensaje?: RegExp) =>
      expect(tx.savepoint(() => guardarConfigDocumentalEn(tx, { ...aGuardar(antes), ...cambio }, usuarioId))).rejects.toThrow(mensaje);
    await rechaza({ formatoCodigo: "{PROCESO}-{NN}" }, /TIPO/);
    await rechaza({ formatoCodigo: "{PROCESO}{TIPO}-{NN}" }, /Separe/);
    await rechaza({ escalamientoDias: 0 });
    await rechaza({ escalamientoDias: 61 });
    await rechaza({ plazos: { ...antes.plazos, ajustes: 366 } });
    await rechaza({ plazos: { ...antes.plazos, ajustes: 1.5 } });
    expect((await obtenerConfigDocumental({ sql: tx })).plazos.ajustes).toBe(antes.plazos.ajustes);
  }));

  it("guardar lo mismo no registra cambios", () => revertida(sql, async (tx) => {
    const { usuarioId } = await sesionAdmin(tx);
    await guardarConfigDocumentalEn(tx, aGuardar(await obtenerConfigDocumental({ sql: tx })), usuarioId);
    expect((await ultimaAuditoria(tx, usuarioId)).cambios).toEqual({});
  }));

  it("una clave ausente o inválida cae al valor por defecto", () => revertida(sql, async (tx) => {
    await tx`DELETE FROM configuracion WHERE clave = 'plazo_elaboracion_dias'`;
    await tx`UPDATE configuracion SET valor = 'abc' WHERE clave = 'plazo_revision_dias'`;
    const c = await obtenerConfigDocumental({ sql: tx });
    expect([c.plazos.elaboracion, c.plazos.revision]).toEqual([15, 5]);
  }));

  it("el envoltorio público abre su transacción y confirma; se restaura en finally", async () => {
    const antes = await obtenerConfigDocumental();
    try {
      await guardarConfigDocumental({ ...aGuardar(antes), plazos: { ...antes.plazos, revision: 8 } }, actorId);
      expect((await obtenerConfigDocumental()).plazos.revision).toBe(8);
    } finally {
      await guardarConfigDocumental(aGuardar(antes), actorId);
    }
    expect((await obtenerConfigDocumental()).plazos.revision).toBe(antes.plazos.revision);
  });
});

describe("lista de verificación", () => {
  it("los ítems se crean, se ordenan y se desactivan, nunca se borran", () => revertida(sql, async (tx) => {
    const { usuarioId } = await sesionAdmin(tx);
    const id = await crearItemVerificacionEn(tx, { texto: "Ítem de prueba de la configuración", critico: true }, usuarioId);
    const orden = async () => (await listarItemsVerificacion({ sql: tx })).map((i) => i.id);
    expect((await orden()).at(-1)).toBe(id);
    await moverItemVerificacionEn(tx, id, "arriba", usuarioId);
    expect((await orden()).at(-2)).toBe(id);
    await moverItemVerificacionEn(tx, id, "abajo", usuarioId);
    expect((await orden()).at(-1)).toBe(id);
    await moverItemVerificacionEn(tx, id, "abajo", usuarioId); // ya es el último: no cambia nada
    expect((await orden()).at(-1)).toBe(id);

    await editarItemVerificacionEn(tx, id, { texto: "Ítem de prueba editado", critico: false }, usuarioId);
    await alternarItemVerificacionEn(tx, id, false, usuarioId);
    const todos = await listarItemsVerificacion({ sql: tx });
    expect(todos.find((i) => i.id === id)).toMatchObject({ activo: false, critico: false, texto: "Ítem de prueba editado" });
    expect((await listarItemsVerificacion({ sql: tx, soloActivos: true })).some((i) => i.id === id)).toBe(false);

    const acciones = await tx`SELECT accion FROM auditoria WHERE usuario_id = ${usuarioId} AND entidad = 'lista_verificacion_items' AND entidad_id = ${id}`;
    expect(acciones.map((a) => a.accion).sort()).toEqual([
      "alternar_item_verificacion",
      "crear_item_verificacion",
      "editar_item_verificacion",
      "mover_item_verificacion",
      "mover_item_verificacion",
    ]);
  }));

  it("el texto debe tener de 5 a 300 caracteres y el ítem debe existir", () => revertida(sql, async (tx) => {
    const { usuarioId } = await sesionAdmin(tx);
    const falla = (fn: () => Promise<unknown>, mensaje: RegExp) => expect(tx.savepoint(fn)).rejects.toThrow(mensaje);
    await falla(() => crearItemVerificacionEn(tx, { texto: "abc", critico: false }, usuarioId), /entre 5 y 300/);
    await falla(() => crearItemVerificacionEn(tx, { texto: "x".repeat(301), critico: false }, usuarioId), /entre 5 y 300/);
    await falla(() => alternarItemVerificacionEn(tx, 999999999, false, usuarioId), /no existe/);
    await falla(() => moverItemVerificacionEn(tx, 999999999, "arriba", usuarioId), /no existe/);
  }));
});
