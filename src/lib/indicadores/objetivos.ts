// Regla pura de «Objetivos cumplidos» (anexo 14B, §5.2). Sin Node ni BD.

export type EstadoDeObjetivo = "cumplido" | "no_cumplido" | "sin_medicion";

export const ETIQUETA_ESTADO_OBJETIVO: Record<EstadoDeObjetivo, string> = {
  cumplido: "Cumplido",
  no_cumplido: "No cumplido",
  sin_medicion: "Sin medición",
};

// `cumplen` trae el `cumple` de la última medición con meta de cada indicador del objetivo;
// los null (sin meta) no cuentan.
export function estadoDeObjetivo(cumplen: readonly (boolean | null)[]): EstadoDeObjetivo {
  const cuentan = cumplen.filter((c): c is boolean => c !== null);
  if (cuentan.length === 0) return "sin_medicion";
  return cuentan.every((c) => c) ? "cumplido" : "no_cumplido";
}

export function objetivosCumplidos(objetivos: readonly (readonly (boolean | null)[])[]): {
  cumplidos: number;
  conMedicion: number;
} {
  let cumplidos = 0;
  let conMedicion = 0;
  for (const o of objetivos) {
    const estado = estadoDeObjetivo(o);
    if (estado === "sin_medicion") continue;
    conMedicion += 1;
    if (estado === "cumplido") cumplidos += 1;
  }
  return { cumplidos, conMedicion };
}
