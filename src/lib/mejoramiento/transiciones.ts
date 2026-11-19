import { accionObligada, aceptadoVaA } from "./reglas";
import { ErrorMejora, TERMINALES, type AccionHallazgo, type EstadoHallazgo, type HallazgoBase } from "./tipos";

export const YA_CAMBIO = "El hallazgo ya cambió: vuelva a cargar la página";

/** La columna «Desde» del spec §8.2. */
export const DESDE: Record<AccionHallazgo, readonly EstadoHallazgo[] | "nuevo" | "no_terminal"> = {
  registrar: "nuevo",
  aceptar: ["por_aceptar"],
  rechazar: ["por_aceptar"],
  retirar: ["rechazo"],
  sostener: ["rechazo"],
  confirmar_hallazgo: ["arbitraje"],
  confirmar_rechazo: ["arbitraje"],
  corregir: ["por_corregir"],
  decidir_si: ["por_decidir", "por_validar"],
  decidir_no: ["por_decidir"],
  validar_correccion: ["por_validar"],
  devolver_correccion: ["por_validar"],
  enviar_plan: ["por_formular"],
  devolver_plan: ["en_revision", "en_aprobacion"],
  revisar_plan: ["en_revision"],
  aprobar_plan: ["en_aprobacion"],
  completar: ["en_ejecucion"],
  verificar_implementacion: ["por_verificar"],
  evaluar_eficaz: ["en_espera"],
  evaluar_no_eficaz: ["en_espera"],
  cerrar: ["por_cerrar"],
  anular: "no_terminal",
  cargar: "nuevo",
  reclasificar: ["por_aceptar", "rechazo", "arbitraje", "por_corregir", "por_decidir", "por_validar", "por_formular"],
  ajustar: ["en_ejecucion", "por_verificar"],
};

export type Rumbo = {
  nacioAceptado?: boolean;
  apruebaGerencia?: boolean;
  saltaRevision?: boolean;
  devolvioAlguna?: boolean;
  verificaAdmin?: boolean;
  quedaEn?: EstadoHallazgo;
};

/** Hacia dónde va un hallazgo con una acción (spec §8.2). Lanza si el estado actual no admite la acción. */
export function destinoDe(
  accion: AccionHallazgo,
  h: Pick<HallazgoBase, "clase" | "criticidad" | "origen" | "reincidenteDe" | "estado" | "correccionRequerida" | "verificacionHallazgoId">,
  rumbo: Rumbo,
): EstadoHallazgo {
  const desde = DESDE[accion];
  if (desde !== "nuevo") {
    const permitido = desde === "no_terminal" ? !TERMINALES.includes(h.estado) : desde.includes(h.estado);
    if (!permitido) throw new ErrorMejora(YA_CAMBIO);
  }
  switch (accion) {
    case "registrar":
      return rumbo.nacioAceptado ? aceptadoVaA(h) : "por_aceptar";
    case "aceptar":
    case "confirmar_hallazgo":
      return aceptadoVaA(h);
    case "rechazar":
      return "rechazo";
    case "retirar":
    case "confirmar_rechazo":
      return "rechazado";
    case "sostener":
      return "arbitraje";
    case "corregir":
      return accionObligada(h) ? "por_formular" : "por_decidir";
    case "decidir_si":
    case "devolver_plan":
    case "evaluar_no_eficaz":
      return "por_formular";
    case "decidir_no":
      return "por_validar";
    case "validar_correccion":
    case "cerrar":
      return "cerrado";
    case "devolver_correccion":
      return "por_corregir";
    case "enviar_plan":
      return rumbo.saltaRevision ? "en_aprobacion" : "en_revision";
    case "revisar_plan":
      return rumbo.apruebaGerencia ? "en_aprobacion" : "en_ejecucion";
    case "aprobar_plan":
      return "en_ejecucion";
    case "completar":
      return "por_verificar";
    case "verificar_implementacion":
      return rumbo.devolvioAlguna ? "en_ejecucion" : "en_espera";
    case "evaluar_eficaz":
      return rumbo.verificaAdmin ? "cerrado" : "por_cerrar";
    case "anular":
      return "anulado";
    case "cargar":
    case "reclasificar":
    case "ajustar":
      if (!rumbo.quedaEn) throw new ErrorMejora(YA_CAMBIO);
      return rumbo.quedaEn;
  }
}
