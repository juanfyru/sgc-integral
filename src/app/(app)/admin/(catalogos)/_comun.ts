import { notFound } from "next/navigation";
import { puedeVerCatalogos } from "@/lib/alcance";
import { puede } from "@/lib/permisos";
import type { SesionValida } from "@/lib/sesion";

/**
 * Quien no ve los catálogos recibe «no encontrado», nunca «sin permiso» (spec 13C §12.3). Devuelve si se pintan en
 * solo lectura: sin `distribucion.gestionar`, sin botones ni formularios.
 */
export function exigirCatalogo(sesion: SesionValida): { soloLectura: boolean } {
  if (!puedeVerCatalogos(sesion)) notFound();
  return { soloLectura: !puede(sesion, "distribucion.gestionar") };
}

/** Las altas siguen siendo de quien gestiona: para los demás no existen. */
export function exigirGestion(sesion: SesionValida): void {
  if (!puede(sesion, "distribucion.gestionar")) notFound();
}
