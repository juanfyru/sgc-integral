/**
 * Alcance por procesos: único punto que decide qué procesos puede ver un usuario.
 *
 * REGLA: toda consulta de los módulos nuevos (Fases 13 a 15) debe filtrar por
 * `alcanceProcesos`; no se reimplementa el filtro por rol en cada módulo.
 *
 * `filtroAcceso` responde otra pregunta: qué documentos puede ver una persona
 * según su nivel de acceso (spec 13A §12). `alcanceProcesos` da «todo» a los
 * roles que no lideran; `filtroAcceso` mira los procesos asignados de cualquier
 * rol que no esté en `ROLES_VEN_RESTRINGIDO`.
 *
 * - `lider_proceso` alcanza solo sus `usuario_procesos`, y únicamente los procesos
 *   ACTIVOS (un proceso inactivo queda fuera del alcance). Puede ser vacío.
 * - Los demás roles alcanzan todo (`{ todos: true }`).
 * - `procesoIds` sale ordenado ascendente; `procesosAsignados` devuelve procesos
 *   activos ordenados por nombre.
 */
import { obtenerSql, type Cliente } from "@/db/cliente";
import type { Rol } from "@/lib/roles";
import type { SesionValida } from "@/lib/sesion";

export type Alcance = { todos: true } | { todos: false; procesoIds: number[] };

export type ProcesoAsignado = { id: number; nombre: string; sigla: string; slug: string };

export type SujetoVisibilidad = Pick<SesionValida, "usuarioId" | "rol" | "verHistorial">;

/** Ven todo documento restringido. La marca `ver_historial` no da este acceso (F13A-DC14). */
export const ROLES_VEN_RESTRINGIDO: readonly Rol[] = ["admin_sgc", "gerencia", "control_interno"];

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

/**
 * Regla de nivel de acceso, para un `WHERE` o un `JOIN … ON`; la consulta llama
 * `d` a `documentos`. Un restringido exige estar asignado a un proceso activo del
 * documento: el suyo o, si la asociación es a un subproceso, el de ese subproceso.
 */
export function filtroAcceso(sql: Cliente, sujeto: SujetoVisibilidad) {
  if (ROLES_VEN_RESTRINGIDO.includes(sujeto.rol)) return sql`true`;
  return sql`(d.nivel_acceso = 'general' OR EXISTS (
    SELECT 1
    FROM documento_proceso acceso_dp
    LEFT JOIN subprocesos acceso_s ON acceso_s.id = acceso_dp.subproceso_id
    JOIN procesos acceso_p
      ON acceso_p.id = COALESCE(acceso_dp.proceso_id, acceso_s.proceso_id) AND acceso_p.activo
    JOIN usuario_procesos acceso_up
      ON acceso_up.proceso_id = acceso_p.id AND acceso_up.usuario_id = ${sujeto.usuarioId}
    WHERE acceso_dp.documento_id = d.id
  ))`;
}

/** La misma regla para un documento suelto; `false` si el documento no existe. */
export async function puedeAccederDocumento(
  documentoId: number,
  sujeto: SujetoVisibilidad,
  opciones?: { sql?: Cliente },
): Promise<boolean> {
  const sql = opciones?.sql ?? obtenerSql();
  const filas = await sql`
    SELECT 1 FROM documentos d
    WHERE d.id = ${documentoId} AND ${filtroAcceso(sql, sujeto)}`;
  return filas.length > 0;
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
