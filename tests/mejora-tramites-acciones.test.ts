/**
 * El cambio documental desde una actividad por el camino de la interfaz (Fase 15B, anexo §9.2 y §9.3; Review Focus 5): la solicitud con
 * el campo oculto `actividadId` (también uno forzado, que no escribe nada), enlazar un trámite desde el selector y quitar un enlace.
 * Con un `FormData` real, contra la BD dentro de una transacción que se revierte (el cliente de la app se sustituye por ella); solo la
 * sesión es de mentira.
 */
import { existsSync } from "node:fs";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

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
import { enlazarTramiteAccion, quitarEnlaceDeTramiteAccion } from "@/app/acciones-mejoramiento";
import { crearSolicitudAccion } from "@/app/acciones-tramites";
import { obtenerSql } from "@/db/cliente";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { ACTIVIDAD_NO_ADMITE } from "@/lib/mejoramiento/enganches";
import { baseDeMejora, hallazgoEn, type BaseDeMejora } from "./utiles/mejoramiento";
import { tipoLibre } from "./utiles/tramites";
import { revertida } from "./utiles/transaccion";

const sql = obtenerSql();
afterAll(async () => {
  await sql.end();
  globalThis.__sql = undefined;
});

beforeEach(() => {
  vi.clearAllMocks();
});

function formulario(campos: Record<string, string | number>) {
  const datos = new FormData();
  for (const [campo, valor] of Object.entries(campos)) datos.append(campo, String(valor));
  return datos;
}

/** Corre `fn` con la acción en `tx` como `quien`, y la deja como estaba. */
async function como<T>(tx: TransactionSql, quien: SesionFlujo, fn: () => Promise<T>): Promise<T> {
  enCurso.sql = tx;
  requerirSesion.mockResolvedValue(quien);
  try {
    return await fn();
  } finally {
    enCurso.sql = null;
  }
}

/** Lo que devuelve una acción que redirige: el destino; si no redirige, su estado. */
async function destinoDe(p: Promise<unknown>): Promise<string | unknown> {
  try {
    return await p;
  } catch (err) {
    const m = /^REDIRECT:(.*)$/.exec((err as Error).message);
    if (m) return m[1];
    throw err;
  }
}

/** Un hallazgo «En ejecución», detectado el 3 de noviembre, con una actividad de quien solo consulta; y el tipo de documento libre. */
async function escena(tx: TransactionSql): Promise<{ b: BaseDeMejora; actividadId: number; tipoDocumentoId: number }> {
  const b = await baseDeMejora(tx);
  const h = await hallazgoEn(tx, b, "en_ejecucion", { detectadoEn: "2026-11-03" }, { responsableId: b.consulta.usuarioId });
  const [a] = await tx`SELECT id FROM mejora_actividades WHERE hallazgo_id = ${h.id} ORDER BY id LIMIT 1`;
  return { b, actividadId: Number(a.id), tipoDocumentoId: await tipoLibre(tx) };
}

/** Los campos de la solicitud como los manda `FormularioSolicitud`: crear un formato en el proceso del hallazgo. */
const solicitud = (e: { b: BaseDeMejora; tipoDocumentoId: number }, extra: Record<string, string | number> = {}) =>
  formulario({
    tipo: "crear",
    procesoId: e.b.procesoId,
    tipoDocumentoId: e.tipoDocumentoId,
    tituloPropuesto: "Formato de entrega del turno de noche",
    motivo: "no_conformidad",
    justificacion: "Se crea el formato de entrega del turno de noche que pide la actividad",
    ...extra,
  });

const cuantos = async (tx: TransactionSql, tabla: "tramites" | "mejora_actividad_tramites") =>
  Number((await tx`SELECT count(*)::int AS n FROM ${tx(tabla)}`)[0].n);

describe("pedir el trámite desde la actividad (crearSolicitudAccion)", () => {
  it("con el campo oculto escribe el trámite y su enlace; uno forzado a una actividad cancelada no escribe nada", () =>
    revertida(sql, async (tx) => {
      const e = await escena(tx);
      const destino = await como(tx, e.b.lider, () => destinoDe(crearSolicitudAccion(null, solicitud(e, { actividadId: e.actividadId }))));
      expect(destino).toMatch(/^\/tramites\/\d+$/);
      const tramiteId = Number(String(destino).split("/").at(-1));
      const [enlace] = await tx`SELECT actividad_id, origen FROM mejora_actividad_tramites WHERE tramite_id = ${tramiteId}`;
      expect(enlace).toMatchObject({ actividad_id: e.actividadId, origen: "pedido" });

      await tx`UPDATE mejora_actividades SET estado = 'cancelada', cancelada_en = now() WHERE id = ${e.actividadId}`;
      const [tramites, enlaces] = [await cuantos(tx, "tramites"), await cuantos(tx, "mejora_actividad_tramites")];
      const forzado = await como(tx, e.b.lider, () => destinoDe(crearSolicitudAccion(null, solicitud(e, { actividadId: e.actividadId }))));
      expect(forzado).toMatchObject({ ok: false, error: ACTIVIDAD_NO_ADMITE });
      expect(await cuantos(tx, "tramites")).toBe(tramites);
      expect(await cuantos(tx, "mejora_actividad_tramites")).toBe(enlaces);
    }));
});

describe("enlazar y quitar desde la interfaz (anexo §9.3)", () => {
  it("enlazar vuelve a la actividad; quitar no navega y deja la actividad sin el enlace; quien no solicita trámites, nada", () =>
    revertida(sql, async (tx) => {
      const e = await escena(tx);
      const pedido = await como(tx, e.b.lider, () => destinoDe(crearSolicitudAccion(null, solicitud(e))));
      const tramiteId = Number(String(pedido).split("/").at(-1));

      // Su responsable, que solo consulta, no enlaza: la matriz se lo niega antes de llegar al dominio.
      const negado = await como(tx, e.b.consulta, () => destinoDe(enlazarTramiteAccion(null, formulario({ actividadId: e.actividadId, tramiteId }))));
      expect(negado).toMatchObject({ ok: false });
      expect(await tx`SELECT 1 FROM mejora_actividad_tramites WHERE tramite_id = ${tramiteId}`).toHaveLength(0);

      const destino = await como(tx, e.b.lider, () => destinoDe(enlazarTramiteAccion(null, formulario({ actividadId: e.actividadId, tramiteId }))));
      expect(destino).toBe(`/mejoramiento/actividades/${e.actividadId}`);
      const [enlace] = await tx`SELECT id, origen FROM mejora_actividad_tramites WHERE tramite_id = ${tramiteId}`;
      expect(enlace.origen).toBe("enlazado");

      const quitado = await como(tx, e.b.lider, () => destinoDe(quitarEnlaceDeTramiteAccion(null, formulario({ enlaceId: Number(enlace.id) }))));
      expect(quitado).toBeNull();
      expect(await tx`SELECT 1 FROM mejora_actividad_tramites WHERE tramite_id = ${tramiteId}`).toHaveLength(0);
    }));
});
