export const ZONA_HORARIA_DEFECTO = "America/Bogota";

/** Zona horaria de la instalación (`ZONA_HORARIA`, por defecto America/Bogota); lanza si no es válida. */
export function zonaHoraria(): string {
  const valor = process.env.ZONA_HORARIA?.trim() || ZONA_HORARIA_DEFECTO;
  try {
    new Intl.DateTimeFormat("es-CO", { timeZone: valor });
  } catch {
    throw new Error(
      `ZONA_HORARIA no es una zona horaria válida: «${valor}» (use un nombre IANA, p. ej. America/Bogota)`,
    );
  }
  return valor;
}

function partesLocales(d: Date): Record<"year" | "month" | "day" | "hour" | "minute", string> {
  const partes = new Intl.DateTimeFormat("es-CO", {
    timeZone: zonaHoraria(),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const de = (tipo: Intl.DateTimeFormatPartTypes) => partes.find((p) => p.type === tipo)?.value ?? "";
  return { year: de("year"), month: de("month"), day: de("day"), hour: de("hour"), minute: de("minute") };
}

/** «AAAA-MM-DD HH:mm» en la zona de la instalación (p. ej. la emisión del Listado Maestro). */
export function fechaHoraLocal(d: Date): string {
  const p = partesLocales(d);
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

/** «AAAAMMDD» en la zona de la instalación, para nombres de archivo. */
export function fechaCompactaLocal(d: Date): string {
  const p = partesLocales(d);
  return `${p.year}${p.month}${p.day}`;
}
