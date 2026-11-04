import { puede, type Permiso, type SujetoPermiso } from "@/lib/permisos";

export type IconoNav =
  | "inicio"
  | "buscar"
  | "documentos"
  | "maestro"
  | "tipos"
  | "mapa"
  | "entidad"
  | "estructura"
  | "usuarios"
  | "estadisticas"
  | "bitacora"
  | "accesos"
  | "sesiones";

export type GrupoNav = "inicio" | "documentos" | "administracion";

export type EntradaNav = {
  href: string;
  etiqueta: string;
  icono: IconoNav;
  grupo: GrupoNav;
  permiso?: Permiso;
  exacta?: boolean;
};

export const GRUPOS: Record<GrupoNav, { etiqueta: string | null; color: "marca" | "mod-documentos" }> = {
  inicio: { etiqueta: null, color: "marca" },
  documentos: { etiqueta: "Documentos", color: "mod-documentos" },
  administracion: { etiqueta: "Administración", color: "marca" },
};

/** Fuente única de la barra lateral y de la paleta de búsqueda; los módulos futuros no aparecen hasta existir. */
export const NAVEGACION: readonly EntradaNav[] = [
  { href: "/", etiqueta: "Inicio", icono: "inicio", grupo: "inicio", exacta: true },
  { href: "/buscar", etiqueta: "Buscar documentos", icono: "buscar", grupo: "documentos" },
  {
    href: "/admin",
    etiqueta: "Gestión de documentos",
    icono: "documentos",
    grupo: "documentos",
    permiso: "documentos.ver_historial",
    exacta: true,
  },
  { href: "/admin/maestro", etiqueta: "Listado Maestro", icono: "maestro", grupo: "documentos", permiso: "maestro.ver" },
  { href: "/admin/tipos", etiqueta: "Tipos de documento", icono: "tipos", grupo: "documentos", permiso: "mapa.administrar" },
  { href: "/admin/mapa", etiqueta: "Mapa de procesos", icono: "mapa", grupo: "documentos", permiso: "mapa.administrar" },
  {
    href: "/admin/entidad",
    etiqueta: "Entidad y marca",
    icono: "entidad",
    grupo: "administracion",
    // TODO T11: pasa a "entidad.administrar" cuando el permiso exista en la matriz.
    permiso: "mapa.administrar",
  },
  {
    href: "/admin/estructura",
    etiqueta: "Estructura",
    icono: "estructura",
    grupo: "administracion",
    permiso: "estructura.administrar",
  },
  { href: "/admin/usuarios", etiqueta: "Usuarios", icono: "usuarios", grupo: "administracion", permiso: "usuarios.administrar" },
  {
    href: "/admin/estadisticas",
    etiqueta: "Estadísticas",
    icono: "estadisticas",
    grupo: "administracion",
    permiso: "estadisticas.ver",
  },
  { href: "/admin/bitacora", etiqueta: "Bitácora", icono: "bitacora", grupo: "administracion", permiso: "bitacora.ver" },
  { href: "/admin/accesos", etiqueta: "Accesos", icono: "accesos", grupo: "administracion", permiso: "accesos.ver" },
  { href: "/admin/sesiones", etiqueta: "Sesiones", icono: "sesiones", grupo: "administracion", permiso: "sesiones.administrar" },
];

/** Entradas que el sujeto puede ver; una entrada sin permiso la ve todo usuario con sesión. */
export function entradasVisibles(sujeto: SujetoPermiso): EntradaNav[] {
  return NAVEGACION.filter((e) => !e.permiso || puede(sujeto, e.permiso));
}

/** `/` y `/admin` se marcan solo en su ruta exacta; el resto también en sus subrutas. */
export function esActiva(entrada: EntradaNav, ruta: string): boolean {
  if (entrada.exacta) return ruta === entrada.href;
  return ruta === entrada.href || ruta.startsWith(`${entrada.href}/`);
}
