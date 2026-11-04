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

/** «hace 5 min», «hace 2 h», «ayer» o «AAAA-MM-DD»; el día se cuenta en la zona de la instalación. */
export function tiempoRelativo(fecha: Date, ahora: Date = new Date()): string {
  const minutos = Math.floor((ahora.getTime() - fecha.getTime()) / 60_000);
  if (minutos < 1) return "ahora";
  if (minutos < 60) return `hace ${minutos} min`;
  const dia = (d: Date) => {
    const p = partesLocales(d);
    return Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day)) / 86_400_000;
  };
  const dias = dia(ahora) - dia(fecha);
  if (dias <= 0) return `hace ${Math.floor(minutos / 60)} h`;
  if (dias === 1) return "ayer";
  const p = partesLocales(fecha);
  return `${p.year}-${p.month}-${p.day}`;
}
