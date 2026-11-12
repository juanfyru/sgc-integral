/**
 * Las rutas del módulo de indicadores: una sola definición para las páginas, los componentes y las lecturas. Sin Node ni
 * BD.
 */

/** La página de un indicador. */
export const rutaDeIndicador = (codigo: string) => `/indicadores/${encodeURIComponent(codigo)}`;

/** La página de edición de la ficha de un indicador. */
export const rutaDeEdicion = (codigo: string) => `${rutaDeIndicador(codigo)}/editar`;
