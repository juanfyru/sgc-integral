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
  crearMacroproceso,
  crearPeriferico,
  crearProceso,
  crearSubproceso,
  crearTipo,
  editarMacroproceso,
  editarPeriferico,
  editarProceso,
  editarSubproceso,
  editarTipo,
  guardarTextos,
  listarMacroprocesos,
  listarPerifericos,
  listarProcesos,
  listarSubprocesos,
  listarTipos,
  mover,
  obtenerMacroproceso,
  obtenerPeriferico,
  obtenerProceso,
  obtenerSubproceso,
  obtenerTextos,
  obtenerTipo,
} from "@/db/consultas/mapa-admin";

const sql = () => obtenerSql();
let usuarioId: number;
// Con historial en auditoria el usuario no se borra (FK restrict + trigger): nombre único por corrida.
const USUARIO = `admin_mapa_${Date.now()}`;

async function limpiar() {
  await sql()`DELETE FROM subprocesos WHERE slug LIKE 'zz-%'`;
  await sql()`DELETE FROM procesos WHERE slug LIKE 'zz-%'`;
  await sql()`DELETE FROM macroprocesos WHERE slug LIKE 'zz-%'`;
  await sql()`DELETE FROM elementos_perifericos WHERE texto LIKE 'ZZ-%'`;
  await sql()`DELETE FROM tipos_documento WHERE sigla LIKE 'ZZ%'`;
}

beforeAll(async () => {
  await limpiar();
  await asegurarAdmin(USUARIO, "Admin Mapa", "x");
  [{ id: usuarioId }] = await sql()`SELECT id FROM usuarios WHERE usuario = ${USUARIO}`;
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
    await guardarTextos({ ...antes, titulo_phva: "ZZ título de prueba" }, usuarioId);
    const despues = await obtenerTextos();
    expect(despues.titulo_phva).toBe("ZZ título de prueba");
    // restaurar
    await guardarTextos({ ...despues, titulo_phva: antes.titulo_phva ?? "" }, usuarioId);

    // patron_codigo ya no es editable: se ignora y no queda guardada.
    await guardarTextos({ patron_codigo: "(sin cerrar" }, usuarioId);
    expect((await obtenerTextos()).patron_codigo).toBeUndefined();
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

describe("macroprocesos CRUD", () => {
  it("crea con slug/color normalizados y aparece en su banda", async () => {
    const { id } = await crearMacroproceso(
      { letra: "Q", nombre: "ZZ Macro Prueba", banda: "apoyo",
        color: "#1b4e8e", icono: "target", slug: "zz-macro-prueba" },
      usuarioId,
    );
    const m = await obtenerMacroproceso(id);
    expect(m).toMatchObject({ banda: "apoyo", color: "#1B4E8E", slug: "zz-macro-prueba" });
    const lista = await listarMacroprocesos();
    const fila = lista.find((f) => f.id === id);
    expect(fila).toMatchObject({ numProcesos: 0 });
    expect(Array.isArray(fila?.docsAfectados)).toBe(true);

    await editarMacroproceso(id, {
      letra: "Q", nombre: "ZZ Macro Editada", banda: "apoyo",
      color: "#2E9B47", icono: "users", slug: "zz-macro-prueba",
    }, usuarioId);
    const m2 = await obtenerMacroproceso(id);
    expect(m2?.nombre).toBe("ZZ Macro Editada");
    await sql()`DELETE FROM macroprocesos WHERE id = ${id}`;
  });

  it("rechaza color inválido", async () => {
    await expect(
      crearMacroproceso({ letra: "Q", nombre: "ZZ", banda: "apoyo", color: "rojo", icono: "target", slug: "zz-q" }, usuarioId),
    ).rejects.toThrow(/hex/i);
  });
});

describe("procesos CRUD", () => {
  it("crea bajo un macroproceso, aparece en su lista y edita", async () => {
    const [macro] = await sql()`SELECT id FROM macroprocesos ORDER BY orden LIMIT 1`;
    const { id } = await crearProceso({
      macroprocesoId: macro.id, nombre: "ZZ Proceso Prueba", sigla: "ZZP",
      icono: "target", descripcion: null, slug: "zz-proceso-prueba",
    }, usuarioId);
    const lista = await listarProcesos(macro.id);
    const fila = lista.find((f) => f.id === id);
    expect(fila).toMatchObject({ sigla: "ZZP", numSubprocesos: 0, numDocs: 0 });

    await editarProceso(id, {
      macroprocesoId: macro.id, nombre: "ZZ Proceso Editado", sigla: "ZZQ",
      icono: "users", descripcion: "desc", slug: "zz-proceso-prueba",
    }, usuarioId);
    const p = await obtenerProceso(id);
    expect(p).toMatchObject({ sigla: "ZZQ", descripcion: "desc" });
    await sql()`DELETE FROM procesos WHERE id = ${id}`;
  });
});

describe("subprocesos CRUD", () => {
  it("crea bajo un proceso, aparece en su lista y edita", async () => {
    const [proc] = await sql()`SELECT id FROM procesos ORDER BY orden LIMIT 1`;
    const { id } = await crearSubproceso(
      { procesoId: proc.id, nombre: "ZZ Subproceso Prueba", slug: "zz-sub-prueba" },
      usuarioId,
    );
    const lista = await listarSubprocesos(proc.id);
    expect(lista.some((f) => f.id === id)).toBe(true);
    await editarSubproceso(id, { procesoId: proc.id, nombre: "ZZ Sub Editado", slug: "zz-sub-prueba" }, usuarioId);
    const s = await obtenerSubproceso(id);
    expect(s?.nombre).toBe("ZZ Sub Editado");
    await sql()`DELETE FROM subprocesos WHERE id = ${id}`;
  });
});
