/**
 * Frontera de las acciones del trámite: qué le llega a `transicionar` y qué recibe el
 * formulario. El dominio se prueba contra la BD en tramites-solicitud.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { transicionar, crearSolicitud, redirect, requerirSesion } = vi.hoisted(() => ({
  transicionar: vi.fn(),
  crearSolicitud: vi.fn(),
  redirect: vi.fn((destino: string) => {
    throw new Error(`REDIRECT:${destino}`);
  }),
  requerirSesion: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/sesion-actual", () => ({ requerirSesion }));
vi.mock("@/db/consultas/tramites-flujo", async () => ({
  ...(await vi.importActual<typeof import("@/db/consultas/flujo/contrato")>("@/db/consultas/flujo/contrato")),
  transicionar,
  crearSolicitud,
}));

import {
  crearSolicitudAccion,
  darVistoBuenoAccion,
  negarVistoBuenoAccion,
  retirarSolicitudAccion,
} from "@/app/acciones-tramites";
import { ErrorFirma, ErrorTramite } from "@/db/consultas/flujo/contrato";

const formulario = (campos: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(campos)) fd.set(k, v);
  return fd;
};
const ocultos = { id: "7", etapa: "visto_bueno", ronda: "0" };

beforeEach(() => {
  vi.clearAllMocks();
  requerirSesion.mockResolvedValue({ sesionId: "s", usuarioId: 1, usuario: "lider", nombre: "Líder", rol: "lider_proceso", verHistorial: false });
  transicionar.mockResolvedValue({ etapa: "aceptacion", ronda: 0 });
});

describe("acciones del trámite", () => {
  it("una acción envía el trámite, la etapa y la ronda que vio la persona", async () => {
    expect(await darVistoBuenoAccion(null, formulario(ocultos))).toBeNull();
    const [sesion, entrada] = transicionar.mock.calls[0];
    expect(sesion.usuarioId).toBe(1);
    expect(entrada).toEqual({ tramiteId: 7, accion: "dar_visto_bueno", etapaEsperada: "visto_bueno", rondaEsperada: 0 });
  });

  it("negar lee el motivo con su esquema; uno corto vuelve al formulario sin transicionar", async () => {
    const corto = await negarVistoBuenoAccion(null, formulario({ ...ocultos, motivo: "no" }));
    expect(corto).toMatchObject({ ok: false, valores: { motivo: "no" } });
    expect(transicionar).not.toHaveBeenCalled();
    await negarVistoBuenoAccion(null, formulario({ ...ocultos, motivo: "  No corresponde.  " }));
    expect(transicionar.mock.calls[0][1]).toMatchObject({ accion: "negar_visto_bueno", datos: { motivo: "No corresponde." } });
  });

  it.each([
    ["etapa desconocida", { ...ocultos, etapa: "inventada" }],
    ["sin etapa", { id: "7", ronda: "0" }],
    ["ronda vacía", { ...ocultos, ronda: "" }],
    ["ronda negativa", { ...ocultos, ronda: "-1" }],
    ["sin id", { etapa: "visto_bueno", ronda: "0" }],
  ])("%s no llega a transicionar", async (_nombre, campos) => {
    expect(await retirarSolicitudAccion(null, formulario(campos))).toMatchObject({ ok: false });
    expect(transicionar).not.toHaveBeenCalled();
  });

  it("un error de negocio vuelve al formulario", async () => {
    transicionar.mockRejectedValue(new ErrorTramite("Este trámite cambió mientras lo tenía abierto. Recargue la página."));
    expect(await retirarSolicitudAccion(null, formulario(ocultos))).toMatchObject({ ok: false, error: expect.stringMatching(/cambió mientras/) });
  });

  it("una firma fallida vuelve al formulario; si cerró la sesión, lleva a /ingreso", async () => {
    transicionar.mockRejectedValue(new ErrorFirma("Clave o código incorrectos", false));
    expect(await darVistoBuenoAccion(null, formulario(ocultos))).toMatchObject({ ok: false, error: "Clave o código incorrectos" });
    expect(redirect).not.toHaveBeenCalled();
    transicionar.mockRejectedValue(new ErrorFirma("Clave o código incorrectos", true));
    await expect(darVistoBuenoAccion(null, formulario(ocultos))).rejects.toThrow("REDIRECT:/ingreso");
  });

  it("sin el permiso no llega a transicionar", async () => {
    requerirSesion.mockResolvedValue({ sesionId: "s", usuarioId: 2, usuario: "c", nombre: "C", rol: "consulta", verHistorial: false });
    expect(await darVistoBuenoAccion(null, formulario(ocultos))).toMatchObject({ ok: false });
    expect(await retirarSolicitudAccion(null, formulario(ocultos))).toMatchObject({ ok: false });
    expect(await crearSolicitudAccion(null, formulario({}))).toMatchObject({ ok: false });
    expect(transicionar).not.toHaveBeenCalled();
    expect(crearSolicitud).not.toHaveBeenCalled();
  });

  it("crear valida la solicitud y lleva a su página", async () => {
    crearSolicitud.mockResolvedValue({ tramiteId: 12, numero: "SOL-2026-001", etapa: "aceptacion" });
    const campos = { tipo: "modificar", motivo: "mejora", justificacion: "Se añade la inducción.", documentoId: "9" };
    await expect(crearSolicitudAccion(null, formulario(campos))).rejects.toThrow("REDIRECT:/tramites/12");
    expect(crearSolicitud.mock.calls[0][1]).toEqual({ tipo: "modificar", motivo: "mejora", justificacion: "Se añade la inducción.", documentoId: 9 });
    expect(await crearSolicitudAccion(null, formulario({ ...campos, justificacion: "corta" }))).toMatchObject({ ok: false });
    expect(await crearSolicitudAccion(null, formulario({ ...campos, sobra: "x" }))).toMatchObject({ ok: false });
    expect(crearSolicitud).toHaveBeenCalledTimes(1);
  });
});
