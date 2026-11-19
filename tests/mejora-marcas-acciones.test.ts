/**
 * El registro que llega desde el panel de la marca de un indicador (Fase 15B, Tarea 8, ronda de corrección; anexo §6.2): la acción
 * no añade una ocurrencia a un parecido, porque así no quedaría la salida de la marca. La ocurrencia se añade en el panel
 * (`resolverConOcurrencia`). Por el camino de la interfaz, con un `FormData` real, contra la BD dentro de una transacción que se
 * revierte (el cliente de la app se sustituye por ella); solo la sesión es de mentira.
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
import { registrarHallazgoAccion } from "@/app/acciones-mejoramiento";
import { obtenerSql } from "@/db/cliente";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { OCURRENCIA_DESDE_EL_PANEL } from "@/lib/mejoramiento/marcas";
import { baseDeMejora, datosDeHallazgo, hallazgoEn, medicionMarcada } from "./utiles/mejoramiento";
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

describe("el registro desde el panel de la marca", () => {
  it("no añade una ocurrencia a un parecido: se rechaza y no se escribe nada; sin el panel, sí la añade", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const mm = await medicionMarcada(tx, { ahora: "2026-11-03T15:00:00Z", analizada: true, procesoId: b.procesoId });
      const parecido = await hallazgoEn(tx, b, "por_aceptar");
      const d = datosDeHallazgo(b.procesoId, { detectadoEn: "2026-11-04" });
      // Los campos como los manda `FormularioHallazgo` desde `?medicion=`: lo fijo con su campo oculto y la medición del panel.
      const campos = {
        clase: d.clase,
        origen: "indicador",
        detectadoEn: d.detectadoEn,
        procesoId: String(b.procesoId),
        criticidad: d.criticidad ?? "",
        titulo: d.titulo,
        descripcion: d.descripcion,
        requisitoClausula: d.requisitoClausula ?? "",
        indicadorId: String(mm.ind.id),
        medicionId: String(mm.medicionId),
        marcaMedicionId: String(mm.medicionId),
        relacion: `ocurrencia:${parecido.id}`,
      };
      const ocurrencias = async () => (await tx`SELECT 1 FROM mejora_ocurrencias WHERE hallazgo_id = ${parecido.id}`).length;

      const rechazo = await como(tx, b.admin, () => registrarHallazgoAccion(null, formulario(campos)));
      expect(rechazo).toMatchObject({ ok: false, error: OCURRENCIA_DESDE_EL_PANEL });
      expect(await ocurrencias()).toBe(0);
      expect(await tx`SELECT 1 FROM mejora_marcas WHERE medicion_id = ${mm.medicionId}`).toHaveLength(0);

      // El mismo envío sin la medición del panel añade la ocurrencia, como en la 15A.
      const porFuera: Record<string, string> = { ...campos };
      delete porFuera.marcaMedicionId;
      const destino = await como(tx, b.admin, () => registrarHallazgoAccion(null, formulario(porFuera))).then(
        () => "sin redirección",
        (err: Error) => err.message,
      );
      expect(destino).toBe(`REDIRECT:/mejoramiento/${parecido.id}`);
      expect(await ocurrencias()).toBe(1);
    }));
});
