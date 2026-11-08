import { notFound } from "next/navigation";
import { esResponsableDePuntos } from "@/db/consultas/distribucion/puntos-uso";
import { puedeVerDistribucion } from "@/lib/alcance";
import type { SesionValida } from "@/lib/sesion";

/** Quien no ve el módulo recibe «no encontrado», nunca «sin permiso» (spec 13B §6.4). */
export async function exigirDistribucion(sesion: SesionValida): Promise<void> {
  const responsableDePuntos = await esResponsableDePuntos(sesion.usuarioId);
  if (!puedeVerDistribucion({ ...sesion, responsableDePuntos })) notFound();
}
