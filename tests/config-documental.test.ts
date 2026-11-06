/**
 * Configuración documental del panel: formato del código, plazos, publicación directa y lista de
 * verificación. Las funciones abren su propia transacción (decisión P2), así que lo que cambian se
 * confirma en la BD dev y cada test lo restaura en `finally`. El actor es único por corrida.
 */
import { existsSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import { obtenerSql } from "@/db/cliente";
import { asegurarAdmin } from "@/db/consultas/admin";
import {
  alternarItemVerificacion,
  crearItemVerificacion,
  editarItemVerificacion,
  guardarConfigDocumental,
  moverItemVerificacion,
  obtenerConfigDocumental,
  type ConfigDocumental,
} from "@/db/consultas/config-documental";
import { listarItemsVerificacion } from "@/db/consultas/revision";
import { FORMATO_CODIGO_DEFECTO } from "@/lib/tramites/codigo";
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

const ultimaAuditoria = async () => {
  const [a] = await sql`SELECT detalle FROM auditoria WHERE usuario_id = ${actorId} AND accion = 'editar_config_documental' ORDER BY id DESC LIMIT 1`;
  return a.detalle;
};

describe("guardarConfigDocumental", () => {
  it("guarda la configuración, valida y audita", async () => {
    const antes = await obtenerConfigDocumental();
    try {
      await guardarConfigDocumental({ ...aGuardar(antes), plazos: { ...antes.plazos, revision: 7 }, publicacionDirecta: false }, actorId);
      const despues = await obtenerConfigDocumental();
      expect(despues.plazos.revision).toBe(7);
      expect(despues.publicacionDirecta).toBe(false);
      const detalle = await ultimaAuditoria();
      expect(Object.keys(detalle.cambios).sort()).toEqual(["plazo_revision_dias", "publicacion_directa"]);
      expect(detalle.cambios.publicacion_directa).toEqual({ antes: antes.publicacionDirecta ? "1" : "0", despues: "0" });
      await expect(guardarConfigDocumental({ ...aGuardar(antes), formatoCodigo: "{PROCESO}-{NN}" }, actorId)).rejects.toThrow(/TIPO/);
      await expect(guardarConfigDocumental({ ...aGuardar(antes), formatoCodigo: "{PROCESO}{TIPO}-{NN}" }, actorId)).rejects.toThrow(/Separe/);
      await expect(guardarConfigDocumental({ ...aGuardar(antes), escalamientoDias: 0 }, actorId)).rejects.toThrow();
      await expect(guardarConfigDocumental({ ...aGuardar(antes), escalamientoDias: 61 }, actorId)).rejects.toThrow();
      await expect(guardarConfigDocumental({ ...aGuardar(antes), plazos: { ...antes.plazos, ajustes: 366 } }, actorId)).rejects.toThrow();
      await expect(guardarConfigDocumental({ ...aGuardar(antes), plazos: { ...antes.plazos, ajustes: 1.5 } }, actorId)).rejects.toThrow();
      expect((await obtenerConfigDocumental()).plazos.ajustes).toBe(antes.plazos.ajustes);
    } finally {
      await guardarConfigDocumental(aGuardar(antes), actorId);
    }
  });

  it("guardar lo mismo no registra cambios", async () => {
    const antes = await obtenerConfigDocumental();
    await guardarConfigDocumental(aGuardar(antes), actorId);
    expect((await ultimaAuditoria()).cambios).toEqual({});
  });

  it("una clave ausente o inválida cae al valor por defecto", () => revertida(sql, async (tx) => {
    await tx`DELETE FROM configuracion WHERE clave = 'plazo_elaboracion_dias'`;
    await tx`UPDATE configuracion SET valor = 'abc' WHERE clave = 'plazo_revision_dias'`;
    const c = await obtenerConfigDocumental({ sql: tx });
    expect([c.plazos.elaboracion, c.plazos.revision]).toEqual([15, 5]);
  }));
});

describe("lista de verificación", () => {
  it("los ítems se crean, se ordenan y se desactivan, nunca se borran", async () => {
    const id = await crearItemVerificacion({ texto: "Ítem de prueba de la configuración", critico: true }, actorId);
    try {
      const orden = async () => (await listarItemsVerificacion()).map((i) => i.id);
      expect((await orden()).at(-1)).toBe(id);
      await moverItemVerificacion(id, "arriba", actorId);
      expect((await orden()).at(-2)).toBe(id);
      await moverItemVerificacion(id, "abajo", actorId);
      expect((await orden()).at(-1)).toBe(id);
      await moverItemVerificacion(id, "abajo", actorId); // ya es el último: no cambia nada
      expect((await orden()).at(-1)).toBe(id);

      await editarItemVerificacion(id, { texto: "Ítem de prueba editado", critico: false }, actorId);
      await alternarItemVerificacion(id, false, actorId);
      const todos = await listarItemsVerificacion();
      expect(todos.find((i) => i.id === id)).toMatchObject({ activo: false, critico: false, texto: "Ítem de prueba editado" });
      expect((await listarItemsVerificacion({ soloActivos: true })).some((i) => i.id === id)).toBe(false);

      const acciones = await sql`SELECT accion FROM auditoria WHERE usuario_id = ${actorId} AND entidad = 'lista_verificacion_items' AND entidad_id = ${id}`;
      expect(acciones.map((a) => a.accion).sort()).toEqual([
        "alternar_item_verificacion",
        "crear_item_verificacion",
        "editar_item_verificacion",
        "mover_item_verificacion",
        "mover_item_verificacion",
      ]);
    } finally {
      await sql`DELETE FROM lista_verificacion_items WHERE id = ${id}`; // sin respuestas: el test sí puede limpiar
    }
  });

  it("el texto debe tener de 5 a 300 caracteres y el ítem debe existir", async () => {
    await expect(crearItemVerificacion({ texto: "abc", critico: false }, actorId)).rejects.toThrow(/entre 5 y 300/);
    await expect(crearItemVerificacion({ texto: "x".repeat(301), critico: false }, actorId)).rejects.toThrow(/entre 5 y 300/);
    await expect(alternarItemVerificacion(999999999, false, actorId)).rejects.toThrow(/no existe/);
    await expect(moverItemVerificacion(999999999, "arriba", actorId)).rejects.toThrow(/no existe/);
  });
});
