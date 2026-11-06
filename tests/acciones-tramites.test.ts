/**
 * Frontera de las acciones del trámite: qué le llega a `transicionar` y qué recibe el
 * formulario. El dominio se prueba contra la BD en tramites-solicitud.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { transicionar, crearSolicitud, obtenerTramite, guardarControlCambios, contextoDePeticion, redirect, requerirSesion } = vi.hoisted(() => ({
  transicionar: vi.fn(),
  crearSolicitud: vi.fn(),
  obtenerTramite: vi.fn(),
  guardarControlCambios: vi.fn(),
  contextoDePeticion: vi.fn(),
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
vi.mock("@/db/consultas/tramites", () => ({ obtenerTramite }));
vi.mock("@/db/consultas/tramites-archivos", () => ({ guardarControlCambios }));
vi.mock("@/lib/contexto-peticion", () => ({ contextoDePeticion }));

import {
  aceptarSolicitudAccion,
  crearSolicitudAccion,
  darVistoBuenoAccion,
  enviarARevisionAccion,
  guardarControlCambiosAccion,
  negarVistoBuenoAccion,
  rechazarSolicitudAccion,
  retirarSolicitudAccion,
} from "@/app/acciones-tramites";
import { valoresDeFormulario } from "@/app/admin/comun";
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

describe("aceptar y rechazar", () => {
  const enAceptacion = { id: "7", etapa: "aceptacion", ronda: "0" };
  const responsables = { elaboradorId: "2", revisorId: "3", aprobadorId: "4", venceElaboracion: "2026-11-20" };
  const nuevo = { decision: "nuevo", tipoDocumentoId: "5", principal: "p:2", titulo: "Formato nuevo", nivelAcceso: "general", codigo: "cex-fo-01", ...responsables };

  beforeEach(() => {
    requerirSesion.mockResolvedValue({ sesionId: "s", usuarioId: 1, usuario: "admin", nombre: "Admin", rol: "admin_sgc", verHistorial: false });
    transicionar.mockResolvedValue({ etapa: "elaboracion", ronda: 1 });
  });

  const tramiteDe = (tipo: string) => ({ tipo, etapa: "aceptacion", ronda: 0 });

  it("una creación llega a transicionar leída por su esquema", async () => {
    obtenerTramite.mockResolvedValue(tramiteDe("crear"));
    const fd = formulario({ ...enAceptacion, ...nuevo });
    fd.append("asociaciones", "s:9");
    fd.append("asociaciones", "p:3");
    fd.append("relacionados", "11");
    expect(await aceptarSolicitudAccion(null, fd)).toBeNull();
    const [, entrada] = transicionar.mock.calls[0];
    expect(entrada).toMatchObject({ tramiteId: 7, accion: "aceptar", etapaEsperada: "aceptacion", rondaEsperada: 0 });
    expect(entrada.datos).toEqual({
      decision: "nuevo",
      tipoDocumentoId: 5,
      asociaciones: [{ procesoId: 2, esPrincipal: true }, { subprocesoId: 9, esPrincipal: false }, { procesoId: 3, esPrincipal: false }],
      titulo: "Formato nuevo",
      relacionados: [11],
      nivelAcceso: "general",
      codigo: "CEX-FO-01",
      elaboradorId: 2,
      revisorId: 3,
      aprobadorId: 4,
      venceElaboracion: "2026-11-20",
    });
  });

  it("el esquema sale del tipo real del trámite, no de lo que diga el formulario", async () => {
    obtenerTramite.mockResolvedValue(tramiteDe("eliminar"));
    expect(await aceptarSolicitudAccion(null, formulario({ ...enAceptacion, ...nuevo }))).toMatchObject({ ok: false });
    expect(transicionar).not.toHaveBeenCalled();
    expect(await aceptarSolicitudAccion(null, formulario({ ...enAceptacion, aprobadorId: "4" }))).toBeNull();
    expect(transicionar.mock.calls[0][1].datos).toEqual({ aprobadorId: 4 });

    transicionar.mockClear();
    obtenerTramite.mockResolvedValue(tramiteDe("modificar"));
    expect(await aceptarSolicitudAccion(null, formulario({ ...enAceptacion, ...responsables, tituloNuevo: "  Otro título  " }))).toBeNull();
    expect(transicionar.mock.calls[0][1].datos).toEqual({ tituloNuevo: "Otro título", elaboradorId: 2, revisorId: 3, aprobadorId: 4, venceElaboracion: "2026-11-20" });
  });

  it("si otro administrador ya lo convirtió, dice que cambió y no que sobran campos", async () => {
    obtenerTramite.mockResolvedValue({ tipo: "modificar", etapa: "elaboracion", ronda: 1 });
    expect(await aceptarSolicitudAccion(null, formulario({ ...enAceptacion, ...nuevo }))).toMatchObject({
      ok: false,
      error: "Este trámite cambió mientras lo tenía abierto. Recargue la página.",
    });
    expect(transicionar).not.toHaveBeenCalled();
  });

  it("el código que propuso el sistema viaja con el formulario", async () => {
    obtenerTramite.mockResolvedValue(tramiteDe("crear"));
    expect(await aceptarSolicitudAccion(null, formulario({ ...enAceptacion, ...nuevo, codigoSugerido: "cex-fo-01" }))).toBeNull();
    expect(transicionar.mock.calls[0][1].datos).toMatchObject({ codigo: "CEX-FO-01", codigoSugerido: "CEX-FO-01" });
  });

  it("un trámite que quien acepta no ve no llega a transicionar", async () => {
    obtenerTramite.mockResolvedValue(null);
    expect(await aceptarSolicitudAccion(null, formulario({ ...enAceptacion, ...nuevo }))).toMatchObject({ ok: false, error: "El trámite no existe" });
    expect(transicionar).not.toHaveBeenCalled();
  });

  it("rechazar exige un motivo", async () => {
    expect(await rechazarSolicitudAccion(null, formulario({ ...enAceptacion, motivo: "no" }))).toMatchObject({ ok: false, valores: { motivo: "no" } });
    expect(transicionar).not.toHaveBeenCalled();
    expect(await rechazarSolicitudAccion(null, formulario({ ...enAceptacion, motivo: "  Ya existe CEX-FO-02.  " }))).toBeNull();
    expect(transicionar.mock.calls[0][1]).toMatchObject({ accion: "rechazar", datos: { motivo: "Ya existe CEX-FO-02." } });
  });

  it("sin tramites.gestionar no aceptan ni rechazan", async () => {
    requerirSesion.mockResolvedValue({ sesionId: "s", usuarioId: 2, usuario: "l", nombre: "L", rol: "lider_proceso", verHistorial: false });
    expect(await aceptarSolicitudAccion(null, formulario({ ...enAceptacion, ...nuevo }))).toMatchObject({ ok: false });
    expect(await rechazarSolicitudAccion(null, formulario({ ...enAceptacion, motivo: "No procede." }))).toMatchObject({ ok: false });
    expect(obtenerTramite).not.toHaveBeenCalled();
    expect(transicionar).not.toHaveBeenCalled();
  });
});

describe("elaboración", () => {
  const enElaboracion = { id: "7", etapa: "elaboracion", ronda: "1" };
  const elaborador = (usuarioId = 1) => ({ sesionId: "s", usuarioId, usuario: "c", nombre: "Elabora", rol: "consulta", verHistorial: false });

  beforeEach(() => {
    requerirSesion.mockResolvedValue(elaborador());
    contextoDePeticion.mockResolvedValue({ ip: "10.0.0.5", userAgent: "Navegador" });
    transicionar.mockResolvedValue({ etapa: "revision", ronda: 1 });
  });

  it("enviar a revisión lleva la clave sin recortar, el código y el contexto de la petición", async () => {
    expect(await enviarARevisionAccion(null, formulario({ ...enElaboracion, clave: " con espacios ", codigo: " 123456 " }))).toBeNull();
    const [, entrada, opciones] = transicionar.mock.calls[0];
    expect(entrada).toEqual({
      tramiteId: 7,
      accion: "enviar_a_revision",
      etapaEsperada: "elaboracion",
      rondaEsperada: 1,
      credenciales: { clave: " con espacios ", codigo: "123456" },
    });
    expect(opciones).toEqual({ contexto: { ip: "10.0.0.5", userAgent: "Navegador" } });
  });

  it("sin segundo factor no hay código", async () => {
    await enviarARevisionAccion(null, formulario({ ...enElaboracion, clave: "secreta", codigo: "" }));
    expect(transicionar.mock.calls[0][1].credenciales).toEqual({ clave: "secreta" });
  });

  it("sin clave, o con un campo de más, no llega a transicionar", async () => {
    expect(await enviarARevisionAccion(null, formulario(enElaboracion))).toMatchObject({ ok: false });
    expect(await enviarARevisionAccion(null, formulario({ ...enElaboracion, clave: "secreta", sobra: "x" }))).toMatchObject({ ok: false });
    expect(transicionar).not.toHaveBeenCalled();
  });

  it("una firma que cierra la sesión lleva a /ingreso", async () => {
    transicionar.mockRejectedValue(new ErrorFirma("Clave o código incorrectos", true));
    await expect(enviarARevisionAccion(null, formulario({ ...enElaboracion, clave: "mala" }))).rejects.toThrow("REDIRECT:/ingreso");
  });

  describe("la clave y el código no vuelven al navegador", () => {
    const campos = { ...enElaboracion, clave: "secreta-1", codigo: "998877" };
    const sinSecretos = (estado: unknown) => {
      expect(estado).toMatchObject({ ok: false });
      expect(JSON.stringify(estado)).not.toMatch(/secreta-1|998877/);
    };

    it("ni tras una firma rechazada", async () => {
      transicionar.mockRejectedValue(new ErrorFirma("Clave o código incorrectos", false));
      const estado = await enviarARevisionAccion(null, formulario(campos));
      sinSecretos(estado);
      expect(estado).toMatchObject({ error: "Clave o código incorrectos", valores: { id: "7" } });
    });

    it("ni aunque una acción se olvide de separarlos", async () => {
      expect(valoresDeFormulario(formulario(campos))).toEqual({ id: "7", etapa: "elaboracion", ronda: "1" });
      sinSecretos(await negarVistoBuenoAccion(null, formulario({ ...ocultos, ...campos, motivo: "No corresponde." })));
    });

    it("el código de un documento, sin clave al lado, sí vuelve: no es una credencial", () => {
      expect(valoresDeFormulario(formulario({ codigo: "GTH-PR-09", titulo: "Procedimiento" })))
        .toEqual({ codigo: "GTH-PR-09", titulo: "Procedimiento" });
    });

    it("ni si el formulario no pasa el esquema", async () => {
      sinSecretos(await enviarARevisionAccion(null, formulario({ ...campos, sobra: "x" })));
      sinSecretos(await enviarARevisionAccion(null, formulario({ ...enElaboracion, clave: "secreta-1", codigo: "12" })));
    });

    it("ni si se pasó del límite de ritmo", async () => {
      requerirSesion.mockResolvedValue(elaborador(4242));
      for (let i = 0; i < 60; i++) await enviarARevisionAccion(null, formulario(campos));
      const limitada = await enviarARevisionAccion(null, formulario(campos));
      sinSecretos(limitada);
      expect(limitada).toMatchObject({ error: expect.stringMatching(/Demasiadas operaciones/) });
    });
  });

  it("solo pide el contexto de la petición quien firma", async () => {
    requerirSesion.mockResolvedValue({ ...elaborador(), rol: "lider_proceso" });
    await retirarSolicitudAccion(null, formulario({ id: "7", etapa: "aceptacion", ronda: "0" }));
    expect(transicionar).toHaveBeenCalledOnce();
    expect(contextoDePeticion).not.toHaveBeenCalled();
  });

  it("guardar el control de cambios lee el texto con su esquema", async () => {
    expect(await guardarControlCambiosAccion(null, formulario({ ...enElaboracion, resumenCambios: "  Se añade la inducción.  " }))).toBeNull();
    expect(guardarControlCambios.mock.calls[0][0]).toBe(7);
    expect(guardarControlCambios.mock.calls[0][1].usuarioId).toBe(1);
    expect(guardarControlCambios.mock.calls[0][2]).toBe("Se añade la inducción.");
  });

  it("un control de cambios vacío o con campos de más vuelve con lo escrito", async () => {
    expect(await guardarControlCambiosAccion(null, formulario({ ...enElaboracion, resumenCambios: "   " }))).toMatchObject({ ok: false });
    expect(await guardarControlCambiosAccion(null, formulario({ ...enElaboracion, resumenCambios: "Corto" , sobra: "x" })))
      .toMatchObject({ ok: false, valores: { resumenCambios: "Corto" } });
    expect(guardarControlCambios).not.toHaveBeenCalled();
  });
});
