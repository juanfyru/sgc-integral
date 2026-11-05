const MS_DIA = 86_400_000;

/** Número de día calendario (días desde 1970-01-01) del instante en la zona. */
function diaLocal(instante: Date, zona: string): number {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: zona,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(instante);
  const de = (tipo: Intl.DateTimeFormatPartTypes) => Number(partes.find((p) => p.type === tipo)?.value);
  return Date.UTC(de("year"), de("month") - 1, de("day")) / MS_DIA;
}

/**
 * Último milisegundo del día que resulta de sumar `dias` días calendario al día de
 * `desde`, ambos en `zona`. Busca el último instante cuyo día local no pasa del
 * objetivo, así que no depende del desfase ni de los cambios de hora de la zona.
 */
export function fechaLimite(desde: Date, dias: number, zona: string): Date {
  const objetivo = diaLocal(desde, zona) + dias;
  // Los desfases reales van de -12 h a +14 h: a -15 h del 00:00 UTC del objetivo aún no
  // llegó su día local, y a +36 h ya pasó.
  let ultimoValido = objetivo * MS_DIA - 15 * 3_600_000;
  let primerInvalido = objetivo * MS_DIA + 36 * 3_600_000;
  while (primerInvalido - ultimoValido > 1) {
    const medio = Math.floor((ultimoValido + primerInvalido) / 2);
    if (diaLocal(new Date(medio), zona) <= objetivo) ultimoValido = medio;
    else primerInvalido = medio;
  }
  return new Date(ultimoValido);
}

export function estadoPlazo(
  vence: Date | null,
  ahora: Date,
  zona: string,
): { estado: "sin_plazo" | "a_tiempo" | "vence_hoy" | "vencido"; dias: number } {
  if (!vence) return { estado: "sin_plazo", dias: 0 };
  const dias = diaLocal(vence, zona) - diaLocal(ahora, zona);
  if (dias > 0) return { estado: "a_tiempo", dias };
  if (dias === 0) return { estado: "vence_hoy", dias: 0 };
  return { estado: "vencido", dias: -dias };
}
