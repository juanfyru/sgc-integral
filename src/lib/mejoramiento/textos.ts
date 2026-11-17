import type { Clase, Criticidad, TipoAccion } from "./tipos";

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
