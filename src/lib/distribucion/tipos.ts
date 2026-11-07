import { ErrorTramite } from "@/db/consultas/flujo/contrato";

export const ESTADOS_COPIA = ["emitida", "recibida", "por_recoger", "recogida", "anulada"] as const;
export type EstadoCopia = (typeof ESTADOS_COPIA)[number];

export const MOTIVOS_POR_RECOGER = ["nueva_version", "eliminado", "carga_deshecha"] as const;
export type MotivoPorRecoger = (typeof MOTIVOS_POR_RECOGER)[number];

/** Los tres primeros los elige la persona; `retirada_en_verificacion` lo pone el sistema. */
export const DESTINOS_RECOGIDA = ["devuelta", "destruida", "no_encontrada", "retirada_en_verificacion"] as const;
export type DestinoRecogida = (typeof DESTINOS_RECOGIDA)[number];

export const MOTIVOS_ANULACION = ["error", "extraviada", "deteriorada"] as const;
export type MotivoAnulacion = (typeof MOTIVOS_ANULACION)[number];

export const MOTIVOS_REIMPRESION = ["deteriorada", "ilegible", "extraviada_sin_entregar", "otro"] as const;
export type MotivoReimpresion = (typeof MOTIVOS_REIMPRESION)[number];

export const TIPOS_EVENTO_COPIA = [
  "emitida",
  "impresa",
  "consultada",
  "reimpresa",
  "recibida",
  "por_recoger",
  "recogida",
  "anulada",
] as const;
export type TipoEventoCopia = (typeof TIPOS_EVENTO_COPIA)[number];

export const ESTADOS_ACUSE = ["pendiente", "confirmado", "superado", "retirado"] as const;
export type EstadoAcuse = (typeof ESTADOS_ACUSE)[number];

export const MODOS_ACUSE = ["individual", "asistencia", "firma"] as const;
export type ModoAcuse = (typeof MODOS_ACUSE)[number];

export const ORIGENES_ACUSE = ["publicacion", "solicitud_manual", "ingreso_proceso"] as const;
export type OrigenAcuse = (typeof ORIGENES_ACUSE)[number];

export const MODALIDADES_JORNADA = ["presencial", "virtual", "reunion_servicio", "otra"] as const;
export type ModalidadJornada = (typeof MODALIDADES_JORNADA)[number];

export const RESPUESTAS_ITEM = ["conforme", "no_conforme", "no_aplica"] as const;
export type RespuestaItem = (typeof RESPUESTAS_ITEM)[number];

export const ORIGENES_ITEM = ["copia", "copia_por_recoger", "fijo", "libre"] as const;
export type OrigenItem = (typeof ORIGENES_ITEM)[number];

export const ETIQUETA_ESTADO_COPIA: Record<EstadoCopia, string> = {
  emitida: "Emitida",
  recibida: "Recibida",
  por_recoger: "Por recoger",
  recogida: "Recogida",
  anulada: "Anulada",
};

export const ETIQUETA_DESTINO: Record<DestinoRecogida, string> = {
  devuelta: "Devuelta al SGC",
  destruida: "Destruida en el punto",
  no_encontrada: "No se encontró",
  retirada_en_verificacion: "Retirada en la verificación",
};

export const ETIQUETA_MODO_ACUSE: Record<ModoAcuse, string> = {
  individual: "Individual",
  asistencia: "Por asistencia",
  firma: "Por firma",
};

export const ETIQUETA_MODALIDAD: Record<ModalidadJornada, string> = {
  presencial: "Presencial",
  virtual: "Virtual",
  reunion_servicio: "Reunión de servicio",
  otra: "Otra",
};

export const ETIQUETA_RESPUESTA: Record<RespuestaItem, string> = {
  conforme: "Conforme",
  no_conforme: "No conforme",
  no_aplica: "No aplica",
};

/** Tiempo en que una copia recién emitida puede imprimirse sin reimpresión. */
export const VENTANA_IMPRESION_MS = 15 * 60_000;

/** Error de negocio cuyo mensaje se muestra; hereda de `ErrorTramite` para que `recibirArchivo` lo trate como 409. */
export class ErrorDistribucion extends ErrorTramite {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ErrorDistribucion";
  }
}
