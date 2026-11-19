/**
 * «Registrar la respuesta al ente» por el camino de la interfaz (Fase 15A, Tarea 19): la acción con un `FormData` real, contra la
 * BD dentro de una transacción que se revierte (el cliente de la app se sustituye por ella); solo la sesión es de mentira. El
 * permiso de la matriz, el esquema estricto, la regla del oficio y el regreso a la página del hallazgo.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const { enCurso, redirect, requerirSesion } = vi.hoisted(() => ({
  enCurso: { sql: null as unknown },
  redirect: vi.fn((destino: string) => {
    throw new Error(`REDIRECT:${destino}`);
  }),
  requerirSesion: vi.fn(),
}));

vi.mock("@/db/cliente", async (original) => {
  const real = await original<typeof import("@/db/cliente")>();
  return { ...real, obtenerSql: () => (enCurso.sql ?? real.obtenerSql()) as ReturnType<typeof real.obtenerSql> };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/sesion-actual", () => ({ requerirSesion }));
vi.mock("@/lib/contexto-peticion", () => ({ contextoDePeticion: async () => ({ ip: "10.0.0.1", userAgent: "prueba" }) }));

import type { TransactionSql } from "postgres";
import { registrarRespuestaAlEnteAccion, registrarRespuestaDelPlanAccion } from "@/app/acciones-mejoramiento";
import { obtenerSql } from "@/db/cliente";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { ponerEnPlan } from "@/db/consultas/mejoramiento/clasificacion";
import { anularHallazgo } from "@/db/consultas/mejoramiento/registro";
import { archivoDelPlan, baseDeMejora, c, evidenciaDelHallazgo, hallazgoEn, planDeMejoraDePrueba } from "./utiles/mejoramiento";
import { revertida } from "./utiles/transaccion";

const sql = obtenerSql();
afterAll(async () => {
  await sql.end();
  globalThis.__sql = undefined;
});

beforeEach(() => {
  vi.clearAllMocks();
});

function formulario(campos: Record<string, string | string[]>) {
  const datos = new FormData();
  for (const [campo, valor] of Object.entries(campos)) for (const v of Array.isArray(valor) ? valor : [valor]) datos.append(campo, v);
  return datos;
}

async function como<T>(tx: TransactionSql, quien: SesionFlujo, fn: () => Promise<T>): Promise<T> {
  enCurso.sql = tx;
  requerirSesion.mockResolvedValue(quien);
  try {
    return await fn();
  } finally {
    enCurso.sql = null;
  }
}

const destino = (p: Promise<unknown>) => p.then((r) => r, (err: Error) => err.message);

// El día en que `hallazgoEn` aprueba el plan: no es futuro para el reloj de la acción, que es el de verdad.
const ENVIADA = "2026-11-17";

describe("registrarRespuestaAlEnteAccion", () => {
  it("el Admin SGC la registra con la fecha y el oficio elegido y vuelve al hallazgo; cada rechazo dice por qué", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await hallazgoEn(tx, b, "en_ejecucion", { origen: "ente_control", fuente: "Superintendencia Nacional de Salud", fechaLimiteEnte: "2026-12-30" });
      const registrar = (quien: SesionFlujo, c: Record<string, string>) => como(tx, quien, () => destino(registrarRespuestaAlEnteAccion(null, formulario(c))));

      const sinOficio = { hallazgoId: String(h.id), enviadaEn: ENVIADA };
      expect(await registrar(b.admin, sinOficio)).toMatchObject({ ok: false, error: "Elija el oficio de respuesta" });
      expect(await registrar(b.admin, { ...sinOficio, oficioId: "999999999" })).toMatchObject({ ok: false, error: "Adjunte el oficio de respuesta" });
      const oficioId = await evidenciaDelHallazgo(tx, h.id, b.admin.usuarioId);
      const campos = { ...sinOficio, oficioId: String(oficioId) };
      expect(await registrar(b.control, campos)).toMatchObject({ ok: false, error: "Sin permiso para esta acción" });
      expect(await registrar(b.admin, { ...campos, nota: "un campo que el formulario no manda" })).toMatchObject({
        ok: false,
        error: expect.stringContaining("nota"),
      });
      expect(await registrar(b.admin, { ...campos, enviadaEn: "17/11/2026" })).toMatchObject({
        ok: false,
        error: "Escriba la fecha en que se envió la respuesta al ente",
      });
      expect(await registrar(b.admin, { ...campos, oficioId: "999999999" })).toMatchObject({
        ok: false,
        error: "Elija el oficio entre los archivos del hallazgo subidos después de aprobar el plan",
      });
      const [antes] = await tx`SELECT respuesta_ente_en FROM mejora_hallazgos WHERE id = ${h.id}`;
      expect(antes.respuesta_ente_en).toBeNull();

      expect(await registrar(b.admin, campos)).toBe(`REDIRECT:/mejoramiento/${h.id}`);
      const [f] = await tx`SELECT to_char(respuesta_ente_en, 'YYYY-MM-DD') AS en, respuesta_ente_por FROM mejora_hallazgos WHERE id = ${h.id}`;
      expect(f).toEqual({ en: ENVIADA, respuesta_ente_por: b.admin.usuarioId });
    }));
});

describe("registrarRespuestaDelPlanAccion (Fase 15B, anexo §3.8)", () => {
  it("el Admin SGC la registra con lo que vio y vuelve al plan; si la lista cambió, vuelve al plan a revisarla y no escribe nada", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const ente = { origen: "ente_control" as const, fuente: "Superintendencia Nacional de Salud", fechaLimiteEnte: "2026-12-30" };
      const plan = await planDeMejoraDePrueba(tx, b.control, { origen: "ente_control", fechaLimiteEnte: "2026-12-30" });
      const h1 = await hallazgoEn(tx, b, "en_ejecucion", ente);
      const h2 = await hallazgoEn(tx, b, "en_ejecucion", ente);
      await ponerEnPlan(b.control, { planId: plan.id, hallazgoIds: [h1.id, h2.id] }, c(ENVIADA + "T15:00:00Z", tx));
      const oficioId = await archivoDelPlan(tx, plan.id, b.admin.usuarioId);
      const registrar = (quien: SesionFlujo, campos: Record<string, string | string[]>) =>
        como(tx, quien, () => destino(registrarRespuestaDelPlanAccion(null, formulario(campos))));
      const campos = { planId: String(plan.id), enviadaEn: ENVIADA, oficioId: String(oficioId), vistos: [String(h1.id), String(h2.id)] };

      expect(await registrar(b.control, campos)).toMatchObject({ ok: false, error: "Sin permiso para esta acción" });
      expect(await registrar(b.admin, { ...campos, nota: "un campo que el formulario no manda" })).toMatchObject({
        ok: false,
        error: expect.stringContaining("nota"),
      });
      expect(await registrar(b.admin, { ...campos, oficioId: "" })).toMatchObject({ ok: false, error: "Elija el oficio de respuesta" });
      // La lista que vio la persona ya no es la de los listos: vuelve al plan, al bloque de la respuesta, con el aviso.
      expect(await registrar(b.admin, { ...campos, vistos: String(h1.id) })).toBe(`REDIRECT:/mejoramiento/planes/${plan.id}?respuesta=cambio#respuesta-al-ente`);
      const sinRespuesta = await tx`SELECT count(*)::int AS n FROM mejora_hallazgos WHERE id IN (${h1.id}, ${h2.id}) AND respuesta_ente_en IS NOT NULL`;
      expect(sinRespuesta[0].n).toBe(0);

      expect(await registrar(b.admin, campos)).toBe(`REDIRECT:/mejoramiento/planes/${plan.id}#respuesta-al-ente`);
      const respondidos = await tx`SELECT count(*)::int AS n FROM mejora_hallazgos WHERE id IN (${h1.id}, ${h2.id}) AND respuesta_ente_en IS NOT NULL`;
      expect(respondidos[0].n).toBe(2);

      // El mismo formulario, enviado otra vez: ya no queda ningún listo de los que vio. La lista cambió: vuelve al plan a revisarla
      // (no un error en el formulario viejo) y no se escribe otra respuesta.
      const otroOficio = await archivoDelPlan(tx, plan.id, b.admin.usuarioId);
      expect(await registrar(b.admin, { ...campos, oficioId: String(otroOficio) })).toBe(
        `REDIRECT:/mejoramiento/planes/${plan.id}?respuesta=cambio#respuesta-al-ente`,
      );
      const [respuestas] = await tx`SELECT count(*)::int AS n FROM mejora_plan_respuestas WHERE plan_id = ${plan.id}`;
      expect(respuestas.n).toBe(1);
    }));

  it("si todos los que vio se anularon con el formulario abierto, vuelve al plan a revisar la lista y no escribe nada", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const ente = { origen: "ente_control" as const, fuente: "Superintendencia Nacional de Salud", fechaLimiteEnte: "2026-12-30" };
      const plan = await planDeMejoraDePrueba(tx, b.control, { origen: "ente_control", fechaLimiteEnte: "2026-12-30" });
      const h = await hallazgoEn(tx, b, "en_ejecucion", ente);
      const o = c(ENVIADA + "T15:00:00Z", tx);
      await ponerEnPlan(b.control, { planId: plan.id, hallazgoIds: [h.id] }, o);
      const oficioId = await archivoDelPlan(tx, plan.id, b.admin.usuarioId);
      await anularHallazgo(b.admin, { hallazgoId: h.id, justificacion: "Se registró dos veces por un error" }, o);
      const campos = { planId: String(plan.id), enviadaEn: ENVIADA, oficioId: String(oficioId), vistos: String(h.id) };
      expect(await como(tx, b.admin, () => destino(registrarRespuestaDelPlanAccion(null, formulario(campos))))).toBe(
        `REDIRECT:/mejoramiento/planes/${plan.id}?respuesta=cambio#respuesta-al-ente`,
      );
      const [respuestas] = await tx`SELECT count(*)::int AS n FROM mejora_plan_respuestas WHERE plan_id = ${plan.id}`;
      expect(respuestas.n).toBe(0);
    }));
});
