/** Las rutas del módulo de mejoramiento: una sola definición para las páginas, los componentes y las acciones. Sin Node ni BD. */
import { puede, type SujetoPermiso } from "@/lib/permisos";

/** La página de un hallazgo. */
export const rutaDeHallazgo = (id: number) => `/mejoramiento/${id}`;

/** La página de una actividad (la ejecuta su responsable). */
export const rutaDeActividad = (id: number) => `/mejoramiento/actividades/${id}`;

/** La página donde se formula la causa raíz y el plan de un hallazgo. */
export const rutaDeFormular = (id: number) => `/mejoramiento/${id}/formular`;

/** La pestaña «Planes» (Fase 15B, anexo §3.9). */
export const RUTA_PLANES = "/mejoramiento/planes";

/** El formulario de un plan nuevo. */
export const RUTA_NUEVO_PLAN = "/mejoramiento/planes/nuevo";

/** La página de un plan de mejoramiento. */
export const rutaDePlan = (id: number) => `/mejoramiento/planes/${id}`;

/** El formulario para editar un plan. */
export const rutaDeEditarPlan = (id: number) => `/mejoramiento/planes/${id}/editar`;

/** El selector de hallazgos para añadir a un plan. */
export const rutaDeAnadirAPlan = (id: number) => `/mejoramiento/planes/${id}/anadir`;

/** El Excel para el ente de un plan (anexo §4): una descarga auditada, un enlace simple (su ruta llega en la Tarea 6). */
export const rutaDelExcelDelPlan = (id: number) => `/mejoramiento/planes/${id}/excel`;

/** Los impresos de un hallazgo (spec §16.4): el SGC-FO-AC-01 o, con `analisis`, el formato de ese análisis. */
export const rutaDeImprimir = (id: number, analisis?: number) =>
  `/mejoramiento/${id}/imprimir${analisis === undefined ? "" : `?analisis=${analisis}`}`;

/**
 * Los parámetros de `/mejoramiento/nuevo` que llegan con algo puesto (Fase 15B, anexo §3.4 y §10.3), además de `derivado`,
 * `reporte` y `modo`: tal como vienen en la dirección, sin validar (`prellenadoDeRegistro` ignora lo que no reconoce o no admite).
 */
export type ParametrosDeRegistro = {
  /** El id de un plan de mejoramiento. */
  plan?: string;
  /** El código de un documento. */
  documento?: string;
  /** El código de un indicador. */
  indicador?: string;
  /** El slug de un proceso. */
  proceso?: string;
  /** Los enganches (Tareas 8, 10 y 11), por id; si llega más de uno, manda el primero de este orden. */
  medicion?: string;
  verificacion?: string;
  impacto?: string;
  impactoIndicador?: string;
};

/** Los parámetros de registro en el orden en que van en la dirección. */
export const PARAMETROS_DE_REGISTRO = [
  "plan",
  "documento",
  "indicador",
  "proceso",
  "medicion",
  "verificacion",
  "impacto",
  "impactoIndicador",
] as const satisfies ReadonlyArray<keyof ParametrosDeRegistro>;

/** `/mejoramiento/nuevo` con los parámetros que vienen (los vacíos no van), en un orden fijo y codificados. */
export function rutaDeRegistro(p: ParametrosDeRegistro): string {
  const q = new URLSearchParams();
  for (const k of PARAMETROS_DE_REGISTRO) {
    const v = p[k];
    if (typeof v === "string" && v !== "") q.set(k, v);
  }
  const texto = q.toString();
  return texto ? `/mejoramiento/nuevo?${texto}` : "/mejoramiento/nuevo";
}

/**
 * Si la persona se queda en la lista de hallazgos (spec 15 §16.1): la ve quien ve algún hallazgo y, aunque esté vacía, quien
 * registra o ve todos (`mejora.registrar`, `mejora.ver_todo`), que es su lugar de trabajo. Una sola regla para la redirección de
 * `/mejoramiento` y la pestaña «Hallazgos».
 */
export function veLaLista(sujeto: SujetoPermiso, veHallazgos: boolean): boolean {
  return veHallazgos || puede(sujeto, "mejora.registrar") || puede(sujeto, "mejora.ver_todo");
}

/** Adónde va quien no se queda en la lista: a «Mis actividades» si tiene alguna y, si no, a «Mis reportes»; nulo si se queda. */
export function adondeVaSinLista(sujeto: SujetoPermiso, x: { veHallazgos: boolean; tieneActividades: boolean }): string | null {
  if (veLaLista(sujeto, x.veHallazgos)) return null;
  return x.tieneActividades ? "/mejoramiento/actividades" : "/mejoramiento/reportes";
}
