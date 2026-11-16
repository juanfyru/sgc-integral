/**
 * Las rutas del módulo de indicadores: una sola definición para las páginas, los componentes y las lecturas. Sin Node ni
 * BD.
 */

/** La página de un indicador. */
export const rutaDeIndicador = (codigo: string) => `/indicadores/${encodeURIComponent(codigo)}`;

/** La página de edición de la ficha de un indicador. */
export const rutaDeEdicion = (codigo: string) => `${rutaDeIndicador(codigo)}/editar`;

/** La página de un dato compartido (anexo 14C, §4.7). */
export const rutaDeDato = (datoId: number) => `/indicadores/datos/${datoId}`;

/** La descarga del soporte de un periodo de un dato compartido: siempre como descarga (anexo 14C, §4.6). */
export const rutaDeSoporteDeDato = (datoId: number, archivoId: number) => `${rutaDeDato(datoId)}/soportes/${archivoId}`;

/** La subida y la quitada (`?archivo=`) de los soportes de un periodo de un dato compartido. */
export const rutaDeSubidaDeDato = (periodoId: number) => `/api/datos-compartidos/${periodoId}/archivos`;

/**
 * El año de `?anio=AAAA` de la impresión, los Excel y la matriz: sin parámetro, el en curso (en la zona de la
 * instalación); otro formato, uno antes de 1900 o uno que no ha llegado, `null` («no encontrado»).
 */
export function anioDeConsulta(valor: string | string[] | null | undefined, enCurso: number): number | null {
  if (valor === undefined || valor === null) return enCurso;
  if (typeof valor !== "string" || !/^\d{4}$/.test(valor)) return null;
  const anio = Number(valor);
  return anio < 1900 || anio > enCurso ? null : anio;
}
