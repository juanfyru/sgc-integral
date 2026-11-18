/** Formatos de fecha de las pantallas del módulo, en español y siempre en la zona de la instalación. Sin Node ni BD. */

/** «3 nov 2026» de un `yyyy-mm-dd`. */
export function fechaDeDia(dia: string): string {
  const ms = Date.parse(`${dia}T00:00:00Z`);
  if (Number.isNaN(ms)) return dia;
  return new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(ms);
}

/** «4 nov 2026, 3:15 p. m.» de un instante, en la zona dada. */
export function fechaYHora(instante: Date, zona: string): string {
  return new Intl.DateTimeFormat("es-CO", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: zona,
  }).format(instante);
}

/** «4 nov» de un instante, en la zona dada. */
export function diaCorto(instante: Date, zona: string): string {
  return new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", timeZone: zona }).format(instante);
}

/** «1 de marzo de 2027» de un `yyyy-mm-dd`. */
export function fechaLargaDeDia(dia: string): string {
  const ms = Date.parse(`${dia}T00:00:00Z`);
  if (Number.isNaN(ms)) return dia;
  return new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(ms);
}

/** Días calendario de un `yyyy-mm-dd` a otro. */
export function diasEntreDias(desde: string, hasta: string): number {
  return Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000);
}

/** «Vencida hace 4 días» de una actividad con el fin `fin` ya pasado el día `hoy` (spec §10.2). */
export function vencidaHace(fin: string, hoy: string): string {
  const n = Math.max(1, diasEntreDias(fin, hoy));
  return `Vencida hace ${n} ${n === 1 ? "día" : "días"}`;
}
