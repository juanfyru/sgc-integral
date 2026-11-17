/** Las rutas del módulo de mejoramiento: una sola definición para las páginas, los componentes y las acciones. Sin Node ni BD. */

/** La página de un hallazgo. */
export const rutaDeHallazgo = (id: number) => `/mejoramiento/${id}`;

/** La página de una actividad (la ejecuta su responsable). */
export const rutaDeActividad = (id: number) => `/mejoramiento/actividades/${id}`;

/** La página donde se formula la causa raíz y el plan de un hallazgo. */
export const rutaDeFormular = (id: number) => `/mejoramiento/${id}/formular`;
