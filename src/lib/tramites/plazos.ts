const MS_DIA = 86_400_000;

/** Un formateador por zona, creado al primer uso: crearlo cuesta mucho más que usarlo, y la búsqueda del fin del día lo usa ~27 veces. */
const FORMATEADORES = new Map<string, Intl.DateTimeFormat>();

function formateadorDe(zona: string): Intl.DateTimeFormat {
  let f = FORMATEADORES.get(zona);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: zona, year: "numeric", month: "numeric", day: "numeric" });
    FORMATEADORES.set(zona, f);
  }
  return f;
}

/** Número de día calendario (días desde 1970-01-01) del instante en la zona. */
function diaLocal(instante: Date, zona: string): number {
  const partes = formateadorDe(zona).formatToParts(instante);
  const de = (tipo: Intl.DateTimeFormatPartTypes) => Number(partes.find((p) => p.type === tipo)?.value);
  return Date.UTC(de("year"), de("month") - 1, de("day")) / MS_DIA;
}

/** Fecha yyyy-mm-dd del instante en la zona. */
export function fechaEnZona(instante: Date, zona: string): string {
  return new Date(diaLocal(instante, zona) * MS_DIA).toISOString().slice(0, 10);
}

/** Último milisegundo del día `fecha` (yyyy-mm-dd) en la zona. */
export function finDeFecha(fecha: string, zona: string): Date {
  return ultimoInstanteDelDia(Date.parse(`${fecha}T00:00:00Z`) / MS_DIA, zona);
}

/**
 * Último milisegundo del día que resulta de sumar `dias` días calendario al día de
 * `desde`, ambos en `zona`.
 */
export function fechaLimite(desde: Date, dias: number, zona: string): Date {
  return ultimoInstanteDelDia(diaLocal(desde, zona) + dias, zona);
}

/**
 * Busca el último instante cuyo día local no pasa del objetivo, así que no depende del
 * desfase ni de los cambios de hora de la zona.
 */
function ultimoInstanteDelDia(objetivo: number, zona: string): Date {
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
