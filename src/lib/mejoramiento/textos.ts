import { fechaDeDia } from "./formato";
import type { Clase, CriterioEficacia, Criticidad, EstadoActividad, EstadoAjuste, TipoAccion } from "./tipos";

/** Va en todo formulario del módulo con texto libre (spec §6.4). */
export const AVISO_SIN_PACIENTES = "No escriba nombres ni documentos de pacientes o de quien se quejó. Use el número del caso.";

export const ETIQUETA_CLASE: Record<Clase, string> = {
  no_conformidad: "No conformidad",
  observacion: "Observación",
  oportunidad: "Oportunidad de mejora",
};

export const ETIQUETA_CRITICIDAD: Record<Criticidad, string> = {
  alta: "Alta",
  media: "Media",
  baja: "Baja",
};

export const ETIQUETA_TIPO_ACCION: Record<TipoAccion, string> = {
  correctiva: "Correctiva",
  preventiva: "Preventiva",
  mejora: "De mejora",
};

export const ETIQUETA_CRITERIO: Record<CriterioEficacia, string> = {
  no_recurrencia: "No recurrencia",
  mejora_indicador: "Mejora del indicador asociado",
  reduccion_pqrs: "Reducción de PQRS o eventos",
  otro: "Otro",
};

export const ETIQUETA_ESTADO_ACTIVIDAD: Record<EstadoActividad, string> = {
  abierta: "Abierta",
  en_proceso: "En proceso",
  terminada: "Terminada",
  cancelada: "Cancelada",
};

/** Una sola frase por regla (la del guardado y la de las faltas del plan). */
export const inicioDespuesDelFin = (actividad: string) => `El inicio de la actividad ${actividad} no puede ser posterior a su fin`;

/** El indicador guardado en el criterio de eficacia ya no se puede elegir: lo dicen las faltas del plan y su formulario. */
export const INDICADOR_YA_NO_SE_ENLAZA = "El indicador elegido ya no se puede enlazar";

export const ETIQUETA_ESTADO_AJUSTE: Record<EstadoAjuste, string> = {
  pendiente: "Por decidir",
  aprobado: "Aprobado",
  negado: "Negado",
};

/** La nota de los formularios que piden un ajuste (spec §10.6 y maqueta 6). */
export const MIENTRAS_SE_DECIDE = "Lo decide quien aprobó el plan. Mientras se decide, la actividad sigue contando como vencida.";

/**
 * Lo que pide un ajuste, en una frase (spec §10.6): la actividad por su etiqueta («A1.2»), la acción por la suya («A1») y las
 * fechas; nunca la causa ni el texto de la actividad nueva. La usan los avisos, «Lo que sigue» y «Ajustes del plan».
 */
export function fraseDelAjuste(x: {
  tipo: string;
  actividad?: string | null;
  finAntes?: string | null;
  finNuevo?: string | null;
  accion?: string | null;
  accionNueva?: boolean;
}): string {
  const actividad = x.actividad ? `la actividad ${x.actividad}` : "una actividad";
  if (x.tipo === "reprogramar") {
    const fechas = [x.finAntes ? `del ${fechaDeDia(x.finAntes)}` : null, x.finNuevo ? `al ${fechaDeDia(x.finNuevo)}` : null].filter(Boolean);
    return `Reprogramar ${actividad}${fechas.length > 0 ? ` ${fechas.join(" ")}` : ""}.`;
  }
  if (x.tipo === "agregar") {
    const donde = x.accionNueva ? " en una acción nueva del plan" : x.accion ? ` a la acción ${x.accion}` : "";
    return `Añadir una actividad${donde}${x.finNuevo ? `, con fin el ${fechaDeDia(x.finNuevo)}` : ""}.`;
  }
  if (x.tipo === "cancelar") return `Cancelar ${actividad}.`;
  return "Un ajuste del plan.";
}
