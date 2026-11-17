import { notFound } from "next/navigation";
import { leerHallazgo, type DetalleDeHallazgo } from "@/db/consultas/mejoramiento/lectura";
import type { SesionValida } from "@/lib/sesion";

/**
 * El hallazgo del segmento `[id]`. Quien no puede verlo recibe «no encontrado», igual que ante un identificador que no
 * existe (spec 15 §6.3): ni su código ni su título salen de aquí.
 */
export async function exigirHallazgo(
  sesion: SesionValida,
  segmento: string,
  opciones?: { ahora?: Date },
): Promise<DetalleDeHallazgo> {
  if (!/^\d{1,15}$/.test(segmento)) notFound();
  const id = Number(segmento);
  if (!Number.isSafeInteger(id)) notFound();
  const hallazgo = await leerHallazgo(sesion, id, opciones);
  if (!hallazgo) notFound();
  return hallazgo;
}

/** Las rutas del módulo viven en `src/lib/mejoramiento/rutas.ts`; las páginas y las acciones las toman de aquí. */
export { rutaDeActividad, rutaDeFormular, rutaDeHallazgo } from "@/lib/mejoramiento/rutas";
