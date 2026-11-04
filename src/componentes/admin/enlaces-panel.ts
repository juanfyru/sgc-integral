import type { Permiso } from "@/lib/permisos";

/** Navegación del panel: cada enlace aparece solo a quien tiene su permiso. */
export const ENLACES_PANEL: ReadonlyArray<{ href: string; etiqueta: string; permiso: Permiso }> = [
  { href: "/admin", etiqueta: "Documentos", permiso: "documentos.ver_historial" },
  { href: "/admin/mapa", etiqueta: "Mapa", permiso: "mapa.administrar" },
  { href: "/admin/tipos", etiqueta: "Tipos de documento", permiso: "mapa.administrar" },
  { href: "/admin/maestro", etiqueta: "Listado Maestro", permiso: "maestro.ver" },
  { href: "/admin/estadisticas", etiqueta: "Estadísticas", permiso: "estadisticas.ver" },
  { href: "/admin/bitacora", etiqueta: "Bitácora", permiso: "bitacora.ver" },
];
