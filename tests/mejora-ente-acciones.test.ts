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
import { registrarRespuestaAlEnteAccion } from "@/app/acciones-mejoramiento";
import { obtenerSql } from "@/db/cliente";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { baseDeMejora, evidenciaDelHallazgo, hallazgoEn } from "./utiles/mejoramiento";
import { revertida } from "./utiles/transaccion";

const sql = obtenerSql();
afterAll(async () => {
  await sql.end();
  globalThis.__sql = undefined;
});

beforeEach(() => {
  vi.clearAllMocks();
});

function formulario(campos: Record<string, string>) {
  const datos = new FormData();
  for (const [campo, valor] of Object.entries(campos)) datos.append(campo, valor);
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
  it("el Admin SGC la registra con la fecha y el oficio y vuelve al hallazgo; sin oficio, sin permiso o con un campo de más, no", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await hallazgoEn(tx, b, "en_ejecucion", { origen: "ente_control", fuente: "Superintendencia Nacional de Salud", fechaLimiteEnte: "2026-12-30" });
      const campos = { hallazgoId: String(h.id), enviadaEn: ENVIADA };
      const registrar = (quien: SesionFlujo, c: Record<string, string>) => como(tx, quien, () => destino(registrarRespuestaAlEnteAccion(null, formulario(c))));

      expect(await registrar(b.admin, campos)).toMatchObject({ ok: false, error: "Adjunte el oficio de respuesta" });
      await evidenciaDelHallazgo(tx, h.id, b.admin.usuarioId);
      expect(await registrar(b.control, campos)).toMatchObject({ ok: false });
      expect(await registrar(b.admin, { ...campos, nota: "un campo que el formulario no manda" })).toMatchObject({ ok: false });
      expect(await registrar(b.admin, { ...campos, enviadaEn: "17/11/2026" })).toMatchObject({
        ok: false,
        error: "Escriba la fecha en que se envió la respuesta al ente",
      });
      const [antes] = await tx`SELECT respuesta_ente_en FROM mejora_hallazgos WHERE id = ${h.id}`;
      expect(antes.respuesta_ente_en).toBeNull();

      expect(await registrar(b.admin, campos)).toBe(`REDIRECT:/mejoramiento/${h.id}`);
      const [f] = await tx`SELECT to_char(respuesta_ente_en, 'YYYY-MM-DD') AS en, respuesta_ente_por FROM mejora_hallazgos WHERE id = ${h.id}`;
      expect(f).toEqual({ en: ENVIADA, respuesta_ente_por: b.admin.usuarioId });
    }));
});
