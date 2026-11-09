import { existsSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { obtenerSql } from "@/db/cliente";
import { alcanceProcesos, enAlcance, procesosAsignados, puedeRatificar, puedeVerVigencia, type Alcance } from "@/lib/alcance";
import type { Rol } from "@/lib/roles";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

const sql = () => obtenerSql();
const marca = Date.now();
let liderId: number;
let liderVacioId: number;
let ciId: number;
let gthId: number;
let inactivoId: number;

async function crearUsuario(nombre: string, rol: string): Promise<number> {
  const [u] = await sql()`INSERT INTO usuarios (usuario, nombre, hash_clave, rol) VALUES (${`${nombre}_${marca}`}, 'x', 'h', ${rol}) RETURNING id`;
  return u.id as number;
}

beforeAll(async () => {
  [{ id: gthId }] = await sql()`SELECT id FROM procesos WHERE sigla = 'GTH'`;
  liderId = await crearUsuario("zz_lider", "lider_proceso");
  liderVacioId = await crearUsuario("zz_lider_vacio", "lider_proceso");
  ciId = await crearUsuario("zz_ci", "control_interno");
  await sql()`INSERT INTO usuario_procesos (usuario_id, proceso_id) VALUES (${liderId}, ${gthId})`;
});

afterAll(async () => {
  if (inactivoId) await sql()`UPDATE procesos SET activo = true WHERE id = ${inactivoId}`;
  const ids = [liderId, liderVacioId, ciId].filter(Boolean);
  await sql()`DELETE FROM usuario_procesos WHERE usuario_id = ANY(${ids})`;
  await sql()`DELETE FROM usuarios WHERE id = ANY(${ids})`;
  await sql().end();
  globalThis.__sql = undefined;
});

describe("alcance por procesos", () => {
  it("el líder solo alcanza sus procesos; sin asignación, ninguno", async () => {
    expect(await alcanceProcesos({ usuarioId: liderId, rol: "lider_proceso" })).toEqual({ todos: false, procesoIds: [gthId] });
    expect(await alcanceProcesos({ usuarioId: liderVacioId, rol: "lider_proceso" })).toEqual({ todos: false, procesoIds: [] });
  });
  it("los demás roles alcanzan todo", async () => {
    expect(await alcanceProcesos({ usuarioId: ciId, rol: "control_interno" })).toEqual({ todos: true });
  });
  it("enAlcance y procesosAsignados", async () => {
    expect(enAlcance({ todos: false, procesoIds: [gthId] }, gthId)).toBe(true);
    expect(enAlcance({ todos: false, procesoIds: [gthId] }, gthId + 1)).toBe(false);
    expect(enAlcance({ todos: true }, 999)).toBe(true);
    expect((await procesosAsignados(liderId)).map((p) => p.sigla)).toEqual(["GTH"]);
  });
  it("un proceso inactivo queda fuera del alcance y de los asignados", async () => {
    const [otro] = await sql()`SELECT id FROM procesos WHERE sigla <> 'GTH' AND activo ORDER BY id LIMIT 1`;
    inactivoId = otro.id as number;
    await sql()`INSERT INTO usuario_procesos (usuario_id, proceso_id) VALUES (${liderId}, ${inactivoId})`;
    await sql()`UPDATE procesos SET activo = false WHERE id = ${inactivoId}`;
    expect(await alcanceProcesos({ usuarioId: liderId, rol: "lider_proceso" })).toEqual({ todos: false, procesoIds: [gthId] });
    expect((await procesosAsignados(liderId)).map((p) => p.id)).toEqual([gthId]);
  });
});

describe("quién ratifica (spec 13C §6.3)", () => {
  const GTH = 10;
  const OTRO = 20;
  const doc = (d: Partial<Parameters<typeof puedeRatificar>[1]> = {}) => ({
    procesoId: GTH,
    autoridad: "operativo" as const,
    origen: "interno" as const,
    enTramite: false,
    vigente: true,
    ...d,
  });
  const sujeto = (rol: Rol) => ({ usuarioId: 1, rol, verHistorial: false });
  const todo: Alcance = { todos: true };
  const deGth: Alcance = { todos: false, procesoIds: [GTH] };

  it.each<[string, Rol, Parameters<typeof puedeRatificar>[1], Alcance, boolean]>([
    ["el Admin SGC, cualquier interno vigente", "admin_sgc", doc({ procesoId: OTRO }), todo, true],
    ["el Admin SGC, también un estratégico", "admin_sgc", doc({ autoridad: "estrategico" }), todo, true],
    ["el líder, en su proceso", "lider_proceso", doc(), deGth, true],
    ["el líder, un estratégico de su proceso", "lider_proceso", doc({ autoridad: "estrategico" }), deGth, true],
    ["el líder, fuera de su proceso", "lider_proceso", doc({ procesoId: OTRO }), deGth, false],
    ["el líder sin procesos", "lider_proceso", doc(), { todos: false, procesoIds: [] }, false],
    ["Gerencia, un estratégico", "gerencia", doc({ autoridad: "estrategico" }), todo, true],
    ["Gerencia, un operativo", "gerencia", doc(), todo, false],
    ["Control Interno nunca", "control_interno", doc({ autoridad: "estrategico" }), todo, false],
    ["Consulta nunca", "consulta", doc(), todo, false],
    ["nadie, con trámite abierto", "admin_sgc", doc({ enTramite: true }), todo, false],
    ["nadie, un externo", "admin_sgc", doc({ origen: "externo" }), todo, false],
    ["nadie, si no está vigente", "admin_sgc", doc({ vigente: false }), todo, false],
    ["ni el líder con trámite abierto en su proceso", "lider_proceso", doc({ enTramite: true }), deGth, false],
    ["ni Gerencia con un estratégico externo", "gerencia", doc({ autoridad: "estrategico", origen: "externo" }), todo, false],
  ])("%s", (_caso, rol, d, alcance, esperado) => {
    expect(puedeRatificar(sujeto(rol), d, alcance)).toBe(esperado);
  });

  it("puedeVerVigencia: vigencia.ver, indicadores o responsable técnico", () => {
    expect(puedeVerVigencia(sujeto("lider_proceso"))).toBe(true);
    expect(puedeVerVigencia(sujeto("control_interno"))).toBe(true);
    expect(puedeVerVigencia(sujeto("consulta"))).toBe(false);
    expect(puedeVerVigencia({ ...sujeto("consulta"), responsableTecnico: true })).toBe(true);
    expect(puedeVerVigencia({ ...sujeto("consulta"), verHistorial: true })).toBe(false);
  });
});
