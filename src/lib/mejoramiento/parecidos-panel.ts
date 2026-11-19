/** Lo que responde `GET /mejoramiento/parecidos`: la fecha llega como texto ISO. */
export type ParecidoDeRuta = { id: number; codigo: string; titulo: string; etiqueta: string; abierto: boolean; cuando: string };

/** La última respuesta que llegó, de qué consulta y de qué proceso; `error` si la ruta no respondió bien. */
export type RespuestaDeParecidos = { consulta: string; procesoId: string; parecidos: ParecidoDeRuta[]; error: boolean };

export const DISTINTO = "distinto";

/** La salida que corresponde a cada parecido: abierto, una ocurrencia; cerrado, una reincidencia (spec 15 §7.5). */
export const salidaDe = (p: ParecidoDeRuta) => `${p.abierto ? "ocurrencia" : "reincidencia"}:${p.id}`;

/**
 * Qué muestra el panel de parecidos. Los resultados y la elección anteriores se conservan mientras llega la respuesta de
 * la búsqueda nueva (si no, cualquier cambio del texto perdería la elección y se crearía el duplicado que §7.5 quiere
 * evitar); solo se descartan al cambiar de proceso o cuando una respuesta nueva excluye lo elegido. Con `sinOcurrencia` (el
 * formulario llegó desde el panel de la marca de un indicador, Fase 15B anexo §6.2, o desde un hallazgo de verificación, §7.2) la
 * ocurrencia de un parecido abierto no es una salida: la que llegue elegida vuelve a «distinto».
 */
export function resolverPanelDeParecidos(x: {
  consulta: string | null;
  procesoId: string;
  respuesta: RespuestaDeParecidos | null;
  relacion: string;
  sinOcurrencia?: boolean;
}): { parecidos: ParecidoDeRuta[]; buscando: boolean; error: boolean; vigente: string } {
  if (x.consulta === null) return { parecidos: [], buscando: false, error: false, vigente: DISTINTO };
  if (x.sinOcurrencia && x.relacion.startsWith("ocurrencia:")) return resolverPanelDeParecidos({ ...x, relacion: DISTINTO });
  const mismoProceso = x.respuesta !== null && x.respuesta.procesoId === x.procesoId;
  const parecidos = mismoProceso ? x.respuesta!.parecidos : [];
  const alDia = mismoProceso && x.respuesta!.consulta === x.consulta;
  return {
    parecidos,
    buscando: !alDia,
    error: alDia && x.respuesta!.error,
    // Mientras no ha llegado ninguna respuesta (por ejemplo, tras un rechazo del formulario) se conserva lo que se eligió.
    vigente: x.respuesta === null || parecidos.some((p) => salidaDe(p) === x.relacion) ? x.relacion : DISTINTO,
  };
}
