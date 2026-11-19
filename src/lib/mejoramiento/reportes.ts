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

/**
 * Sobre qué se reporta desde la sección «Mejoramiento» de otra página (Fase 15B, anexo §10.2): el código de un documento o de un
 * indicador, o el slug de un proceso; los mismos identificadores que `rutaDeRegistro`. Tal como vienen en la dirección, sin validar:
 * la página de reportar ignora lo que la persona no ve.
 */
export type SobreQueSeReporta = { documento?: string; indicador?: string; proceso?: string };

/** Los parámetros de `SobreQueSeReporta`, en el orden en que van en la dirección. */
export const PARAMETROS_DEL_REPORTE = ["documento", "indicador", "proceso"] as const satisfies ReadonlyArray<keyof SobreQueSeReporta>;

/** El formulario de reportar con el enlace puesto (los vacíos no van), codificado. */
export function rutaDeReportarSobre(p: SobreQueSeReporta): string {
  const q = new URLSearchParams();
  for (const k of PARAMETROS_DEL_REPORTE) {
    const v = p[k];
    if (typeof v === "string" && v !== "") q.set(k, v);
  }
  const texto = q.toString();
  return texto ? `${rutaDeReportar()}?${texto}` : rutaDeReportar();
}

/** Convertir un reporte: el registro de un hallazgo con lo del reporte copiado. */
export const rutaDeConvertir = (reporteId: number) => `/mejoramiento/nuevo?reporte=${reporteId}`;

/** Un reporte admite como mucho tres archivos de evidencia (spec 15 §7.3). */
export const MAXIMO_POR_REPORTE = 3;

/** «Reportes recibidos» trae todos los que esperan y los clasificados en estos últimos días (no crece sin límite). */
export const DIAS_DE_CLASIFICADOS = 90;

/** El código de un hallazgo (`HZ-AAAA-NNN`; el 1.000 del año lleva cuatro cifras). */
export const PATRON_DE_CODIGO = /^HZ-\d{4}-\d{3,}$/;
export const CODIGO_NO_VALIDO = "Escriba el código del hallazgo, por ejemplo HZ-2026-004";

export const YA_CLASIFICADO = "Ese reporte ya se clasificó";
export const REPORTE_NO_EXISTE = "El reporte no existe";
export const SOLO_ABIERTO = "Solo se añade a un hallazgo abierto: convierta el reporte en uno nuevo";

/**
 * Los avisos a quien reportó (spec §7.3: cuando se clasifica y cuando el hallazgo termina). Ninguno copia lo que alguien
 * escribió (los avisos saldrán por correo en la Fase 16): el motivo de un descarte se lee en «Mis reportes». El del final es
 * neutro: vale para un hallazgo cerrado, rechazado o anulado.
 */
export const AVISO_EN_TRAMITE = "Su reporte fue recibido y está en trámite";
export const AVISO_DESCARTADO = "Su reporte se descartó";
export const CUERPO_DEL_DESCARTE = "Lea el motivo en Mis reportes";
export const AVISO_CERRADO = "Su reporte se cerró. Gracias por reportarlo.";

/** El cuerpo de un aviso a quien reportó: de qué reporte habla, sin lo que escribió (los avisos pueden salir por correo). */
export const cuerpoDelReporte = (vistoEn: string) => `Su reporte de lo que vio el ${fechaDeDia(vistoEn)}`;
