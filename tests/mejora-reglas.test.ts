import { describe, expect, it } from "vitest";
import { ORIGENES, esExterno, fuenteObligatoria, pideReferenciaDelCaso } from "@/lib/mejoramiento/origenes";
import { accionObligada, aceptadoVaA, apruebaGerencia, llevaPlanSiempre, tipoPropuesto } from "@/lib/mejoramiento/reglas";
import { DESDE, YA_CAMBIO, destinoDe } from "@/lib/mejoramiento/transiciones";
import { etiquetaDeEstado, pasosDelRecorrido, turnoDe } from "@/lib/mejoramiento/estados";
import { AVISO_SIN_PACIENTES } from "@/lib/mejoramiento/textos";
import {
  ACCIONES_HALLAZGO,
  ESTADOS_HALLAZGO,
  ErrorMejora,
  TERMINALES,
  type AccionHallazgo,
  type EstadoHallazgo,
  type HallazgoBase,
} from "@/lib/mejoramiento/tipos";

type Vista = Parameters<typeof destinoDe>[1];
type Rumbo = Parameters<typeof destinoDe>[2];

const base = {
  clase: "no_conformidad",
  criticidad: "media",
  origen: "auditoria_interna",
  reincidenteDe: null,
  estado: "por_aceptar",
  correccionRequerida: null,
} as const;

function h(extra: Partial<Vista> = {}): Vista {
  return { ...base, ...extra };
}

describe("orígenes", () => {
  it("los catorce orígenes, en orden, y solo dos externos", () => {
    expect(ORIGENES.map((o) => o.clave)).toEqual([
      "auditoria_interna", "control_interno", "revision_direccion", "pamec", "autoevaluacion", "indicador",
      "pqrsf", "evento_adverso", "riesgo_materializado", "satisfaccion_usuario", "control_documental", "otro",
      "auditoria_externa", "ente_control",
    ]);
    expect(ORIGENES.filter((o) => esExterno(o.clave)).map((o) => o.clave)).toEqual(["auditoria_externa", "ente_control"]);
    expect(ORIGENES.every((o) => o.externo === esExterno(o.clave))).toBe(true);
  });
  it("referencia del caso y fuente obligatoria", () => {
    expect(ORIGENES.filter((o) => pideReferenciaDelCaso(o.clave)).map((o) => o.clave)).toEqual(["pqrsf", "evento_adverso"]);
    expect(fuenteObligatoria("otro", false)).toBe(true);
    expect(fuenteObligatoria("indicador", true)).toBe(false);
  });
});

describe("reglas", () => {
  it("accionObligada", () => {
    expect(accionObligada({ ...base, criticidad: "alta" })).toBe(true);
    expect(accionObligada({ ...base, reincidenteDe: 4 })).toBe(true);
    expect(accionObligada({ ...base, origen: "ente_control" })).toBe(true);
    expect(accionObligada(base)).toBe(false);
    expect(accionObligada({ ...base, clase: "observacion", criticidad: null })).toBe(false);
  });
  it("llevaPlanSiempre", () => {
    expect(llevaPlanSiempre({ clase: "observacion", origen: "pamec" })).toBe(true);
    expect(llevaPlanSiempre({ clase: "oportunidad", origen: "pamec" })).toBe(true);
    expect(llevaPlanSiempre({ clase: "no_conformidad", origen: "auditoria_externa" })).toBe(true);
    expect(llevaPlanSiempre({ clase: "no_conformidad", origen: "pamec" })).toBe(false);
  });
  it("aceptadoVaA y tipoPropuesto", () => {
    expect(aceptadoVaA("no_conformidad")).toBe("por_corregir");
    expect(aceptadoVaA("observacion")).toBe("por_formular");
    expect(tipoPropuesto("no_conformidad")).toBe("correctiva");
    expect(tipoPropuesto("observacion")).toBe("preventiva");
    expect(tipoPropuesto("oportunidad")).toBe("mejora");
  });
  describe("apruebaGerencia", () => {
    const nada = { requiereRecursos: false, elaboroAdmin: false };
    const hz = { clase: "no_conformidad", criticidad: "media", origen: "pamec" } as const;
    it("criticidad alta", () => expect(apruebaGerencia({ ...hz, criticidad: "alta" }, nada)).toBe(true));
    it("origen externo", () => expect(apruebaGerencia({ ...hz, origen: "auditoria_externa" }, nada)).toBe(true));
    it("recursos adicionales", () => expect(apruebaGerencia(hz, { ...nada, requiereRecursos: true })).toBe(true));
    it("elaboró un Admin SGC", () => expect(apruebaGerencia(hz, { ...nada, elaboroAdmin: true })).toBe(true));
    it("ninguna", () => expect(apruebaGerencia(hz, nada)).toBe(false));
  });
});

describe("destinoDe, fila por fila", () => {
  const caso = (
    accion: AccionHallazgo, estado: EstadoHallazgo, esperado: EstadoHallazgo,
    extra: Partial<Vista> = {}, rumbo: Rumbo = {},
  ) => it(`${accion} desde ${estado} → ${esperado}`, () => {
    expect(destinoDe(accion, h({ estado, ...extra }), rumbo)).toBe(esperado);
  });
  caso("registrar", "por_aceptar", "por_aceptar");
  caso("registrar", "por_aceptar", "por_corregir", {}, { nacioAceptado: true });
  caso("registrar", "por_aceptar", "por_formular", { clase: "oportunidad", criticidad: null }, { nacioAceptado: true });
  caso("aceptar", "por_aceptar", "por_corregir");
  caso("aceptar", "por_aceptar", "por_formular", { clase: "oportunidad", criticidad: null });
  caso("rechazar", "por_aceptar", "rechazo");
  caso("retirar", "rechazo", "rechazado");
  caso("sostener", "rechazo", "arbitraje");
  caso("confirmar_hallazgo", "arbitraje", "por_corregir");
  caso("confirmar_hallazgo", "arbitraje", "por_formular", { clase: "observacion", criticidad: null });
  caso("confirmar_rechazo", "arbitraje", "rechazado");
  caso("corregir", "por_corregir", "por_formular", { criticidad: "alta" });
  caso("corregir", "por_corregir", "por_decidir");
  caso("decidir_si", "por_decidir", "por_formular");
  caso("decidir_si", "por_validar", "por_formular");
  caso("decidir_no", "por_decidir", "por_validar");
  caso("validar_correccion", "por_validar", "cerrado");
  caso("devolver_correccion", "por_validar", "por_corregir");
  caso("enviar_plan", "por_formular", "en_revision");
  caso("enviar_plan", "por_formular", "en_aprobacion", {}, { saltaRevision: true });
  caso("devolver_plan", "en_revision", "por_formular");
  caso("devolver_plan", "en_aprobacion", "por_formular");
  caso("revisar_plan", "en_revision", "en_aprobacion", {}, { apruebaGerencia: true });
  caso("revisar_plan", "en_revision", "en_ejecucion");
  caso("aprobar_plan", "en_aprobacion", "en_ejecucion");
  caso("completar", "en_ejecucion", "por_verificar");
  caso("verificar_implementacion", "por_verificar", "en_ejecucion", {}, { devolvioAlguna: true });
  caso("verificar_implementacion", "por_verificar", "en_espera");
  caso("evaluar_eficaz", "en_espera", "cerrado", {}, { verificaAdmin: true });
  caso("evaluar_eficaz", "en_espera", "por_cerrar");
  caso("evaluar_no_eficaz", "en_espera", "por_formular");
  caso("cerrar", "por_cerrar", "cerrado");
  caso("anular", "en_ejecucion", "anulado");
  caso("anular", "por_aceptar", "anulado");
  caso("cargar", "por_aceptar", "por_verificar", {}, { quedaEn: "por_verificar" });
  caso("reclasificar", "por_corregir", "por_formular", {}, { quedaEn: "por_formular" });
  caso("ajustar", "por_verificar", "en_ejecucion", {}, { quedaEn: "en_ejecucion" });

  it("reclasificar y ajustar sin quedaEn lanzan", () => {
    expect(() => destinoDe("reclasificar", h({ estado: "por_corregir" }), {})).toThrow(ErrorMejora);
    expect(() => destinoDe("ajustar", h({ estado: "en_ejecucion" }), {})).toThrow(ErrorMejora);
  });

  it("DESDE cubre las veinticinco acciones", () => {
    expect(Object.keys(DESDE).sort()).toEqual([...ACCIONES_HALLAZGO].sort());
    expect(ACCIONES_HALLAZGO).toHaveLength(25);
  });

  it("ningún salto fuera de la tabla", () => {
    for (const accion of ACCIONES_HALLAZGO) {
      const desde = DESDE[accion];
      if (desde === "nuevo") continue;
      for (const estado of ESTADOS_HALLAZGO) {
        const permitido = desde === "no_terminal" ? !TERMINALES.includes(estado) : desde.includes(estado);
        const llamada = () => destinoDe(accion, h({ estado }), { quedaEn: estado });
        if (permitido) expect(llamada, `${accion} desde ${estado}`).not.toThrow();
        else expect(llamada, `${accion} desde ${estado}`).toThrow(YA_CAMBIO);
      }
    }
  });

  it("desde un terminal, toda acción que no es de alta lanza", () => {
    for (const accion of ACCIONES_HALLAZGO) {
      if (DESDE[accion] === "nuevo") continue;
      for (const estado of TERMINALES) {
        expect(() => destinoDe(accion, h({ estado }), { quedaEn: estado })).toThrow(ErrorMejora);
      }
    }
  });
});

describe("etiquetaDeEstado", () => {
  const e = (estado: EstadoHallazgo, extra: Partial<HallazgoBase> = {}, x?: { yaSePuedeEvaluar?: boolean }) =>
    etiquetaDeEstado({ estado, resultadoCierre: null, correccionRequerida: null, ...extra }, x);
  it("cerrado según el resultado", () => {
    expect(e("cerrado", { resultadoCierre: "eficaz" })).toBe("Cerrado · eficaz");
    expect(e("cerrado", { resultadoCierre: "con_correccion" })).toBe("Cerrado con corrección");
    expect(e("cerrado", { resultadoCierre: "sin_accion" })).toBe("Cerrado sin acción");
  });
  it("por validar", () => {
    expect(e("por_validar", { correccionRequerida: false })).toBe("Por validar el cierre sin acción");
    expect(e("por_validar", { correccionRequerida: true })).toBe("Por validar la corrección");
  });
  it("en espera", () => {
    expect(e("en_espera")).toBe("En espera de eficacia");
    expect(e("en_espera", {}, { yaSePuedeEvaluar: true })).toBe("Por evaluar la eficacia");
  });
  it("los demás", () => {
    const otros = ESTADOS_HALLAZGO.filter((s) => !["cerrado", "por_validar", "en_espera"].includes(s));
    expect(otros.map((s) => e(s))).toEqual([
      "Por aceptar", "Rechazado · por decidir", "En arbitraje", "Por corregir", "Por decidir", "Por formular",
      "En revisión", "En aprobación", "En ejecución", "Por verificar", "Por cerrar", "Rechazado", "Anulado",
    ]);
  });
  it("turnos", () => {
    expect(turnoDe("por_aceptar")).toBe("lideres");
    expect(turnoDe("rechazo")).toBe("registrador");
    expect(turnoDe("arbitraje")).toBe("arbitro");
    expect(turnoDe("por_decidir")).toBe("admin");
    expect(turnoDe("en_aprobacion")).toBe("gerencia");
    expect(turnoDe("en_ejecucion")).toBe("responsables");
    expect(turnoDe("por_verificar")).toBe("verificadores");
    expect(turnoDe("por_validar")).toBe("validadores");
    expect(turnoDe("en_espera")).toBeNull();
    expect(turnoDe("cerrado")).toBeNull();
  });
});

describe("pasosDelRecorrido", () => {
  const hz = (extra: Partial<HallazgoBase>): HallazgoBase => ({
    id: 1, codigo: "HZ-2026-001", clase: "no_conformidad", criticidad: "media", origen: "pamec", estado: "por_formular",
    ronda: 1, procesoId: 1, reincidenteDe: null, correccionRequerida: true, accionRequerida: null, resultadoCierre: null,
    registradoPor: 1, ...extra,
  });
  const etiquetas = (x: HallazgoBase) => pasosDelRecorrido(x).map((p) => p.etiqueta);
  it("una oportunidad no tiene Corrección ni Decisión", () => {
    const p = etiquetas(hz({ clase: "oportunidad", criticidad: null }));
    expect(p).not.toContain("Corrección");
    expect(p).not.toContain("Decisión");
    expect(p).toContain("Causa raíz");
  });
  it("por el camino corto termina en Cierre sin Causa raíz", () => {
    const x = hz({ estado: "cerrado", resultadoCierre: "sin_accion", accionRequerida: false });
    const p = pasosDelRecorrido(x);
    expect(p.at(-1)?.etiqueta).toBe("Cierre");
    expect(etiquetas(x)).not.toContain("Causa raíz");
    expect(etiquetas(x)).not.toContain("Eficacia");
    expect(p.every((s) => s.estado === "hecho")).toBe(true);
  });
  it("marca un solo paso actual y los anteriores como hechos", () => {
    const p = pasosDelRecorrido(hz({ estado: "en_ejecucion" }));
    expect(p.filter((s) => s.estado === "actual")).toHaveLength(1);
    expect(p.find((s) => s.estado === "actual")?.etiqueta).toBe("Ejecución");
    expect(p.find((s) => s.etiqueta === "Plan aprobado")?.estado).toBe("hecho");
    expect(p.find((s) => s.etiqueta === "Eficacia")?.estado).toBe("falta");
  });
});

describe("textos", () => {
  it("aviso sin pacientes", () => {
    expect(AVISO_SIN_PACIENTES).toBe("No escriba nombres ni documentos de pacientes o de quien se quejó. Use el número del caso.");
  });
});
