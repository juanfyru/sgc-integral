import { puede, type Permiso, type SujetoPermiso } from "@/lib/permisos";

export type IconoNav =
  | "inicio"
  | "buscar"
  | "tramites"
  | "distribucion"
  | "documentos"
  | "maestro"
  | "tipos"
  | "configuracion"
  | "mapa"
  | "entidad"
  | "estructura"
  | "puntos"
  | "listas"
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
  /** Se ve con cualquiera de estos permisos. */
  algunPermiso?: readonly Permiso[];
  /** Se ve también si la persona participa en algún trámite. */
  siParticipa?: true;
  /** Se ve también si la persona responde por algún punto de uso activo. */
  siResponsable?: true;
  exacta?: boolean;
  /** Rutas adicionales que también marcan la entrada como activa (igual al prefijo o debajo de él). */
  prefijos?: readonly string[];
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
    href: "/tramites",
    etiqueta: "Trámites",
    icono: "tramites",
    grupo: "documentos",
    algunPermiso: ["tramites.solicitar", "tramites.gestionar", "tramites.aprobar"],
    siParticipa: true,
  },
  {
    href: "/distribucion",
    etiqueta: "Distribución",
    icono: "distribucion",
    grupo: "documentos",
    permiso: "distribucion.ver",
    siResponsable: true,
  },
  {
    href: "/admin",
    etiqueta: "Gestión de documentos",
    icono: "documentos",
    grupo: "documentos",
    permiso: "documentos.ver_historial",
    exacta: true,
    prefijos: ["/admin/documentos"],
  },
  { href: "/admin/maestro", etiqueta: "Listado Maestro", icono: "maestro", grupo: "documentos", permiso: "maestro.ver" },
  { href: "/admin/tipos", etiqueta: "Tipos de documento", icono: "tipos", grupo: "documentos", permiso: "mapa.administrar" },
  {
    href: "/admin/configuracion-documental",
    etiqueta: "Configuración documental",
    icono: "configuracion",
    grupo: "documentos",
    permiso: "tramites.gestionar",
  },
  { href: "/admin/mapa", etiqueta: "Mapa de procesos", icono: "mapa", grupo: "documentos", permiso: "mapa.administrar" },
  {
    href: "/admin/entidad",
    etiqueta: "Entidad y marca",
    icono: "entidad",
    grupo: "administracion",
    permiso: "entidad.administrar",
  },
  {
    href: "/admin/estructura",
    etiqueta: "Estructura",
    icono: "estructura",
    grupo: "administracion",
    permiso: "estructura.administrar",
  },
  {
    href: "/admin/puntos-uso",
    etiqueta: "Puntos de uso",
    icono: "puntos",
    grupo: "administracion",
    permiso: "distribucion.gestionar",
  },
  {
    href: "/admin/listas-distribucion",
    etiqueta: "Listas de distribución",
    icono: "listas",
    grupo: "administracion",
    permiso: "distribucion.gestionar",
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

/** Entradas que el sujeto puede ver; una entrada sin condiciones la ve todo usuario con sesión. */
export function entradasVisibles(sujeto: SujetoPermiso & { participaEnTramites?: boolean; responsableDePuntos?: boolean }): EntradaNav[] {
  return NAVEGACION.filter((e) => {
    if (!e.permiso && !e.algunPermiso && !e.siParticipa && !e.siResponsable) return true;
    if (e.permiso && puede(sujeto, e.permiso)) return true;
    if (e.algunPermiso?.some((p) => puede(sujeto, p))) return true;
    if (e.siResponsable === true && sujeto.responsableDePuntos === true) return true;
    return e.siParticipa === true && sujeto.participaEnTramites === true;
  });
}

/** `/` y `/admin` se marcan solo en su ruta exacta; el resto también en sus subrutas. */
export function esActiva(entrada: EntradaNav, ruta: string): boolean {
  if (entrada.prefijos?.some((p) => ruta === p || ruta.startsWith(`${p}/`))) return true;
  if (entrada.exacta) return ruta === entrada.href;
  return ruta === entrada.href || ruta.startsWith(`${entrada.href}/`);
}
