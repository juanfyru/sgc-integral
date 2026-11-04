/**
 * Alcance por procesos: único punto que decide qué procesos puede ver un usuario.
 *
 * REGLA: toda consulta de los módulos nuevos (Fases 13 a 15) debe filtrar por
 * `alcanceProcesos`; no se reimplementa el filtro por rol en cada módulo.
 *
 * - `lider_proceso` alcanza solo sus `usuario_procesos`, y únicamente los procesos
 *   ACTIVOS (un proceso inactivo queda fuera del alcance). Puede ser vacío.
 * - Los demás roles alcanzan todo (`{ todos: true }`).
 * - `procesoIds` sale ordenado ascendente; `procesosAsignados` devuelve procesos
 *   activos ordenados por nombre.
 */
import { obtenerSql } from "@/db/cliente";
import type { SesionValida } from "@/lib/sesion";

export type Alcance = { todos: true } | { todos: false; procesoIds: number[] };

export type ProcesoAsignado = { id: number; nombre: string; sigla: string; slug: string };

export async function alcanceProcesos(sesion: Pick<SesionValida, "usuarioId" | "rol">): Promise<Alcance> {
  if (sesion.rol !== "lider_proceso") return { todos: true };
  const filas = await obtenerSql()`
    SELECT up.proceso_id AS id
    FROM usuario_procesos up
    JOIN procesos p ON p.id = up.proceso_id
    WHERE up.usuario_id = ${sesion.usuarioId} AND p.activo
    ORDER BY up.proceso_id`;
  return { todos: false, procesoIds: filas.map((f) => f.id as number) };
}

export function enAlcance(alcance: Alcance, procesoId: number): boolean {
  return alcance.todos || alcance.procesoIds.includes(procesoId);
}

export async function procesosAsignados(usuarioId: number): Promise<ProcesoAsignado[]> {
  const filas = await obtenerSql()`
    SELECT p.id, p.nombre, p.sigla, p.slug
    FROM usuario_procesos up
    JOIN procesos p ON p.id = up.proceso_id
    WHERE up.usuario_id = ${usuarioId} AND p.activo
    ORDER BY p.nombre`;
  return filas.map((f) => ({ id: f.id as number, nombre: f.nombre as string, sigla: f.sigla as string, slug: f.slug as string }));
}
