import { notFound } from "next/navigation";
import { datoPorId, type DatoCompartido } from "@/db/consultas/indicadores/datos";
import { exigirSesion } from "@/lib/paginas";
import type { SesionValida } from "@/lib/sesion";

/**
 * El dato compartido del segmento `[id]` (anexo 14C, §4.7): exige la sesión y, si el id no es un número o la persona no ve
 * el dato (`datoPorId`, que aplica `filtroDatos`), responde «no encontrado», nunca «sin permiso»: para ella no existe.
 */
export async function exigirDato(id: string): Promise<{ sesion: SesionValida; dato: DatoCompartido }> {
  const sesion = await exigirSesion();
  if (!/^\d{1,15}$/.test(id)) notFound();
  const dato = await datoPorId(sesion, Number(id));
  if (!dato) notFound();
  return { sesion, dato };
}
