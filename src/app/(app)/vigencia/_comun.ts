import { notFound } from "next/navigation";
import { puedeVerVigencia } from "@/lib/alcance";
import type { SesionValida } from "@/lib/sesion";

/**
 * Quien no ve «Vigencia» recibe «no encontrado», nunca «sin permiso» (spec 13C §6.4, el patrón de
 * `exigirDistribucion`). El responsable técnico de un externo llega con la Tarea 6 (`esResponsableTecnico`).
 */
export async function exigirVigencia(sesion: SesionValida): Promise<void> {
  const responsableTecnico = false;
  if (!puedeVerVigencia({ ...sesion, responsableTecnico })) notFound();
}
