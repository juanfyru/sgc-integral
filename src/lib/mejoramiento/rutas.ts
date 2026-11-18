/** Las rutas del módulo de mejoramiento: una sola definición para las páginas, los componentes y las acciones. Sin Node ni BD. */
import { puede, type SujetoPermiso } from "@/lib/permisos";

/** La página de un hallazgo. */
export const rutaDeHallazgo = (id: number) => `/mejoramiento/${id}`;

/** La página de una actividad (la ejecuta su responsable). */
export const rutaDeActividad = (id: number) => `/mejoramiento/actividades/${id}`;

/** La página donde se formula la causa raíz y el plan de un hallazgo. */
export const rutaDeFormular = (id: number) => `/mejoramiento/${id}/formular`;

/** Los impresos de un hallazgo (spec §16.4): el SGC-FO-AC-01 o, con `analisis`, el formato de ese análisis. */
export const rutaDeImprimir = (id: number, analisis?: number) =>
  `/mejoramiento/${id}/imprimir${analisis === undefined ? "" : `?analisis=${analisis}`}`;

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
