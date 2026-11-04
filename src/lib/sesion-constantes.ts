// Separado de sesion.ts a propósito: proxy.ts lo importa y su bundle
// no debe arrastrar el cliente de postgres.
export const COOKIE_SESION = "sgc_sesion";

/** Cabecera interna con la ruta pedida (la fija el proxy; rutaInterna la sanea al usarla). */
export const CABECERA_RUTA = "x-sgc-ruta";
