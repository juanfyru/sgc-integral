/**
 * Áreas, cargos y supervisores contra la BD de desarrollo. El actor deja filas
 * en auditoría (no se borra) y las áreas/cargos creados por el servicio también
 * quedan auditados: todos los nombres llevan sufijo único por corrida.
 */
import { existsSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import { obtenerSql } from "@/db/cliente";
import {
  alternarArea,
  alternarCargo,
  crearArea,
  crearCargo,
  detectarCiclo,
  editarCargo,
  listarAreas,
  moverArea,
  supervisoresDe,
} from "@/db/consultas/estructura";

const sql = () => obtenerSql();
const sufijo = Date.now();
let actorId: number;
let areaId: number;
let gerenteId: number;
let subgerenteId: number;
let jefeId: number;
let subId: number;
let otroId: number;
let usuarioPruebaId: number;
const usuariosCreados: number[] = [];

async function crearUsuario(nombre: string, cargoId: number | null): Promise<number> {
  const [u] = await sql()`INSERT INTO usuarios (usuario, nombre, hash_clave, rol, cargo_id)
    VALUES (${`${nombre}_${sufijo}`}, ${nombre}, 'x', 'consulta', ${cargoId}) RETURNING id`;
  usuariosCreados.push(Number(u.id));
  return Number(u.id);
}

beforeAll(async () => {
  actorId = await crearUsuario("zz_actor", null);
  ({ id: areaId } = await crearArea({ nombre: `ZZ Gerencia ${sufijo}` }, actorId));
  ({ id: gerenteId } = await crearCargo({ nombre: `ZZ Gerente ${sufijo}`, areaId, superiorId: null }, actorId));
  ({ id: subgerenteId } = await crearCargo({ nombre: `ZZ Subgerente ${sufijo}`, areaId, superiorId: gerenteId }, actorId));
  jefeId = await crearUsuario("zz_jefe", gerenteId);
  subId = await crearUsuario("zz_sub", subgerenteId);
  otroId = await crearUsuario("zz_otro", null);
  usuarioPruebaId = await crearUsuario("zz_u", null);
});

afterAll(async () => {
  // Los usuarios con historia (el actor) se conservan; los demás se borran.
  await sql()`UPDATE usuarios SET jefe_inmediato_id = NULL WHERE id = ANY(${usuariosCreados})`;
  await sql()`DELETE FROM usuarios WHERE id = ANY(${usuariosCreados.filter((i) => i !== actorId)})`;
  await sql()`UPDATE usuarios SET activo = false WHERE id = ${actorId}`;
  await sql().end();
});

describe("detectarCiclo", () => {
  const cargos = [{ id: 1, superiorId: null }, { id: 2, superiorId: 1 }, { id: 3, superiorId: 2 }];
  it("detecta ciclo directo e indirecto y acepta cadenas válidas", () => {
    expect(detectarCiclo(cargos, 1, 3)).toBe(true);
    expect(detectarCiclo(cargos, 2, 2)).toBe(true);
    expect(detectarCiclo(cargos, 3, 1)).toBe(false);
    expect(detectarCiclo(cargos, 1, null)).toBe(false);
  });
});

describe("áreas y cargos en BD", () => {
  it("crea área y cargos encadenados, y rechaza el ciclo en edición", async () => {
    const { id: aId } = await crearArea({ nombre: `ZZ Área Ciclo ${sufijo}` }, actorId);
    const a = await crearCargo({ nombre: `ZZ Cargo A ${sufijo}`, areaId: aId, superiorId: null }, actorId);
    const b = await crearCargo({ nombre: `ZZ Cargo B ${sufijo}`, areaId: aId, superiorId: a.id }, actorId);
    await expect(
      editarCargo(a.id, { nombre: `ZZ Cargo A ${sufijo}`, areaId: aId, superiorId: b.id }, actorId),
    ).rejects.toThrow(/ciclo/);
    await expect(
      editarCargo(a.id, { nombre: `ZZ Cargo A ${sufijo}`, areaId: aId, superiorId: a.id }, actorId),
    ).rejects.toThrow(/ciclo/);
  });
  it("rechaza un superior inexistente con mensaje en español", async () => {
    await expect(
      crearCargo({ nombre: `ZZ Huérfano ${sufijo}`, areaId, superiorId: 999999999 }, actorId),
    ).rejects.toThrow(/superior/);
  });
  it("no deja desactivar un área con cargos activos ni un cargo con usuarios activos", async () => {
    await expect(alternarArea(areaId, false, actorId)).rejects.toThrow(/cargos activos/);
    await sql()`UPDATE usuarios SET cargo_id = ${subgerenteId} WHERE id = ${usuarioPruebaId}`;
    await expect(alternarCargo(subgerenteId, false, actorId)).rejects.toThrow(/usuarios activos/);
  });
  it("mueve el área intercambiando el orden con su vecina", async () => {
    const { id: otraId } = await crearArea({ nombre: `ZZ Área Orden ${sufijo}` }, actorId);
    const antes = (await listarAreas()).map((a) => a.id);
    const vecinaId = antes[antes.indexOf(otraId) - 1];
    await moverArea(otraId, "arriba", actorId);
    const despues = (await listarAreas()).map((a) => a.id);
    expect(despues.indexOf(otraId)).toBe(antes.indexOf(otraId) - 1);
    expect(despues.indexOf(vecinaId)).toBe(antes.indexOf(vecinaId) + 1);
  });
  it("supervisoresDe: por organigrama y por jefe inmediato", async () => {
    expect((await supervisoresDe(subId)).map((s) => s.id)).toEqual([jefeId]);
    await sql()`UPDATE usuarios SET jefe_inmediato_id = ${otroId} WHERE id = ${subId}`;
    expect((await supervisoresDe(subId)).map((s) => s.id)).toEqual([otroId]);
    expect(await supervisoresDe(jefeId)).toEqual([]);
  });
  it("todo queda en bitácora", async () => {
    const filas = await sql()`SELECT accion FROM auditoria WHERE usuario_id = ${actorId}
      AND accion IN ('crear_area','crear_cargo','editar_cargo','reordenar_area')`;
    expect(filas.length).toBeGreaterThanOrEqual(5);
  });
});
