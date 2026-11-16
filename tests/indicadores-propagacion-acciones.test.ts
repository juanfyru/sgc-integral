/**
 * Las acciones que cambian una fuente llaman la propagación en cuanto confirman lo suyo (anexo 14C, §3.3: `propagarSinFallar`),
 * sin esperar a la pasada de vencimientos. Sin BD: el dominio va simulado; lo que la propagación hace se prueba contra la
 * BD en `indicadores-propagacion.test.ts`.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const dominio = vi.hoisted(() => ({
  reportarDato: vi.fn(),
  cerrarDeNuevoElDato: vi.fn(),
  actualizarCategoriasDelDato: vi.fn(),
  actualizarCategorias: vi.fn(),
  reabrirMedicion: vi.fn(),
  cerrarDeNuevo: vi.fn(),
  reabrirEnCascada: vi.fn(),
  reportar: vi.fn(),
  propagarSinFallar: vi.fn(async () => {}),
}));
const { redirect, requerirSesion, revalidatePath } = vi.hoisted(() => ({
  redirect: vi.fn((destino: string) => {
    throw new Error(`REDIRECT:${destino}`);
  }),
  requerirSesion: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/sesion-actual", () => ({ requerirSesion }));
vi.mock("@/db/consultas/indicadores/datos-periodos", async (original) => ({
  ...(await original<typeof import("@/db/consultas/indicadores/datos-periodos")>()),
  reportarDato: dominio.reportarDato,
  cerrarDeNuevoElDato: dominio.cerrarDeNuevoElDato,
  actualizarCategoriasDelDato: dominio.actualizarCategoriasDelDato,
}));
vi.mock("@/db/consultas/indicadores/cierre", async (original) => ({
  ...(await original<typeof import("@/db/consultas/indicadores/cierre")>()),
  reabrirMedicion: dominio.reabrirMedicion,
  cerrarDeNuevo: dominio.cerrarDeNuevo,
}));
vi.mock("@/db/consultas/indicadores/reapertura", async (original) => ({
  ...(await original<typeof import("@/db/consultas/indicadores/reapertura")>()),
  reabrirEnCascada: dominio.reabrirEnCascada,
}));
vi.mock("@/db/consultas/indicadores/categorias", async (original) => ({
  ...(await original<typeof import("@/db/consultas/indicadores/categorias")>()),
  actualizarCategorias: dominio.actualizarCategorias,
}));
vi.mock("@/db/consultas/indicadores/mediciones", async (original) => ({
  ...(await original<typeof import("@/db/consultas/indicadores/mediciones")>()),
  reportar: dominio.reportar,
}));
vi.mock("@/db/consultas/indicadores/propagacion", async (original) => ({
  ...(await original<typeof import("@/db/consultas/indicadores/propagacion")>()),
  propagarSinFallar: dominio.propagarSinFallar,
}));

import {
  actualizarCategoriasDelDatoCompartido,
  actualizarCategoriasDeMedicion,
  cerrarDeNuevoAccion,
  cerrarDeNuevoElDatoCompartido,
  reabrirDatoCompartido,
  reabrirMedicionAccion,
  reportarAccion,
  reportarDatoCompartido,
} from "@/app/acciones-indicadores";
import { INTERBLOQUEO_DEL_CIERRE, INTERBLOQUEO_DEL_DATO, LO_QUE_SE_REABRE_CAMBIO } from "@/db/consultas/indicadores/reapertura";
import { ErrorIndicador } from "@/lib/indicadores/tipos";

function formulario(campos: Record<string, string>) {
  const datos = new FormData();
  for (const [campo, valor] of Object.entries(campos)) datos.append(campo, valor);
  return datos;
}

const quienReporta = { usuarioId: 7, rol: "consulta", verHistorial: false };
const vacio = { ok: false, error: "" } as const;

/** `propagarSinFallar` corrió una vez y después de `llamada`. */
function propagoDespuesDe(llamada: ReturnType<typeof vi.fn>) {
  expect(dominio.propagarSinFallar).toHaveBeenCalledTimes(1);
  expect(dominio.propagarSinFallar.mock.invocationCallOrder[0]).toBeGreaterThan(llamada.mock.invocationCallOrder[0]);
}

beforeEach(() => {
  vi.clearAllMocks();
  requerirSesion.mockResolvedValue(quienReporta);
});

describe("reportar un dato compartido", () => {
  it("propaga en cuanto el dato queda reportado o corregido", async () => {
    dominio.reportarDato.mockResolvedValue({ ok: true, corregido: false });
    expect(await reportarDatoCompartido(vacio, formulario({ id: "5", valor: "1284300000" }))).toEqual({ ok: true, aviso: "Se reportó el dato." });
    expect(dominio.reportarDato).toHaveBeenCalledWith(quienReporta, { periodoId: 5, valor: "1284300000", porCategoria: undefined, confirmado: false });
    propagoDespuesDe(dominio.reportarDato);
  });

  it("no propaga si pide confirmar el valor o si el reporte falla", async () => {
    dominio.reportarDato.mockResolvedValue({ ok: false, confirmar: "El valor sube 1000 frente a septiembre de 2026. ¿Es correcto?" });
    expect(await reportarDatoCompartido(vacio, formulario({ id: "5", valor: "1284300000" }))).toMatchObject({ ok: false });
    dominio.reportarDato.mockRejectedValue(new Error("El periodo está cerrado: lo reabre el Administrador del SGC"));
    expect(await reportarDatoCompartido(vacio, formulario({ id: "5", valor: "1284300000" }))).toMatchObject({ ok: false });
    expect(dominio.propagarSinFallar).not.toHaveBeenCalled();
  });
});

describe("la confirmación de un dato viaja con el valor que confirma", () => {
  const PREGUNTA = "El valor sube 1000 frente a septiembre de 2026. ¿Es correcto?";

  it("la pregunta vuelve con el valor por el que se preguntó, para que el formulario lo devuelva con la casilla", async () => {
    dominio.reportarDato.mockResolvedValue({ ok: false, confirmar: PREGUNTA, valor: "2000" });
    expect(await reportarDatoCompartido(vacio, formulario({ id: "5", valor: "2000" }))).toEqual({
      ok: false,
      error: PREGUNTA,
      confirmar: PREGUNTA,
      valores: { id: "5", valor: "2000", confirmadoValor: "2000" },
    });
  });

  it("con la casilla, la consulta recibe el valor confirmado; sin él en el formulario, uno que no confirma nada", async () => {
    dominio.reportarDato.mockResolvedValue({ ok: true, corregido: false });
    await reportarDatoCompartido(vacio, formulario({ id: "5", valor: "5000", confirmado: "on", confirmadoValor: "2000" }));
    expect(dominio.reportarDato).toHaveBeenLastCalledWith(quienReporta, expect.objectContaining({ valor: "5000", confirmado: true, confirmadoValor: "2000" }));
    await reportarDatoCompartido(vacio, formulario({ id: "5", valor: "5000", confirmado: "on" }));
    expect(dominio.reportarDato).toHaveBeenLastCalledWith(quienReporta, expect.objectContaining({ valor: "5000", confirmado: true, confirmadoValor: "" }));
    // Sin la casilla no viaja ningún valor confirmado.
    await reportarDatoCompartido(vacio, formulario({ id: "5", valor: "5000", confirmadoValor: "2000" }));
    expect(dominio.reportarDato.mock.lastCall?.[1]).toMatchObject({ confirmado: false });
    expect(dominio.reportarDato.mock.lastCall?.[1].confirmadoValor).toBeUndefined();
  });
});

describe("un interbloqueo de la base llega legible a la persona (ola final, O11)", () => {
  const interbloqueo = () => Object.assign(new Error("deadlock detected"), { code: "40P01" });
  const DEL_DATO = { ok: false, error: INTERBLOQUEO_DEL_DATO };
  const DEL_CIERRE = { ok: false, error: INTERBLOQUEO_DEL_CIERRE };

  it("cada acción dice lo que le toca: las del periodo de un dato, que ese periodo; las de mediciones, esas mediciones", async () => {
    requerirSesion.mockResolvedValue({ usuarioId: 7, rol: "admin_sgc", verHistorial: true });
    expect(INTERBLOQUEO_DEL_DATO).toBe("Otra persona estaba reportando, cerrando o reabriendo ese periodo del dato al mismo tiempo: inténtelo de nuevo");
    dominio.reportarDato.mockRejectedValue(interbloqueo());
    expect(await reportarDatoCompartido(vacio, formulario({ id: "5", valor: "1284300000" }))).toMatchObject(DEL_DATO);
    dominio.actualizarCategoriasDelDato.mockRejectedValue(interbloqueo());
    expect(await actualizarCategoriasDelDatoCompartido(null, formulario({ id: "5" }))).toMatchObject(DEL_DATO);
    dominio.cerrarDeNuevoElDato.mockRejectedValue(interbloqueo());
    expect(await cerrarDeNuevoElDatoCompartido(null, formulario({ id: "5" }))).toMatchObject(DEL_DATO);
    dominio.actualizarCategorias.mockRejectedValue(interbloqueo());
    expect(await actualizarCategoriasDeMedicion(null, formulario({ id: "5" }))).toMatchObject(DEL_CIERRE);
    dominio.cerrarDeNuevo.mockRejectedValue(interbloqueo());
    expect(await cerrarDeNuevoAccion(null, formulario({ id: "5" }))).toMatchObject(DEL_CIERRE);
    expect(dominio.propagarSinFallar).not.toHaveBeenCalled();
  });

  it("cerrar de nuevo una medición: cualquier otro error llega tal cual", async () => {
    requerirSesion.mockResolvedValue({ usuarioId: 7, rol: "admin_sgc", verHistorial: true });
    dominio.cerrarDeNuevo.mockRejectedValue(new Error("Solo se cierra de nuevo una medición reabierta"));
    expect(await cerrarDeNuevoAccion(null, formulario({ id: "5" }))).toMatchObject({ ok: false, error: "Solo se cierra de nuevo una medición reabierta" });
  });

  it("cualquier otro error llega tal cual", async () => {
    requerirSesion.mockResolvedValue({ usuarioId: 7, rol: "admin_sgc", verHistorial: true });
    dominio.cerrarDeNuevoElDato.mockRejectedValue(new Error("Solo se cierra de nuevo un periodo reabierto"));
    expect(await cerrarDeNuevoElDatoCompartido(null, formulario({ id: "5" }))).toMatchObject({ ok: false, error: "Solo se cierra de nuevo un periodo reabierto" });
  });
});

describe("una reapertura cuya lista cambió repinta la pantalla (ola final, O12)", () => {
  const campos = { id: "5", justificacion: "El dato venía de otro informe", vistas: "[5]" };
  const admin = { usuarioId: 7, rol: "admin_sgc", verHistorial: true };

  it("con «Lo que se reabre cambió…», la acción revalida aunque falle: el diálogo recibe la lista de ahora", async () => {
    requerirSesion.mockResolvedValue(admin);
    dominio.reabrirMedicion.mockRejectedValue(new ErrorIndicador(LO_QUE_SE_REABRE_CAMBIO));
    expect(await reabrirMedicionAccion(null, formulario(campos))).toMatchObject({ ok: false, error: LO_QUE_SE_REABRE_CAMBIO });
    expect(revalidatePath).toHaveBeenCalledTimes(1);
    expect(revalidatePath).toHaveBeenLastCalledWith("/", "layout");
    dominio.reabrirEnCascada.mockRejectedValue(new ErrorIndicador(LO_QUE_SE_REABRE_CAMBIO));
    expect(await reabrirDatoCompartido(null, formulario(campos))).toMatchObject({ ok: false, error: LO_QUE_SE_REABRE_CAMBIO });
    expect(revalidatePath).toHaveBeenCalledTimes(2);
    expect(dominio.propagarSinFallar).not.toHaveBeenCalled();
  });

  it("cualquier otro error no revalida, como siempre", async () => {
    requerirSesion.mockResolvedValue(admin);
    dominio.reabrirMedicion.mockRejectedValue(new ErrorIndicador("Solo se reabre una medición cerrada"));
    expect(await reabrirMedicionAccion(null, formulario(campos))).toMatchObject({ ok: false, error: "Solo se reabre una medición cerrada" });
    dominio.reabrirEnCascada.mockRejectedValue(new Error(LO_QUE_SE_REABRE_CAMBIO));
    expect(await reabrirDatoCompartido(null, formulario(campos))).toMatchObject({ ok: false });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("reportar una medición", () => {
  const campos = { id: "3", periodo: "2026-09", volver: "/indicadores/X", valor_A: "5" };

  it("propaga tras reportar o corregir, antes de volver a la página", async () => {
    dominio.reportar.mockResolvedValue({ ok: true, estado: "reportada", semaforo: "bien", cumple: true, faltaDato: false });
    await expect(reportarAccion(vacio, formulario({ ...campos, intencion: "reportar" }))).rejects.toThrow("REDIRECT:/indicadores/X");
    propagoDespuesDe(dominio.reportar);
  });

  it("no propaga al guardar sin reportar ni cuando pide confirmar", async () => {
    dominio.reportar.mockResolvedValue({ ok: true, estado: "abierta", semaforo: null, cumple: null, faltaDato: false });
    expect(await reportarAccion(vacio, formulario({ ...campos, intencion: "parcial" }))).toMatchObject({ ok: true });
    dominio.reportar.mockResolvedValue({ ok: false, confirmar: "¿Los datos son correctos?" });
    expect(await reportarAccion(vacio, formulario({ ...campos, intencion: "reportar" }))).toMatchObject({ ok: false });
    expect(dominio.propagarSinFallar).not.toHaveBeenCalled();
  });
});

describe("las demás acciones que cambian una fuente", () => {
  const fuente = readFileSync(path.join(process.cwd(), "src/app/acciones-indicadores.ts"), "utf8");
  const cuerpo = (accion: string) => {
    const desde = fuente.indexOf(`export async function ${accion}(`);
    const hasta = fuente.indexOf("export async function ", desde + 1);
    return fuente.slice(desde, hasta < 0 ? undefined : hasta);
  };

  it.each([
    ["marcarNoAplicaAccion", "marcarNoAplica"],
    ["quitarNoAplicaAccion", "quitarNoAplica"],
    ["registrarHistoricosAccion", "registrarHistoricos"],
    ["programarMetaAccion", "programarMeta"],
    ["quitarMetaProgramadaAccion", "quitarMetaProgramada"],
    ["reabrirMedicionAccion", "reabrirMedicion"],
    ["volverACalcularAccion", "volverACalcular"],
    ["aprobarFichasAccion", "aprobarFichas"],
    ["enviarAAprobacionAccion", "enviarAAprobacion"],
  ])("%s propaga después de %s", (accion, consulta) => {
    const texto = cuerpo(accion);
    const llamada = texto.search(new RegExp(`await ${consulta}\\(`));
    const propaga = texto.indexOf("await propagarSinFallar(");
    expect(llamada, `${accion} llama ${consulta}`).toBeGreaterThan(0);
    expect(propaga, `${accion} propaga después de ${consulta}`).toBeGreaterThan(llamada);
  });

  it("publicar un cambio menor propaga; enviar a aprobación, no", () => {
    expect(cuerpo("enviarAAprobacionAccion")).toMatch(/if \(menor\) await propagarSinFallar\(\);/);
  });
});
