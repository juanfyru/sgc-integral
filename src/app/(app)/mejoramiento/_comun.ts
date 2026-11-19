import { notFound } from "next/navigation";
import type { IndicadorEnLectura } from "@/componentes/mejoramiento/plan/PlanEnLectura";
import { obtenerSql } from "@/db/cliente";
import { leerActividad, type DetalleDeActividad } from "@/db/consultas/mejoramiento/actividades";
import { indicadorDeEficacia } from "@/db/consultas/mejoramiento/indicador-de-eficacia";
import { leerHallazgo, type DetalleDeHallazgo, type RondaDeDetalle } from "@/db/consultas/mejoramiento/lectura";
import { leerPlan, type DetalleDePlan } from "@/db/consultas/mejoramiento/planes-lectura";
import { puedeVerIndicador } from "@/lib/alcance";
import { exigirSesion } from "@/lib/paginas";
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

/**
 * El plan de mejoramiento del segmento `[id]` (Fase 15B, anexo §3.6): exige la sesión y, si el id no es un número, el plan no
 * existe o la persona no lo ve (`leerPlan`, con `filtroPlanes`), responde «no encontrado», nunca «sin permiso»: para ella no
 * existe. Lo que ve del plan (solo los hallazgos que ve completos) ya viene decidido en `plan`.
 */
export async function exigirPlan(segmento: string, opciones?: { ahora?: Date }): Promise<{ sesion: SesionValida; plan: DetalleDePlan }> {
  const sesion = await exigirSesion();
  if (!/^\d{1,15}$/.test(segmento)) notFound();
  const id = Number(segmento);
  if (!Number.isSafeInteger(id)) notFound();
  const plan = await leerPlan(sesion, id, opciones);
  if (!plan) notFound();
  return { sesion, plan };
}

/**
 * El indicador enlazado al criterio de eficacia de una ronda, nombrado solo a quien lo ve (spec 15 §11.2, `puedeVerIndicador`); a
 * los demás, «un indicador». Lo leen la página del hallazgo y su impreso.
 */
export async function indicadorParaQuienLee(r: Pick<RondaDeDetalle, "indicadorEficaciaId">, sesion: SesionValida): Promise<IndicadorEnLectura> {
  if (r.indicadorEficaciaId === null) return null;
  const sql = obtenerSql();
  const [ind, ve] = await Promise.all([indicadorDeEficacia(sql, r.indicadorEficaciaId), puedeVerIndicador(r.indicadorEficaciaId, sesion, { sql })]);
  if (!ind) return null;
  return ve ? { visible: true, codigo: ind.codigo, nombre: ind.nombre, periodicidad: ind.periodicidad } : { visible: false };
}

/** Las rutas del módulo viven en `src/lib/mejoramiento/rutas.ts`; las páginas y las acciones las toman de aquí. */
export { rutaDeActividad, rutaDeFormular, rutaDeHallazgo, rutaDeImprimir, rutaDePlan } from "@/lib/mejoramiento/rutas";
