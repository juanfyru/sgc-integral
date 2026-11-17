import type { Clase, CriterioEficacia, Criticidad, EstadoActividad, TipoAccion } from "./tipos";

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
