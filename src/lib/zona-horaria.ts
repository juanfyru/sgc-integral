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
