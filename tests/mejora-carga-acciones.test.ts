/**
 * «Ya está en curso» por el camino de la interfaz (Fase 15A, Tarea 20): `cargarHallazgoAccion` con un `FormData` armado como lo
 * manda `FormularioCarga` (la identificación plana, las causas y las acciones en JSON, los criterios repetidos y la aprobación en
 * papel), contra la BD dentro de una transacción que se revierte; solo la sesión es de mentira. El permiso, los dos esquemas
 * estrictos, el mensaje de una fila con su etiqueta y el regreso a la página del hallazgo.
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
import { cargarHallazgoAccion } from "@/app/acciones-mejoramiento";
import { obtenerSql } from "@/db/cliente";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { baseDeMejora, type BaseDeMejora } from "./utiles/mejoramiento";
import { revertida } from "./utiles/transaccion";

const sql = obtenerSql();
afterAll(async () => {
  await sql.end();
  globalThis.__sql = undefined;
});

beforeEach(() => {
  vi.clearAllMocks();
});

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

type Actividad = { descripcion: string; responsableId: number; inicio: string; fin: string; avance: number; terminadaEn: string | null };

/** Lo que manda `FormularioCarga` de una no conformidad media (las fechas del papel, de 2025: el reloj de la acción es el real). */
function formulario(
  b: BaseDeMejora,
  x?: { actividades?: Actividad[]; causas?: string[]; causasDeLaAccion?: number[]; extra?: Record<string, string> },
): FormData {
  const datos = new FormData();
  const planos: Record<string, string> = {
    clase: "no_conformidad",
    origen: "auditoria_interna",
    detectadoEn: "2025-10-06",
    registradoEnPapel: "2025-10-08",
    procesoId: String(b.procesoId),
    criticidad: "media",
    fuente: "Auditoría interna de octubre",
    titulo: "Formatos de entrega de turno sin diligenciar",
    descripcion: "En la revisión de tres turnos se encontraron los formatos de entrega sin diligenciar.",
    requisitoClausula: "7.5.3",
    correccionRequerida: "si",
    correccionDescripcion: "Se diligenciaron los formatos pendientes con el turno",
    correccionImplementadaEn: "2025-10-15",
    analisisMetodo: "cinco_porques",
    causas: JSON.stringify(x?.causas ?? ["El procedimiento no asigna el registro al turno de noche"]),
    acciones: JSON.stringify([
      {
        tipo: "correctiva",
        descripcion: "Actualizar el procedimiento de entrega de turno",
        causas: x?.causasDeLaAccion ?? [1],
        actividades: x?.actividades ?? [
          { descripcion: "Redactar la versión nueva", responsableId: b.lider.usuarioId, inicio: "2025-11-05", fin: "2026-01-30", avance: 100, terminadaEn: "2026-01-28" },
          { descripcion: "Capacitar a los turnos de noche", responsableId: b.lider.usuarioId, inicio: "2026-02-01", fin: "2026-12-15", avance: 40, terminadaEn: null },
        ],
      },
    ]),
    aprobacionNombre: "Marta Ríos",
    aprobacionCargo: "Coordinadora del SGC",
    aprobacionFecha: "2025-11-04",
    aprobacionRol: "admin_sgc",
    ...x?.extra,
  };
  for (const [campo, valor] of Object.entries(planos)) datos.append(campo, valor);
  // Las casillas del criterio llegan repetidas.
  datos.append("criterios", "no_recurrencia");
  datos.append("criterios", "reduccion_pqrs");
  return datos;
}

describe("cargarHallazgoAccion", () => {
  it("el Admin SGC carga el hallazgo y vuelve a su página; Control Interno no", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      expect(await como(tx, b.control, () => destino(cargarHallazgoAccion(null, formulario(b))))).toMatchObject({
        ok: false,
        error: "Sin permiso para esta acción",
      });
      const fue = await como(tx, b.admin, () => destino(cargarHallazgoAccion(null, formulario(b))));
      expect(fue).toMatch(/^REDIRECT:\/mejoramiento\/\d+$/);
      const id = Number(String(fue).split("/").pop());
      const [h] = await tx`SELECT estado, cargado, codigo FROM mejora_hallazgos WHERE id = ${id}`;
      expect(h).toMatchObject({ estado: "en_ejecucion", cargado: true });
      const [r] = await tx`SELECT criterios, aprobado_fuera, aprobado_rol FROM mejora_rondas WHERE hallazgo_id = ${id}`;
      expect(r).toEqual({ criterios: ["no_recurrencia", "reduccion_pqrs"], aprobado_fuera: "Marta Ríos, Coordinadora del SGC", aprobado_rol: "admin_sgc" });
      const fuera = await tx`SELECT tipo FROM mejora_eventos WHERE hallazgo_id = ${id} AND fuera ORDER BY ocurrio_en, id`;
      expect(fuera.map((e) => e.tipo)).toEqual(["registrar", "corregir", "aprobar_plan"]);
      const actividades = await tx`SELECT estado, avance FROM mejora_actividades WHERE hallazgo_id = ${id} ORDER BY id`;
      expect(actividades).toEqual([
        { estado: "terminada", avance: 100 },
        { estado: "en_proceso", avance: 40 },
      ]);
    }));

  it("una fila mal escrita dice cuál es, y un campo que el formulario no manda se rechaza", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const sinFecha = formulario(b, {
        actividades: [{ descripcion: "Redactar la versión nueva", responsableId: b.lider.usuarioId, inicio: "2025-11-05", fin: "2026-01-30", avance: 100, terminadaEn: null }],
      });
      expect(await como(tx, b.admin, () => destino(cargarHallazgoAccion(null, sinFecha)))).toMatchObject({
        ok: false,
        error: "Escriba la fecha en que terminó la actividad A1.1",
      });
      expect(await como(tx, b.admin, () => destino(cargarHallazgoAccion(null, formulario(b, { extra: { nota: "no va" } }))))).toMatchObject({
        ok: false,
        error: expect.stringContaining("nota"),
      });
      expect(await tx`SELECT id FROM mejora_hallazgos WHERE proceso_id = ${b.procesoId}`).toHaveLength(0);
    }));

  it("una causa intermedia vacía se rechaza con su número y no corre las demás", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      // La acción ataca la causa 3: si el formulario quitara la vacía, la 3 pasaría a ser la 2 sin que nadie lo viera.
      const conHueco = formulario(b, {
        causas: ["El procedimiento no asigna el registro al turno de noche", "", "No hay formato de entrega en la sala de urgencias"],
        causasDeLaAccion: [1, 3],
      });
      expect(await como(tx, b.admin, () => destino(cargarHallazgoAccion(null, conHueco)))).toMatchObject({
        ok: false,
        error: "La causa 2 debe tener al menos 3 caracteres",
      });
      expect(await tx`SELECT id FROM mejora_hallazgos WHERE proceso_id = ${b.procesoId}`).toHaveLength(0);
      expect(await tx`SELECT c.id FROM mejora_causas c JOIN mejora_hallazgos h ON h.id = c.hallazgo_id WHERE h.proceso_id = ${b.procesoId}`).toHaveLength(0);
    }));
});
