import { zonaHoraria } from "@/lib/zona-horaria";

/** «7 nov 2026» en la zona de la instalación: el año importa en un historial. */
export function fechaConAnio(fecha: Date): string {
  return new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeZone: zonaHoraria() }).format(fecha);
}
