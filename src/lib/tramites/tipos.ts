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
export type EtapaTrabajo = (typeof ETAPAS_TRABAJO)[number];
export type Etapa = EtapaTrabajo | (typeof ETAPAS_FINALES)[number];

export function esEtapaDeTrabajo(e: Etapa): e is EtapaTrabajo {
  return (ETAPAS_TRABAJO as readonly string[]).includes(e);
}

export const FIRMAS = ["elaboro", "reviso", "aprobo", "publico"] as const;
export type Firma = (typeof FIRMAS)[number];

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
