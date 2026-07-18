/**
 * Motor genérico del editor del mapa contra la BD dev (migrada y sembrada).
 * `mover` se prueba en un ámbito AISLADO (procesos bajo macroprocesos
 * desechables ZZ) para no reordenar datos reales del seed. Todo lo ZZ se
 * limpia al terminar.
 */
import { existsSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import { obtenerSql } from "@/db/cliente";
import { asegurarAdmin } from "@/db/consultas/admin";
import {
  alternarActivo,
  borrar,
  crearPeriferico,
  crearTipo,
  editarPeriferico,
  editarTipo,
  guardarTextos,
  listarPerifericos,
  listarTipos,
  mover,
  obtenerPeriferico,
  obtenerTextos,
  obtenerTipo,
} from "@/db/consultas/mapa-admin";

const sql = () => obtenerSql();
let usuarioId: number;

async function limpiar() {
  await sql()`DELETE FROM subprocesos WHERE slug LIKE 'zz-%'`;
  await sql()`DELETE FROM procesos WHERE slug LIKE 'zz-%'`;
  await sql()`DELETE FROM macroprocesos WHERE slug LIKE 'zz-%'`;
  await sql()`DELETE FROM elementos_perifericos WHERE texto LIKE 'ZZ-%'`;
  await sql()`DELETE FROM tipos_documento WHERE sigla LIKE 'ZZ%'`;
  await sql()`DELETE FROM auditoria WHERE usuario_id IN
    (SELECT id FROM usuarios WHERE usuario = 'admin_mapa')`;
  await sql()`DELETE FROM usuarios WHERE usuario = 'admin_mapa'`;
}

beforeAll(async () => {
  await limpiar();
  await asegurarAdmin("admin_mapa", "Admin Mapa", "x");
  [{ id: usuarioId }] = await sql()`SELECT id FROM usuarios WHERE usuario = 'admin_mapa'`;
});

afterAll(async () => {
  await limpiar();
  await sql().end();
});

async function crearMacroZZ(slug: string, letra: string): Promise<number> {
  const [m] = await sql()`INSERT INTO macroprocesos (letra, nombre, slug, banda, color, icono, orden)
    VALUES (${letra}, ${"ZZ " + slug}, ${slug}, 'apoyo', '#123456', 'target',
            (SELECT coalesce(max(orden), 0) + 1 FROM macroprocesos)) RETURNING id`;
  return m.id as number;
}

async function tresProcesos(macroId: number, pref: string) {
  await sql()`INSERT INTO procesos (macroproceso_id, nombre, sigla, slug, icono, orden)
    VALUES (${macroId}, ${"ZZ " + pref + "1"}, ${pref + "A"}, ${"zz-" + pref + "1"}, 'target', 1),
           (${macroId}, ${"ZZ " + pref + "2"}, ${pref + "B"}, ${"zz-" + pref + "2"}, 'target', 2),
           (${macroId}, ${"ZZ " + pref + "3"}, ${pref + "C"}, ${"zz-" + pref + "3"}, 'target', 3)`;
  const filas = await sql()`SELECT id, slug FROM procesos
    WHERE macroproceso_id = ${macroId} ORDER BY orden`;
  return filas as unknown as Array<{ id: number; slug: string }>;
}

async function slugs(filas: Array<{ id: number }>): Promise<string[]> {
  const ids = filas.map((f) => f.id);
  const orden = await sql()`SELECT slug FROM procesos WHERE id IN ${sql()(ids)} ORDER BY orden`;
  return orden.map((f) => f.slug as string);
}

describe("mover", () => {
  it("intercambia el orden con el vecino y audita", async () => {
    const macro = await crearMacroZZ("zz-mover-1", "Z");
    const p = await tresProcesos(macro, "ZX");
    await mover("procesos", p[1].id, "arriba", usuarioId);
    expect(await slugs(p)).toEqual(["zz-ZX2", "zz-ZX1", "zz-ZX3"]);
    const [aud] = await sql()`SELECT 1 FROM auditoria
      WHERE accion = 'reordenar_proceso' AND entidad_id = ${p[1].id}`;
    expect(aud).toBeTruthy();
  });

  it("en el extremo superior es no-op", async () => {
    const macro = await crearMacroZZ("zz-mover-2", "Y");
    const p = await tresProcesos(macro, "ZY");
    await mover("procesos", p[0].id, "arriba", usuarioId);
    expect(await slugs(p)).toEqual(["zz-ZY1", "zz-ZY2", "zz-ZY3"]);
  });

  it("no cruza el ámbito: el último de un macro no roba filas de otro", async () => {
    const macroA = await crearMacroZZ("zz-mover-3a", "W");
    const pa = await tresProcesos(macroA, "ZW");
    const macroB = await crearMacroZZ("zz-mover-3b", "X");
    await tresProcesos(macroB, "ZV");
    // pa[2] es el último de macroA; bajar debe ser no-op aunque macroB tenga filas.
    const [antes] = await sql()`SELECT orden FROM procesos WHERE id = ${pa[2].id}`;
    await mover("procesos", pa[2].id, "abajo", usuarioId);
    const [despues] = await sql()`SELECT orden FROM procesos WHERE id = ${pa[2].id}`;
    expect(despues.orden).toBe(antes.orden);
  });
});

async function unaConvencion(texto: string): Promise<number> {
  const [f] = await sql()`INSERT INTO elementos_perifericos (tipo, texto, orden)
    VALUES ('convencion', ${texto}, 5000) RETURNING id`;
  return f.id as number;
}

describe("alternarActivo", () => {
  it("desactiva y reactiva con auditoría", async () => {
    const id = await unaConvencion("ZZ-toggle");
    await alternarActivo("elementos_perifericos", id, false, usuarioId);
    const [f] = await sql()`SELECT activo FROM elementos_perifericos WHERE id = ${id}`;
    expect(f.activo).toBe(false);
    const [aud] = await sql()`SELECT 1 FROM auditoria
      WHERE accion = 'desactivar_periferico' AND entidad_id = ${id}`;
    expect(aud).toBeTruthy();
    await alternarActivo("elementos_perifericos", id, true, usuarioId);
    const [f2] = await sql()`SELECT activo FROM elementos_perifericos WHERE id = ${id}`;
    expect(f2.activo).toBe(true);
  });
});

describe("borrar", () => {
  it("borra un periférico sin dependientes y audita antes", async () => {
    const id = await unaConvencion("ZZ-borrar");
    await borrar("elementos_perifericos", id, usuarioId);
    const filas = await sql()`SELECT 1 FROM elementos_perifericos WHERE id = ${id}`;
    expect(filas.length).toBe(0);
    const [aud] = await sql()`SELECT 1 FROM auditoria
      WHERE accion = 'borrar_periferico' AND entidad_id = ${id}`;
    expect(aud).toBeTruthy();
  });

  it("traduce la violación de FK en error de negocio y no deja auditoría huérfana", async () => {
    // Un tipo_documento en uso por el seed no se puede borrar (FK restrict).
    const [tipo] = await sql()`SELECT t.id FROM tipos_documento t
      WHERE EXISTS (SELECT 1 FROM documentos d WHERE d.tipo_id = t.id) LIMIT 1`;
    await expect(borrar("tipos_documento", tipo.id, usuarioId)).rejects.toThrow(/No se puede borrar/);
    const aud = await sql()`SELECT 1 FROM auditoria
      WHERE accion = 'borrar_tipo_documento' AND entidad_id = ${tipo.id}`;
    expect(aud.length).toBe(0);
  });
});

describe("tipos_documento CRUD", () => {
  it("crea, aparece en el listado y se puede editar", async () => {
    const { id } = await crearTipo(
      { nombre: "ZZ Formato Prueba", sigla: "ZZF", esDiligenciable: true },
      usuarioId,
    );
    const lista = await listarTipos();
    const fila = lista.find((f) => f.id === id);
    expect(fila).toMatchObject({ sigla: "ZZF", esDiligenciable: true, numDocs: 0 });

    await editarTipo(id, { nombre: "ZZ Formato Prueba", sigla: "ZZG", esDiligenciable: false }, usuarioId);
    const t = await obtenerTipo(id);
    expect(t).toMatchObject({ sigla: "ZZG", esDiligenciable: false });
    const [aud] = await sql()`SELECT 1 FROM auditoria
      WHERE accion = 'editar_tipo_documento' AND entidad_id = ${id}`;
    expect(aud).toBeTruthy();
  });

  it("rechaza sigla duplicada con error legible", async () => {
    const [existente] = await sql()`SELECT sigla FROM tipos_documento WHERE activo LIMIT 1`;
    await expect(
      crearTipo({ nombre: "ZZ Otro", sigla: existente.sigla, esDiligenciable: false }, usuarioId),
    ).rejects.toThrow(/ya existe/i);
  });
});

describe("textos institucionales", () => {
  it("guarda por UPSERT y valida el patrón de código", async () => {
    const antes = await obtenerTextos();
    await guardarTextos({ ...antes, lema: "ZZ lema de prueba" }, usuarioId);
    const despues = await obtenerTextos();
    expect(despues.lema).toBe("ZZ lema de prueba");
    // restaurar
    await guardarTextos({ ...despues, lema: antes.lema ?? "" }, usuarioId);

    await expect(
      guardarTextos({ patron_codigo: "(sin cerrar" }, usuarioId),
    ).rejects.toThrow(/regular/i);
  });
});

describe("periféricos CRUD", () => {
  it("crea con orden al final de su tipo y edita", async () => {
    const { id } = await crearPeriferico(
      { tipo: "entrada", texto: "ZZ-entrada nueva", icono: "target" },
      usuarioId,
    );
    const grupos = await listarPerifericos();
    expect(grupos.entrada.some((f) => f.id === id)).toBe(true);
    await editarPeriferico(id, { tipo: "entrada", texto: "ZZ-entrada editada", icono: null }, usuarioId);
    const p = await obtenerPeriferico(id);
    expect(p).toMatchObject({ texto: "ZZ-entrada editada", icono: null });
    await sql()`DELETE FROM elementos_perifericos WHERE id = ${id}`;
  });

  it("rechaza tipo inválido", async () => {
    await expect(
      crearPeriferico({ tipo: "otro", texto: "ZZ-x", icono: null }, usuarioId),
    ).rejects.toThrow(/tipo/i);
  });
});
