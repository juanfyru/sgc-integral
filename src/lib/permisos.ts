import type { Rol } from "@/lib/roles";

export type Permiso =
  | "panel.entrar"
  | "documentos.administrar"
  | "documentos.ver_historial"
  | "mapa.administrar"
  | "entidad.administrar"
  | "maestro.ver"
  | "maestro.exportar"
  | "estadisticas.ver"
  | "bitacora.ver"
  | "accesos.ver"
  | "usuarios.administrar"
  | "estructura.administrar"
  | "sesiones.administrar"
  | "tramites.solicitar"
  | "tramites.visto_bueno"
  | "tramites.participar"
  | "tramites.revisar"
  | "tramites.aprobar"
  | "tramites.gestionar"
  | "distribucion.ver"
  | "distribucion.gestionar"
  | "distribucion.responder"
  | "copias.emitir"
  | "acuses.confirmar"
  | "socializaciones.registrar"
  | "verificaciones.realizar"
  | "vigencia.ver"
  | "documentos.ratificar"
  | "revision_anual.gestionar"
  | "revision_anual.decidir"
  | "externos.gestionar"
  | "externos.verificar"
  | "normograma.administrar"
  | "normograma.procesos"
  | "documentos.indicadores"
  | "indicadores.administrar"
  | "indicadores.aprobar"
  | "indicadores.medir"
  | "indicadores.observar";

/** Matriz fija rol -> permiso (diseño F11 §5). */
export const MATRIZ: Record<Permiso, readonly Rol[]> = {
  "panel.entrar": ["admin_sgc", "gerencia", "control_interno"],
  "documentos.administrar": ["admin_sgc"],
  "documentos.ver_historial": ["admin_sgc", "control_interno"],
  "mapa.administrar": ["admin_sgc"],
  "entidad.administrar": ["admin_sgc"],
  "maestro.ver": ["admin_sgc", "gerencia", "control_interno"],
  "maestro.exportar": ["admin_sgc", "control_interno"],
  "estadisticas.ver": ["admin_sgc", "gerencia", "control_interno"],
  "bitacora.ver": ["admin_sgc", "control_interno"],
  "accesos.ver": ["admin_sgc", "control_interno"],
  "usuarios.administrar": ["admin_sgc"],
  "estructura.administrar": ["admin_sgc"],
  "sesiones.administrar": ["admin_sgc"],
  "tramites.solicitar": ["admin_sgc", "lider_proceso"],
  "tramites.visto_bueno": ["lider_proceso"],
  "tramites.participar": ["admin_sgc", "gerencia", "control_interno", "lider_proceso", "consulta"],
  "tramites.revisar": ["admin_sgc", "lider_proceso"],
  "tramites.aprobar": ["admin_sgc", "gerencia"],
  "tramites.gestionar": ["admin_sgc"],
  "distribucion.ver": ["admin_sgc", "gerencia", "control_interno", "lider_proceso"],
  "distribucion.gestionar": ["admin_sgc"],
  "distribucion.responder": ["admin_sgc", "gerencia", "control_interno", "lider_proceso", "consulta"],
  "copias.emitir": ["admin_sgc", "lider_proceso"],
  "acuses.confirmar": ["admin_sgc", "gerencia", "control_interno", "lider_proceso", "consulta"],
  "socializaciones.registrar": ["admin_sgc", "lider_proceso"],
  "verificaciones.realizar": ["admin_sgc"],
  "vigencia.ver": ["admin_sgc", "gerencia", "control_interno", "lider_proceso"],
  "documentos.ratificar": ["admin_sgc", "gerencia", "lider_proceso"],
  "revision_anual.gestionar": ["admin_sgc"],
  "revision_anual.decidir": ["admin_sgc", "lider_proceso"],
  "externos.gestionar": ["admin_sgc", "lider_proceso"],
  "externos.verificar": ["admin_sgc", "gerencia", "control_interno", "lider_proceso", "consulta"],
  "normograma.administrar": ["admin_sgc"],
  "normograma.procesos": ["admin_sgc", "lider_proceso"],
  "documentos.indicadores": ["admin_sgc", "gerencia", "control_interno", "lider_proceso"],
  "indicadores.administrar": ["admin_sgc"],
  "indicadores.aprobar": ["gerencia", "lider_proceso"],
  "indicadores.medir": ["admin_sgc", "gerencia", "control_interno", "lider_proceso", "consulta"],
  "indicadores.observar": ["admin_sgc", "gerencia", "control_interno", "lider_proceso", "consulta"],
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
