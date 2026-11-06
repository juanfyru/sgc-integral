export const TIPOS_SOLICITUD = ["crear", "modificar", "eliminar"] as const;
export type TipoSolicitud = (typeof TIPOS_SOLICITUD)[number];

export const MOTIVOS = [
  "cambio_normativo",
  "mejora",
  "no_conformidad",
  "solicitud_personal",
  "revision_anual",
] as const;
export type Motivo = (typeof MOTIVOS)[number];

export const ETAPAS_TRABAJO = [
  "visto_bueno",
  "aceptacion",
  "elaboracion",
  "revision",
  "aprobacion",
  "publicacion",
] as const;
export const ETAPAS_FINALES = ["publicado", "eliminado", "rechazado", "cancelado"] as const;
/** Las de trabajo, para `etapa = ANY(...)`: postgres.js no acepta un arreglo de solo lectura. */
export const ETAPAS_ABIERTAS: string[] = [...ETAPAS_TRABAJO];
export type EtapaTrabajo = (typeof ETAPAS_TRABAJO)[number];
export type Etapa = EtapaTrabajo | (typeof ETAPAS_FINALES)[number];

/** Hasta aquí se corrigen los datos de control; desde la aprobación quedan fijos (spec 13A §8.6). */
export const ETAPAS_CON_CORRECCION: readonly Etapa[] = ["elaboracion", "revision"];

export function esEtapaDeTrabajo(e: Etapa): e is EtapaTrabajo {
  return (ETAPAS_TRABAJO as readonly string[]).includes(e);
}

/** Sin ítems activos no hay evidencia del PC-05: lo rechaza `validarConcepto` y lo avisa el panel de revisión (F13A-R37). */
export const SIN_ITEMS_ACTIVOS = "No hay ítems activos en la lista de verificación. Pida al Administrador del SGC que los active.";

export const LARGO_MIN_NOTA_CRITERIO = 5;
export const FALTA_NOTA_CRITERIO = "Escriba una nota en cada criterio que no cumple";

export const FIRMAS = ["elaboro", "reviso", "aprobo", "publico"] as const;
export type Firma = (typeof FIRMAS)[number];

/** Dónde se aprobó una versión: con las firmas del trámite, o fuera de la plataforma (spec 13A §13.2). */
export type OrigenAprobacion = "plataforma" | "fuera";

/** El número más alto con que un documento puede entrar por la carga: su versión real. */
export const NUMERO_MAXIMO_DE_VERSION = 999;

/** Cómo lo dice el Listado Maestro, en su columna «Aprobación». */
export const APROBACION_EN_LISTADO: Record<OrigenAprobacion, string> = {
  plataforma: "En la plataforma",
  fuera: "Fuera de la plataforma",
};

/** Cómo lo dice cada versión en el detalle del panel. */
export const APROBACION_DE_VERSION: Record<OrigenAprobacion, string> = {
  plataforma: "Aprobada en la plataforma",
  fuera: "Aprobación registrada fuera de la plataforma",
};

/** Las que puede escribir quien aprueba al devolver el documento. */
export const MAX_OBSERVACIONES_APROBACION = 10;

/** Quién aprueba lo que nace de un documento: la alta dirección o el Administrador del SGC. */
export type Autoridad = "estrategico" | "operativo";

export const ETIQUETA_ETAPA: Record<Etapa, string> = {
  visto_bueno: "Visto bueno",
  aceptacion: "Aceptación",
  elaboracion: "Elaboración",
  revision: "Revisión",
  aprobacion: "Aprobación",
  publicacion: "Publicación",
  publicado: "Publicado",
  eliminado: "Eliminado",
  rechazado: "Rechazado",
  cancelado: "Cancelado",
};

export const ETIQUETA_MOTIVO: Record<Motivo, string> = {
  cambio_normativo: "Cambio normativo",
  mejora: "Mejora del proceso",
  no_conformidad: "No conformidad",
  solicitud_personal: "Solicitud del personal",
  revision_anual: "Revisión anual",
};

export const ETIQUETA_TIPO_SOLICITUD: Record<TipoSolicitud, string> = {
  crear: "Crear",
  modificar: "Modificar",
  eliminar: "Eliminar",
};

export const ETIQUETA_FIRMA: Record<Firma, string> = {
  elaboro: "Elaboró",
  reviso: "Revisó",
  aprobo: "Aprobó",
  publico: "Publicó",
};

/** Un grupo se resume: la bandeja, el encabezado y el aviso al jefe nombran solo al primero. */
export function textoResponsables(nombres: readonly string[]): string {
  if (nombres.length === 0) return "—";
  return nombres.length === 1 ? nombres[0] : `${nombres[0]} y ${nombres.length - 1} más`;
}

/** Principio y fin de la huella: alcanza para comparar a simple vista. */
export function huellaAbreviada(hash: string): string {
  return `${hash.slice(0, 4)}…${hash.slice(-4)}`;
}
