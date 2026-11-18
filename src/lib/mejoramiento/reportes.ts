/**
 * Lo puro de los reportes de funcionarios (spec 15 §7.3, F15-DC5 y F15-DC8): la etiqueta que lee quien reportó, los textos de
 * sus avisos y sus rutas. Quien reportó nunca recibe el código, el título ni el enlace del hallazgo: solo esta etiqueta y, si se
 * descartó, el motivo. Sin Node ni BD.
 */
import { fechaDeDia } from "./formato";
import { TERMINALES, type EstadoHallazgo } from "./tipos";

export const ESTADOS_REPORTE = ["recibido", "convertido", "sumado", "descartado"] as const;
export type EstadoReporte = (typeof ESTADOS_REPORTE)[number];

export type EtiquetaDeReporte = "Recibido" | "En trámite" | "Cerrado" | "Descartado";

/**
 * Lo que quien reportó lee de su reporte: «Recibido» mientras nadie lo clasifica; «Descartado»; y, convertido o sumado a un
 * hallazgo, «En trámite» mientras el hallazgo sigue abierto y «Cerrado» cuando termina, también si se rechazó o se anuló (para
 * quien reportó, su reporte ya se atendió: el porqué es contenido del hallazgo).
 */
export function etiquetaDeReporte(estado: string, estadoHallazgo: string | null): EtiquetaDeReporte {
  if (estado === "recibido") return "Recibido";
  if (estado === "descartado") return "Descartado";
  return estadoHallazgo !== null && TERMINALES.includes(estadoHallazgo as EstadoHallazgo) ? "Cerrado" : "En trámite";
}

/** La entidad de los avisos y de la bitácora de un reporte. */
export const ENTIDAD_REPORTE = "mejora_reporte";

/** «Mis reportes» (spec 15 §16.1): adonde llevan los avisos a quien reportó, nunca al hallazgo. */
export const RUTA_MIS_REPORTES = "/mejoramiento/reportes";

/** «Reportes recibidos», la pestaña de los roles de control. */
export const RUTA_REPORTES_RECIBIDOS = "/mejoramiento/reportes?vista=recibidos";

/** El formulario de reportar; con `?reporte=<id>`, el paso de los archivos de un reporte propio recién enviado. */
export const rutaDeReportar = (reporteId?: number) => (reporteId ? `/mejoramiento/reportar?reporte=${reporteId}` : "/mejoramiento/reportar");

/** Convertir un reporte: el registro de un hallazgo con lo del reporte copiado. */
export const rutaDeConvertir = (reporteId: number) => `/mejoramiento/nuevo?reporte=${reporteId}`;

export const YA_CLASIFICADO = "Ese reporte ya se clasificó";
export const REPORTE_NO_EXISTE = "El reporte no existe";
export const SOLO_ABIERTO = "Solo se añade a un hallazgo abierto: convierta el reporte en uno nuevo";

/** Los avisos a quien reportó (spec §7.3: cuando se clasifica y cuando el hallazgo termina). */
export const AVISO_EN_TRAMITE = "Su reporte fue recibido y está en trámite";
export const AVISO_DESCARTADO = "Su reporte se descartó";
export const AVISO_ATENDIDO = "Su reporte fue atendido: el hallazgo se cerró";

/** El cuerpo de un aviso a quien reportó: de qué reporte habla, sin lo que escribió (los avisos pueden salir por correo). */
export const cuerpoDelReporte = (vistoEn: string) => `Su reporte de lo que vio el ${fechaDeDia(vistoEn)}`;
