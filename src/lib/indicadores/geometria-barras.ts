/**
 * La geometría de las barras acostadas del desglose de un indicador desagregado (anexo 14C, §5.6, maqueta 8): el ancho de
 * cada barra y la posición de la meta, en porcentaje de 0 a 100 sobre el mayor de los valores y la meta. Trabaja sobre
 * números (quien llama los saca de la fracción exacta): el número solo da el ancho; el color y el estado salen del semáforo.
 * Sin React, sin Node ni BD.
 */

/** El porcentaje del ancho, con tres decimales, como las demás gráficas. */
const enPorcentaje = (v: number, mayor: number) => Number(((Math.min(v, mayor) * 100) / mayor).toFixed(3));

/**
 * El ancho de cada fila y la posición de la meta (`null` sin meta). Un valor nulo, cero o negativo no tiene barra (ancho 0):
 * las barras crecen desde el cero hacia la derecha.
 */
export function barrasAcostadas(
  filas: readonly { etiqueta: string; valor: number | null }[],
  meta: number | null,
): { filas: { etiqueta: string; ancho: number }[]; meta: number | null } {
  const positivos = [...filas.map((f) => f.valor), meta].filter((v): v is number => v !== null && Number.isFinite(v) && v > 0);
  const mayor = positivos.length === 0 ? 0 : Math.max(...positivos);
  const ancho = (v: number | null) => (v === null || !Number.isFinite(v) || v <= 0 || mayor === 0 ? 0 : enPorcentaje(v, mayor));
  return { filas: filas.map((f) => ({ etiqueta: f.etiqueta, ancho: ancho(f.valor) })), meta: meta === null ? null : ancho(meta) };
}
