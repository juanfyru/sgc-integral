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

const revision = vi.hoisted(() => ({
  guardarVerificacion: vi.fn(),
  crearObservacion: vi.fn(),
  cerrarObservacion: vi.fn(),
  reabrirObservacion: vi.fn(),
  responderObservacion: vi.fn(),
}));
vi.mock("@/db/consultas/revision", () => revision);

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
  aprobarAccion,
  aprobarYPublicarAccion,
  cerrarObservacionAccion,
  conceptoFavorableAccion,
  crearObservacionAccion,
  crearSolicitudAccion,
  devolverAprobacionAccion,
  devolverRevisionAccion,
  guardarVerificacionAccion,
  reabrirObservacionAccion,
  responderObservacionAccion,
  darVistoBuenoAccion,
  enviarARevisionAccion,
  guardarControlCambiosAccion,
  negarEliminacionAccion,
  negarVistoBuenoAccion,
  publicarTramiteAccion,
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

  describe("revisión", () => {
    const enRevision = { id: "7", etapa: "revision", ronda: "2" };
    const revisor = { sesionId: "s", usuarioId: 9, usuario: "r", nombre: "Revisa", rol: "lider_proceso", verHistorial: false };

    it("guardar la lista lee un resultado por ítem, con su nota, y lleva la etapa y la ronda que vio la persona", async () => {
      requerirSesion.mockResolvedValue(revisor);
      const campos = { ...enRevision, resultado_4: "cumple", resultado_5: "no_cumple", nota_5: "  Falta la fecha.  ", nota_6: "" };
      expect(await guardarVerificacionAccion(null, formulario(campos))).toBeNull();
      expect(revision.guardarVerificacion.mock.calls[0][0]).toBe(7);
      expect(revision.guardarVerificacion.mock.calls[0][2]).toEqual([
        { itemId: 4, resultado: "cumple" },
        { itemId: 5, resultado: "no_cumple", nota: "Falta la fecha." },
      ]);
      expect(revision.guardarVerificacion.mock.calls[0][3]).toEqual({ etapa: "revision", ronda: 2 });
    });

    it("una nota sin resultado no se descarta en silencio", async () => {
      requerirSesion.mockResolvedValue(revisor);
      const estado = await guardarVerificacionAccion(null, formulario({ ...enRevision, resultado_4: "cumple", nota_6: "Una nota suelta." }));
      expect(estado).toMatchObject({ ok: false, error: "Elija un resultado para guardar la nota" });
      expect(revision.guardarVerificacion).not.toHaveBeenCalled();
    });

    it("una lista vacía, un resultado inventado o un campo ajeno no llegan a guardarse", async () => {
      requerirSesion.mockResolvedValue(revisor);
      expect(await guardarVerificacionAccion(null, formulario(enRevision))).toMatchObject({ ok: false });
      expect(await guardarVerificacionAccion(null, formulario({ ...enRevision, resultado_4: "tal vez" }))).toMatchObject({ ok: false });
      expect(await guardarVerificacionAccion(null, formulario({ ...enRevision, resultado_4: "cumple", sobra: "x" }))).toMatchObject({ ok: false });
      expect(revision.guardarVerificacion).not.toHaveBeenCalled();
    });

    it("crear, cerrar, reabrir y responder piden el permiso de su paso", async () => {
      requerirSesion.mockResolvedValue({ ...elaborador(), rol: "consulta" });
      for (const accion of [crearObservacionAccion, cerrarObservacionAccion, reabrirObservacionAccion, devolverRevisionAccion])
        expect(await accion(null, formulario({ ...enRevision, observacionId: "3", texto: "Una observación.", nota: "Una nota." }))).toMatchObject({ ok: false });
      expect(revision.crearObservacion).not.toHaveBeenCalled();
      expect(revision.cerrarObservacion).not.toHaveBeenCalled();
      expect(revision.reabrirObservacion).not.toHaveBeenCalled();
      expect(transicionar).not.toHaveBeenCalled();

      expect(await responderObservacionAccion(null, formulario({ ...enRevision, observacionId: "3", respuesta: " Atendida en el texto. " }))).toBeNull();
      expect(revision.responderObservacion.mock.calls[0].slice(0, 3)).toEqual([3, expect.objectContaining({ usuarioId: 1 }), "Atendida en el texto."]);
      expect(revision.responderObservacion.mock.calls[0][3]).toEqual({ etapa: "revision", ronda: 2 });
    });

    it("el revisor crea, cierra y reabre por el id de la observación", async () => {
      requerirSesion.mockResolvedValue(revisor);
      expect(await crearObservacionAccion(null, formulario({ ...enRevision, texto: "  Falta el responsable.  " }))).toBeNull();
      expect(revision.crearObservacion.mock.calls[0].slice(0, 1)).toEqual([7]);
      expect(revision.crearObservacion.mock.calls[0][2]).toBe("Falta el responsable.");
      expect(await cerrarObservacionAccion(null, formulario({ ...enRevision, observacionId: "3" }))).toBeNull();
      expect(revision.cerrarObservacion.mock.calls[0][0]).toBe(3);
      expect(revision.cerrarObservacion.mock.calls[0][2]).toEqual({ etapa: "revision", ronda: 2 });
      expect(await reabrirObservacionAccion(null, formulario({ ...enRevision, observacionId: "3", nota: "Aún no aparece." }))).toBeNull();
      expect(revision.reabrirObservacion.mock.calls[0][0]).toBe(3);
      expect(revision.reabrirObservacion.mock.calls[0][2]).toBe("Aún no aparece.");
      expect(await crearObservacionAccion(null, formulario({ ...enRevision, texto: "no" }))).toMatchObject({ ok: false, valores: { texto: "no" } });
    });

    it("devolver no firma ni pide el contexto de la petición", async () => {
      requerirSesion.mockResolvedValue(revisor);
      await devolverRevisionAccion(null, formulario(enRevision));
      expect(transicionar.mock.calls[0][1]).toEqual({ tramiteId: 7, accion: "devolver_revision", etapaEsperada: "revision", rondaEsperada: 2 });
      expect(contextoDePeticion).not.toHaveBeenCalled();
    });

    it("el concepto favorable lleva el concepto como dato, la clave sin recortar y el contexto", async () => {
      requerirSesion.mockResolvedValue(revisor);
      expect(await conceptoFavorableAccion(null, formulario({ ...enRevision, concepto: "  Cumple.  Listo.  ", clave: " con espacios ", codigo: " 123456 " }))).toBeNull();
      const [, entrada, opciones] = transicionar.mock.calls[0];
      expect(entrada).toEqual({
        tramiteId: 7,
        accion: "concepto_favorable",
        etapaEsperada: "revision",
        rondaEsperada: 2,
        datos: { concepto: "Cumple.  Listo." },
        credenciales: { clave: " con espacios ", codigo: "123456" },
      });
      expect(opciones).toEqual({ contexto: { ip: "10.0.0.5", userAgent: "Navegador" } });
    });

    it("el concepto favorable devuelve lo escrito pero nunca la clave ni el código", async () => {
      requerirSesion.mockResolvedValue(revisor);
      transicionar.mockRejectedValue(new ErrorFirma("Clave o código incorrectos", false));
      const estado = await conceptoFavorableAccion(null, formulario({ ...enRevision, concepto: "Cumple; listo para aprobación.", clave: "secreta-2", codigo: "554433" }));
      expect(estado).toMatchObject({ ok: false, valores: { concepto: "Cumple; listo para aprobación." } });
      expect(JSON.stringify(estado)).not.toMatch(/secreta-2|554433/);
      expect(await conceptoFavorableAccion(null, formulario({ ...enRevision, concepto: "ok", clave: "secreta-2" }))).toMatchObject({ ok: false });
      expect(await conceptoFavorableAccion(null, formulario({ ...enRevision, concepto: "Cumple; listo." }))).toMatchObject({ ok: false });
    });
  });

  describe("aprobación y publicación", () => {
    const aprobador = { sesionId: "s", usuarioId: 8, usuario: "gerente", nombre: "Gerente", rol: "gerencia", verHistorial: false };
    const admin = { sesionId: "s", usuarioId: 9, usuario: "admin", nombre: "Admin", rol: "admin_sgc", verHistorial: false };
    const enAprobacion = { id: "7", etapa: "aprobacion", ronda: "2" };
    const enPublicacion = { id: "7", etapa: "publicacion", ronda: "2" };

    beforeEach(() => {
      contextoDePeticion.mockResolvedValue({ ip: "10.0.0.5", userAgent: "Navegador" });
    });

    it.each([
      ["aprobar", aprobarAccion, aprobador],
      ["aprobar_y_publicar", aprobarYPublicarAccion, admin],
    ])("%s lleva el concepto como dato, la clave sin recortar y el contexto", async (accion, ejecutar, sesion) => {
      requerirSesion.mockResolvedValue(sesion);
      expect(await ejecutar(null, formulario({ ...enAprobacion, concepto: "  Procede.  ", clave: " con espacios ", codigo: " 123456 " }))).toBeNull();
      const [, entrada, opciones] = transicionar.mock.calls[0];
      expect(entrada).toEqual({
        tramiteId: 7,
        accion,
        etapaEsperada: "aprobacion",
        rondaEsperada: 2,
        datos: { concepto: "Procede." },
        credenciales: { clave: " con espacios ", codigo: "123456" },
      });
      expect(opciones).toEqual({ contexto: { ip: "10.0.0.5", userAgent: "Navegador" } });
    });

    it("publicar firma sin más datos", async () => {
      requerirSesion.mockResolvedValue(admin);
      expect(await publicarTramiteAccion(null, formulario({ ...enPublicacion, clave: "secreta" }))).toBeNull();
      const [, entrada, opciones] = transicionar.mock.calls[0];
      expect(entrada).toEqual({ tramiteId: 7, accion: "publicar", etapaEsperada: "publicacion", rondaEsperada: 2, credenciales: { clave: "secreta" } });
      expect(opciones).toEqual({ contexto: { ip: "10.0.0.5", userAgent: "Navegador" } });
    });

    it.each([
      ["aprobar", aprobarAccion, aprobador, enAprobacion],
      ["aprobar y publicar", aprobarYPublicarAccion, admin, enAprobacion],
    ])("%s devuelve lo escrito pero nunca la clave ni el código", async (_nombre, ejecutar, sesion, ocultosDeLaEtapa) => {
      requerirSesion.mockResolvedValue(sesion);
      transicionar.mockRejectedValue(new ErrorFirma("Clave o código incorrectos", false));
      const estado = await ejecutar(null, formulario({ ...ocultosDeLaEtapa, concepto: "Procede sin ajustes.", clave: "secreta-2", codigo: "554433" }));
      expect(estado).toMatchObject({ ok: false, valores: { concepto: "Procede sin ajustes." } });
      expect(JSON.stringify(estado)).not.toMatch(/secreta-2|554433/);
      expect(await ejecutar(null, formulario({ ...ocultosDeLaEtapa, concepto: "ok", clave: "secreta-2" }))).toMatchObject({ ok: false });
      expect(await ejecutar(null, formulario({ ...ocultosDeLaEtapa, concepto: "Procede sin ajustes." }))).toMatchObject({ ok: false });
    });

    it("publicar no devuelve la clave si la firma falla, y una sesión cerrada va al ingreso", async () => {
      requerirSesion.mockResolvedValue(admin);
      transicionar.mockRejectedValue(new ErrorFirma("Clave o código incorrectos", false));
      expect(JSON.stringify(await publicarTramiteAccion(null, formulario({ ...enPublicacion, clave: "secreta-3" })))).not.toContain("secreta-3");
      transicionar.mockRejectedValue(new ErrorFirma("Cuenta bloqueada", true));
      await expect(publicarTramiteAccion(null, formulario({ ...enPublicacion, clave: "mala" }))).rejects.toThrow("REDIRECT:/ingreso");
    });

    it("devolver lleva las observaciones como lista, sin firma ni contexto", async () => {
      requerirSesion.mockResolvedValue(aprobador);
      const fd = formulario(enAprobacion);
      fd.append("observaciones", "  Falta citar la resolución.  ");
      fd.append("observaciones", "El alcance no incluye urgencias.");
      expect(await devolverAprobacionAccion(null, fd)).toBeNull();
      expect(transicionar.mock.calls[0][1]).toEqual({
        tramiteId: 7,
        accion: "devolver_aprobacion",
        etapaEsperada: "aprobacion",
        rondaEsperada: 2,
        datos: { observaciones: ["Falta citar la resolución.", "El alcance no incluye urgencias."] },
      });
      expect(contextoDePeticion).not.toHaveBeenCalled();
    });

    it("una sola observación también es una lista, y exige de 1 a 10", async () => {
      requerirSesion.mockResolvedValue(aprobador);
      await devolverAprobacionAccion(null, formulario({ ...enAprobacion, observaciones: "Falta citar la resolución." }));
      expect(transicionar.mock.calls[0][1].datos).toEqual({ observaciones: ["Falta citar la resolución."] });
      transicionar.mockClear();
      expect(await devolverAprobacionAccion(null, formulario(enAprobacion))).toMatchObject({ ok: false });
      const muchas = formulario(enAprobacion);
      for (let i = 0; i < 11; i++) muchas.append("observaciones", `Observación número ${i}`);
      expect(await devolverAprobacionAccion(null, muchas)).toMatchObject({ ok: false });
      expect(transicionar).not.toHaveBeenCalled();
    });

    it("negar la eliminación lleva el motivo", async () => {
      requerirSesion.mockResolvedValue(aprobador);
      expect(await negarEliminacionAccion(null, formulario({ ...enAprobacion, motivo: "  Sigue en uso.  " }))).toBeNull();
      expect(transicionar.mock.calls[0][1]).toEqual({
        tramiteId: 7,
        accion: "negar_eliminacion",
        etapaEsperada: "aprobacion",
        rondaEsperada: 2,
        datos: { motivo: "Sigue en uso." },
      });
    });

    it("sin el permiso de la acción no llega a transicionar", async () => {
      const lider = { sesionId: "s", usuarioId: 1, usuario: "lider", nombre: "Líder", rol: "lider_proceso", verHistorial: false };
      requerirSesion.mockResolvedValue(lider);
      for (const accion of [aprobarAccion, aprobarYPublicarAccion, publicarTramiteAccion, devolverAprobacionAccion, negarEliminacionAccion]) {
        expect(await accion(null, formulario({ ...enAprobacion, concepto: "Procede.", clave: "x", motivo: "Motivo largo.", observaciones: "Observación." })))
          .toMatchObject({ ok: false });
      }
      requerirSesion.mockResolvedValue(aprobador);
      for (const accion of [aprobarYPublicarAccion, publicarTramiteAccion]) {
        expect(await accion(null, formulario({ ...enAprobacion, concepto: "Procede.", clave: "x" }))).toMatchObject({ ok: false });
      }
      expect(transicionar).not.toHaveBeenCalled();
    });
  });
});
