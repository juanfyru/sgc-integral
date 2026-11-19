/**
 * La no conformidad de un hallazgo de verificación por el camino de la interfaz (Fase 15B, anexo §7.2 y §10.3): la acción pone la
 * clase y el origen fijos en el envío antes de leerlo, así lo que se fuerce (una observación de un ente de control, que pediría la
 * fecha del ente) no cuenta y se guarda la no conformidad de «Control documental». Con un `FormData` real, contra la BD dentro de una
 * transacción que se revierte (el cliente de la app se sustituye por ella); solo la sesión es de mentira.
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
import { registrarHallazgoAccion } from "@/app/acciones-mejoramiento";
import { obtenerSql } from "@/db/cliente";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { baseDeMejora, datosDeHallazgo, hallazgoDeVerificacion } from "./utiles/mejoramiento";
import { revertida } from "./utiles/transaccion";
import { usuarioDePrueba } from "./utiles/tramites";

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

describe("registrarHallazgoAccion desde un hallazgo de verificación", () => {
  it("lo forzado en el envío no cuenta: se guarda la no conformidad de «Control documental», con su criticidad", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const responsable = await usuarioDePrueba(tx, { rol: "consulta" });
      const vh = await hallazgoDeVerificacion(tx, { responsable, procesos: [b.procesoId] });
      const d = datosDeHallazgo(b.procesoId);
      const campos = {
        clase: "observacion",
        origen: "ente_control",
        criticidad: "media",
        detectadoEn: d.detectadoEn,
        procesoId: String(b.procesoId),
        fuente: d.fuente ?? "",
        titulo: d.titulo,
        descripcion: d.descripcion,
        requisitoClausula: d.requisitoClausula ?? "",
        verificacionHallazgoId: String(vh.id),
        accionJustificacion: "Es la tercera copia obsoleta del año en este punto",
        relacion: "distinto",
      };
      const destino = await como(tx, b.admin, () => registrarHallazgoAccion(null, formulario(campos))).then(
        (r) => r,
        (err: Error) => err.message,
      );
      const [f] = await tx`SELECT id, clase, origen, criticidad, fecha_limite_ente, verificacion_hallazgo_id, accion_requerida
        FROM mejora_hallazgos WHERE verificacion_hallazgo_id = ${vh.id}`;
      expect(destino).toBe(`REDIRECT:/mejoramiento/${f.id}`);
      expect(f).toMatchObject({ clase: "no_conformidad", origen: "control_documental", criticidad: "media", fecha_limite_ente: null, accion_requerida: true });
    }));
});
