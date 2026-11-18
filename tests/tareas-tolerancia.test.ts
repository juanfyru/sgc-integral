/**
 * La vigencia de «Mis tareas» y de la insignia se calcula del estado: si su lectura falla, se registra el error y las
 * demás tareas siguen, sin insignia; ninguna página cae por ella (ronda de corrección 1 de la Tarea 7, R6). Lo mismo
 * las de los indicadores y su insignia (Fase 14A, Tarea 13) y las de mejoramiento, que no tienen insignia (Fase 15A, Tarea 19).
 */
import { describe, expect, it, vi } from "vitest";

const { vigenciaDePersona, tareasDeImpactos, tareasDeIndicadores, tareasDeMejoramiento, tareasDeRevision } = vi.hoisted(() => ({
  vigenciaDePersona: vi.fn(),
  tareasDeIndicadores: vi.fn<(...argumentos: unknown[]) => Promise<{ tareas: unknown[]; vencidas: number }>>(async () => ({ tareas: [], vencidas: 0 })),
  tareasDeMejoramiento: vi.fn<(...argumentos: unknown[]) => Promise<{ tareas: unknown[] }>>(async () => ({ tareas: [] })),
  tareasDeImpactos: vi.fn<(...argumentos: unknown[]) => Promise<unknown[]>>(async () => []),
  tareasDeRevision: vi.fn<(...argumentos: unknown[]) => Promise<unknown[]>>(async () => []),
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
    tareasDeValidacion: async () => [],
  };
});
vi.mock("@/db/consultas/config-documental", async (original) => {
  const real = await original<typeof import("@/db/consultas/config-documental")>();
  return { ...real, obtenerConfigDocumental: async () => real.CONFIG_DOCUMENTAL_DEFECTO };
});
vi.mock("@/db/consultas/vigencia/tareas", () => ({ vigenciaDePersona }));
vi.mock("@/db/consultas/vigencia/externos", () => ({ esResponsableTecnico: async () => false }));
vi.mock("@/db/consultas/normograma/impactos", () => ({ tareasDeImpactos }));
vi.mock("@/db/consultas/vigencia/revision-anual/tareas", () => ({ tareasDeRevision }));
vi.mock("@/db/consultas/indicadores/tareas", () => ({ tareasDeIndicadores }));
vi.mock("@/db/consultas/mejoramiento/tareas", () => ({ tareasDeMejoramiento }));

import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { misTareas } from "@/lib/tareas";

const lider = { usuarioId: 1, nombre: "Líder", rol: "lider_proceso", verHistorial: false } as unknown as SesionFlujo;

describe("misTareas sin la vigencia", () => {
  it("si la lectura de la vigencia falla, lo registra y devuelve las demás tareas, sin vencidos", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      vigenciaDePersona.mockRejectedValueOnce(new Error("sin conexión"));
      const r = await misTareas(lider, { responsableTecnico: false });
      expect(r).toEqual({ tareas: [expect.objectContaining({ id: "copia:1" })], total: 1, vencidos: 0, vencidasIndicadores: 0 });
      expect(error).toHaveBeenCalledWith(expect.stringContaining("vigencia"), expect.any(Error));
    } finally {
      error.mockRestore();
    }
  });

  it("con la vigencia, suma sus tareas después de las demás y devuelve sus vencidos; las de la campaña y las de impactos van al final", async () => {
    const tarea = { id: "vigencia:9", modulo: "documentos" as const, titulo: "Revisar", detalle: null, vence: null, enlace: "/documentos/x" };
    const revision = { ...tarea, id: "revision:2:4", enlace: "/vigencia/revision-anual?proceso=4" };
    const impacto = { ...tarea, id: "impacto:3:4", enlace: "/normograma/impactos/3?proceso=4" };
    vigenciaDePersona.mockResolvedValueOnce({ tareas: [tarea], vencidos: 4 });
    tareasDeRevision.mockResolvedValueOnce([revision]);
    tareasDeImpactos.mockResolvedValueOnce([impacto]);
    const r = await misTareas(lider, { responsableTecnico: false });
    expect(r.tareas.map((t) => t.id)).toEqual(["copia:1", "vigencia:9", "revision:2:4", "impacto:3:4"]);
    expect(tareasDeRevision.mock.lastCall?.[0]).toBe(lider);
    expect(tareasDeImpactos.mock.lastCall?.[0]).toBe(lider);
    expect(r.vencidos).toBe(4);
    expect(vigenciaDePersona).toHaveBeenLastCalledWith(lider, { responsableTecnico: false }, expect.objectContaining({ config: expect.any(Promise) }));
  });
});

describe("misTareas sin los indicadores", () => {
  it("si las tareas de indicadores fallan, lo registra y devuelve las demás, sin su insignia", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      vigenciaDePersona.mockResolvedValueOnce({ tareas: [], vencidos: 2 });
      tareasDeIndicadores.mockRejectedValueOnce(new Error("sin conexión"));
      const r = await misTareas(lider, { responsableTecnico: false });
      expect(r).toEqual({ tareas: [expect.objectContaining({ id: "copia:1" })], total: 1, vencidos: 2, vencidasIndicadores: 0 });
      expect(error).toHaveBeenCalledWith(expect.stringContaining("indicadores"), expect.any(Error));
    } finally {
      error.mockRestore();
    }
  });

  it("con los indicadores, suma sus tareas al final y devuelve sus vencidas", async () => {
    const medir = { id: "medir:7", modulo: "indicadores" as const, titulo: "Reportar", detalle: null, vence: null, enlace: "/indicadores/x/reportar/2026-T3" };
    vigenciaDePersona.mockResolvedValueOnce({ tareas: [], vencidos: 0 });
    tareasDeIndicadores.mockResolvedValueOnce({ tareas: [medir], vencidas: 3 });
    const r = await misTareas(lider, { responsableTecnico: false });
    expect(r.tareas.map((t) => t.id)).toEqual(["copia:1", "medir:7"]);
    expect(r.vencidasIndicadores).toBe(3);
    expect(tareasDeIndicadores.mock.lastCall?.[0]).toBe(lider);
  });
});

describe("misTareas sin mejoramiento", () => {
  it("si las tareas de mejoramiento fallan, lo registra y devuelve las demás", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      vigenciaDePersona.mockResolvedValueOnce({ tareas: [], vencidos: 1 });
      tareasDeMejoramiento.mockRejectedValueOnce(new Error("sin conexión"));
      const r = await misTareas(lider, { responsableTecnico: false });
      expect(r).toEqual({ tareas: [expect.objectContaining({ id: "copia:1" })], total: 1, vencidos: 1, vencidasIndicadores: 0 });
      expect(error).toHaveBeenCalledWith(expect.stringContaining("mejoramiento"), expect.any(Error));
    } finally {
      error.mockRestore();
    }
  });

  it("con mejoramiento, suma sus tareas al final, después de las de indicadores", async () => {
    const medir = { id: "medir:7", modulo: "indicadores" as const, titulo: "Reportar", detalle: null, vence: null, enlace: "/indicadores/x/reportar/2026-T3" };
    const corregir = { id: "mej-corregir:4", modulo: "planes" as const, titulo: "Registrar la corrección de HZ-2026-004", detalle: null, vence: null, enlace: "/mejoramiento/4" };
    vigenciaDePersona.mockResolvedValueOnce({ tareas: [], vencidos: 0 });
    tareasDeIndicadores.mockResolvedValueOnce({ tareas: [medir], vencidas: 0 });
    tareasDeMejoramiento.mockResolvedValueOnce({ tareas: [corregir] });
    const r = await misTareas(lider, { responsableTecnico: false });
    expect(r.tareas.map((t) => t.id)).toEqual(["copia:1", "medir:7", "mej-corregir:4"]);
    expect(tareasDeMejoramiento.mock.lastCall?.[0]).toBe(lider);
  });
});
