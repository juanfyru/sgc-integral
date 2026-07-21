import type { PuntoSerie } from "@/db/consultas/estadisticas";

export type Barra = {
  x: number;
  y: number;
  ancho: number;
  alto: number;
  fecha: string;
  conteo: number;
};

/** Geometría pura de las barras: mapea la serie a rectángulos SVG. */
export function calcularBarras(
  serie: PuntoSerie[],
  opciones: { ancho: number; alto: number; separacion: number },
): Barra[] {
  if (serie.length === 0) return [];
  const max = Math.max(...serie.map((p) => p.conteo), 1);
  const anchoBanda = opciones.ancho / serie.length;
  const anchoBarra = Math.max(anchoBanda - opciones.separacion, 1);
  return serie.map((p, i) => {
    const alto = (p.conteo / max) * opciones.alto;
    return {
      x: i * anchoBanda + opciones.separacion / 2,
      y: opciones.alto - alto,
      ancho: anchoBarra,
      alto,
      fecha: p.fecha,
      conteo: p.conteo,
    };
  });
}
