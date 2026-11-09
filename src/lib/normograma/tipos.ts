/**
 * Los nombres del normograma (spec 13C §10): estados de una norma, relaciones entre normas y cómo se resuelve un
 * impacto documental. Sin BD: los usan la capa de datos, los esquemas y las pantallas.
 */
import { ErrorTramite } from "@/db/consultas/flujo/contrato";

export const ESTADOS_NORMA = ["vigente", "modificada", "derogada", "retirada"] as const;
export type EstadoNorma = (typeof ESTADOS_NORMA)[number];

/** Los que da «Cambiar estado»: retirar va solo por «Retirar», que exige el motivo (spec 13C §10.7). */
export const ESTADOS_A_MANO = ["vigente", "modificada", "derogada"] as const;

export const ETIQUETA_ESTADO_NORMA: Record<EstadoNorma, string> = {
  vigente: "Vigente",
  modificada: "Modificada",
  derogada: "Derogada",
  retirada: "Retirada",
};

export const TIPOS_RELACION = ["modifica", "deroga", "reglamenta"] as const;
export type TipoRelacion = (typeof TIPOS_RELACION)[number];

/** Vista desde la norma que causa la relación: «Deroga a Resolución 2003 de 2014». */
export const ETIQUETA_RELACION: Record<TipoRelacion, string> = {
  modifica: "Modifica a",
  deroga: "Deroga a",
  reglamenta: "Reglamenta a",
};

/** Vista desde la norma afectada: «Derogada por Resolución 3100 de 2019». */
export const ETIQUETA_RELACION_INVERSA: Record<TipoRelacion, string> = {
  modifica: "Modificada por",
  deroga: "Derogada por",
  reglamenta: "Reglamentada por",
};

/** El estado al que pasa la norma afectada; «reglamenta a» no cambia estados (spec 13C §10.2). */
export const ESTADO_TRAS_RELACION: Record<TipoRelacion, EstadoNorma | null> = {
  modifica: "modificada",
  deroga: "derogada",
  reglamenta: null,
};

/** Los estados a los que pasar abre impactos documentales (spec 13C §10.5). */
export const ESTADOS_CON_IMPACTO: readonly EstadoNorma[] = ["modificada", "derogada", "retirada"];

export const RESOLUCIONES_IMPACTO = ["solicitud", "no_afecta", "verificacion"] as const;
export type ResolucionImpacto = (typeof RESOLUCIONES_IMPACTO)[number];

export const ETIQUETA_RESOLUCION: Record<ResolucionImpacto, string> = {
  solicitud: "Solicitud de cambio",
  no_afecta: "No afecta",
  verificacion: "Verificación del externo",
};

/**
 * «Resolución 3100 de 2019». Es la misma cadena que arma SQL con `concat_ws(' ', tn.nombre, n.numero, 'de', n.anio)`
 * (la marca del semáforo y los externos): las dos deben coincidir.
 */
export function nombreDeNorma(n: { tipo: string; numero: string; anio: number }): string {
  return `${n.tipo} ${n.numero} de ${n.anio}`;
}

/** Una fecha de la norma (`yyyy-mm-dd`: expedición, estado, cambio) como «25/11/2019», sin pasar por la zona. */
export function fechaDeNorma(fecha: string): string {
  const [anio, mes, dia] = fecha.split("-");
  return `${dia}/${mes}/${anio}`;
}

/** «Derogada · 25/11/2019»; vigente sin fecha, «Vigente». El estado va siempre en texto, nunca solo en color. */
export function textoEstadoNorma(estado: EstadoNorma, estadoEn: string | null): string {
  return estadoEn && estado !== "vigente" ? `${ETIQUETA_ESTADO_NORMA[estado]} · ${fechaDeNorma(estadoEn)}` : ETIQUETA_ESTADO_NORMA[estado];
}

/** La página de los impactos de un cambio en un proceso: el enlace de su tarea y de sus avisos. */
export function enlaceDeImpacto(cambioId: number, procesoId: number): string {
  return `/normograma/impactos/${cambioId}?proceso=${procesoId}`;
}

/** Error de negocio del normograma: su mensaje se le muestra a la persona. */
export class ErrorNormograma extends ErrorTramite {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ErrorNormograma";
  }
}

/** Texto recortado de largo acotado; `nombre` lleva su artículo («El motivo»). */
export function acotado(valor: string | null | undefined, nombre: string, minimo: number, maximo: number): string {
  const limpio = typeof valor === "string" ? valor.trim() : "";
  if (limpio.length < minimo) {
    throw new ErrorNormograma(`${nombre} debe tener al menos ${minimo} ${minimo === 1 ? "carácter" : "caracteres"}`);
  }
  if (limpio.length > maximo) throw new ErrorNormograma(`${nombre} no puede pasar de ${maximo} caracteres`);
  return limpio;
}

/** Como `acotado`, pero vacío es nulo. */
export function opcionalAcotado(valor: string | null | undefined, nombre: string, maximo: number): string | null {
  const limpio = typeof valor === "string" ? valor.trim() : "";
  if (!limpio) return null;
  if (limpio.length > maximo) throw new ErrorNormograma(`${nombre} no puede pasar de ${maximo} caracteres`);
  return limpio;
}

/** Una fecha yyyy-mm-dd que existe en el calendario. */
export function fechaValida(valor: string | null | undefined, nombre = "La fecha"): string {
  const fecha = typeof valor === "string" ? valor.trim() : "";
  const instante = /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? new Date(`${fecha}T00:00:00Z`) : null;
  // `Date` corre al mes siguiente un día que no existe («2026-02-30»): se compara con lo escrito.
  if (!instante || Number.isNaN(instante.getTime()) || instante.toISOString().slice(0, 10) !== fecha) {
    throw new ErrorNormograma(`${nombre} no es válida`);
  }
  return fecha;
}
