import { periodoDe } from "@/lib/indicadores-documentales/periodo";

/** La dirección del soporte de una medición: siempre se descarga, con el nombre original al final (cosmético). */
export const enlaceDeSoporte = (codigo: string, s: { id: number; nombre: string }) =>
  `/indicadores/${encodeURIComponent(codigo)}/soportes/${s.id}/${encodeURIComponent(s.nombre)}`;

/**
 * Un soporte de un dato compartido, como lo enlaza la pantalla de un indicador que lo usa (anexo 14C, §4.6): su descarga va
 * por la ruta del dato; `deQue` es el periodo del dato («octubre de 2026») cuando el dato es más fino que el indicador.
 */
export type SoporteDeDatoEnPantalla = { id: number; datoId: number; nombre: string; mime: string; tamano: number; deQue: string | null };

/** Un soporte de un dato para la pantalla de la medición de `periodo`: con el periodo del dato en palabras si es otro. */
export function soporteDeDatoEnPantalla(
  s: { id: number; datoId: number; nombre: string; mime: string; tamano: number; periodo: string },
  periodo: string,
  zona: string,
): SoporteDeDatoEnPantalla {
  const deQue = s.periodo === periodo ? null : (periodoDe(s.periodo, zona)?.etiqueta ?? s.periodo);
  return { id: s.id, datoId: s.datoId, nombre: s.nombre, mime: s.mime, tamano: s.tamano, deQue };
}
