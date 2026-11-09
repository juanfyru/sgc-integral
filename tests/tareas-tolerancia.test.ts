/**
 * La vigencia de «Mis tareas» y de la insignia se calcula del estado: si su lectura falla, se registra el error y las
 * demás tareas siguen, sin insignia; ninguna página cae por ella (ronda de corrección 1 de la Tarea 7, R6).
 */
import { describe, expect, it, vi } from "vitest";

const { vigenciaDePersona, tareasDeImpactos } = vi.hoisted(() => ({
  vigenciaDePersona: vi.fn(),
  tareasDeImpactos: vi.fn<(...argumentos: unknown[]) => Promise<unknown[]>>(async () => []),
}));

vi.mock("@/db/consultas/tramites", () => ({ listarTramites: async () => [] }));
vi.mock("@/db/consultas/distribucion/tareas", () => {
  const tarea = { id: "copia:1", modulo: "documentos", titulo: "Confirmar el recibido", detalle: null, vence: null, enlace: "/distribucion/copias/1" };
  return {
    tareasDeCopias: async () => [tarea],
    tareasDeAcuses: async () => [],
    tareasDeSocializacion: async () => [],
    tareasDeVerificacion: async () => [],
    tareasDeHallazgos: async () => [],
  };
});
vi.mock("@/db/consultas/config-documental", async (original) => {
  const real = await original<typeof import("@/db/consultas/config-documental")>();
  return { ...real, obtenerConfigDocumental: async () => real.CONFIG_DOCUMENTAL_DEFECTO };
});
vi.mock("@/db/consultas/vigencia/tareas", () => ({ vigenciaDePersona }));
vi.mock("@/db/consultas/vigencia/externos", () => ({ esResponsableTecnico: async () => false }));
vi.mock("@/db/consultas/normograma/impactos", () => ({ tareasDeImpactos }));

import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { misTareas } from "@/lib/tareas";

const lider = { usuarioId: 1, nombre: "Líder", rol: "lider_proceso", verHistorial: false } as unknown as SesionFlujo;

describe("misTareas sin la vigencia", () => {
  it("si la lectura de la vigencia falla, lo registra y devuelve las demás tareas, sin vencidos", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      vigenciaDePersona.mockRejectedValueOnce(new Error("sin conexión"));
      const r = await misTareas(lider, { responsableTecnico: false });
      expect(r).toEqual({ tareas: [expect.objectContaining({ id: "copia:1" })], total: 1, vencidos: 0 });
      expect(error).toHaveBeenCalledWith(expect.stringContaining("vigencia"), expect.any(Error));
    } finally {
      error.mockRestore();
    }
  });

  it("con la vigencia, suma sus tareas después de las demás y devuelve sus vencidos; las de impactos van al final", async () => {
    const tarea = { id: "vigencia:9", modulo: "documentos" as const, titulo: "Revisar", detalle: null, vence: null, enlace: "/documentos/x" };
    const impacto = { ...tarea, id: "impacto:3:4", enlace: "/normograma/impactos/3?proceso=4" };
    vigenciaDePersona.mockResolvedValueOnce({ tareas: [tarea], vencidos: 4 });
    tareasDeImpactos.mockResolvedValueOnce([impacto]);
    const r = await misTareas(lider, { responsableTecnico: false });
    expect(r.tareas.map((t) => t.id)).toEqual(["copia:1", "vigencia:9", "impacto:3:4"]);
    expect(tareasDeImpactos.mock.lastCall?.[0]).toBe(lider);
    expect(r.vencidos).toBe(4);
    expect(vigenciaDePersona).toHaveBeenLastCalledWith(lider, { responsableTecnico: false }, expect.objectContaining({ config: expect.any(Promise) }));
  });
});
