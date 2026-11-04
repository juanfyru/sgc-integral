import type { Rol } from "@/lib/roles";

export type Permiso =
  | "panel.entrar"
  | "documentos.administrar"
  | "documentos.ver_historial"
  | "mapa.administrar"
  | "maestro.ver"
  | "maestro.exportar"
  | "estadisticas.ver"
  | "bitacora.ver"
  | "accesos.ver"
  | "usuarios.administrar"
  | "estructura.administrar"
  | "sesiones.administrar";

/** Matriz fija rol -> permiso (diseño F11 §5). */
export const MATRIZ: Record<Permiso, readonly Rol[]> = {
  "panel.entrar": ["admin_sgc", "gerencia", "control_interno"],
  "documentos.administrar": ["admin_sgc"],
  "documentos.ver_historial": ["admin_sgc", "control_interno"],
  "mapa.administrar": ["admin_sgc"],
  "maestro.ver": ["admin_sgc", "gerencia", "control_interno"],
  "maestro.exportar": ["admin_sgc", "control_interno"],
  "estadisticas.ver": ["admin_sgc", "gerencia", "control_interno"],
  "bitacora.ver": ["admin_sgc", "control_interno"],
  "accesos.ver": ["admin_sgc", "control_interno"],
  "usuarios.administrar": ["admin_sgc"],
  "estructura.administrar": ["admin_sgc"],
  "sesiones.administrar": ["admin_sgc"],
};

export const PERMISOS = Object.keys(MATRIZ) as readonly Permiso[];

export type SujetoPermiso = { rol: Rol; verHistorial?: boolean };

export function puede(sujeto: SujetoPermiso, permiso: Permiso): boolean {
  // La marca individual verHistorial concede únicamente documentos.ver_historial.
  if (permiso === "documentos.ver_historial" && sujeto.verHistorial === true) return true;
  return MATRIZ[permiso].includes(sujeto.rol);
}

export class ErrorPermiso extends Error {
  constructor() {
    super("Sin permiso para esta acción");
    this.name = "ErrorPermiso";
  }
}

export function requerirPermiso(sujeto: SujetoPermiso, permiso: Permiso): void {
  if (!puede(sujeto, permiso)) throw new ErrorPermiso();
}

export function permisosDe(sujeto: SujetoPermiso): Permiso[] {
  return PERMISOS.filter((p) => puede(sujeto, p));
}

/**
 * Entrada al panel: panel.entrar o la marca individual ver_historial (que
 * concede documentos.ver_historial a cualquier rol). Quien solo tiene la marca
 * ve únicamente la lista y el detalle de documentos, en solo lectura.
 */
export function puedeEntrarAlPanel(sujeto: SujetoPermiso): boolean {
  return puede(sujeto, "panel.entrar") || puede(sujeto, "documentos.ver_historial");
}

/** Alcance efectivo del Listado Maestro: lo no vigente exige documentos.ver_historial. */
export function alcanceMaestro(
  sujeto: SujetoPermiso,
  solicitado: string | null | undefined,
): "vigentes" | "todos" {
  return solicitado === "todos" && puede(sujeto, "documentos.ver_historial") ? "todos" : "vigentes";
}
