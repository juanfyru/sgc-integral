import { notFound } from "next/navigation";
import { leerActividad, type DetalleDeActividad } from "@/db/consultas/mejoramiento/actividades";
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

/**
 * La actividad del segmento `[id]` (spec 15 §16.1): la abren su responsable, quien registró un seguimiento en ella y quien ve
 * su hallazgo completo (`puedeVerActividad`). Los demás reciben «no encontrado», igual que ante un identificador que no
 * existe: ni la actividad ni su hallazgo salen de aquí.
 */
export async function exigirActividad(sesion: SesionValida, segmento: string): Promise<DetalleDeActividad> {
  if (!/^\d{1,15}$/.test(segmento)) notFound();
  const id = Number(segmento);
  if (!Number.isSafeInteger(id)) notFound();
  const actividad = await leerActividad(sesion, id);
  if (!actividad) notFound();
  return actividad;
}

/** Las rutas del módulo viven en `src/lib/mejoramiento/rutas.ts`; las páginas y las acciones las toman de aquí. */
export { rutaDeActividad, rutaDeFormular, rutaDeHallazgo } from "@/lib/mejoramiento/rutas";
