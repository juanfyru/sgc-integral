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
import { puede } from "@/lib/permisos";
import type { Rol } from "@/lib/roles";
import type { SesionValida } from "@/lib/sesion";
import type { Etapa } from "@/lib/tramites/tipos";

export type Alcance = { todos: true } | { todos: false; procesoIds: number[] };

export type ProcesoAsignado = { id: number; nombre: string; sigla: string; slug: string };

export type SujetoVisibilidad = Pick<SesionValida, "usuarioId" | "rol" | "verHistorial">;

/** Ven todo documento restringido. La marca `ver_historial` no da este acceso (F13A-DC14). */
export const ROLES_VEN_RESTRINGIDO: readonly Rol[] = ["admin_sgc", "gerencia", "control_interno"];

export async function alcanceProcesos(
  sesion: Pick<SesionValida, "usuarioId" | "rol">,
  opciones?: { sql?: Cliente },
): Promise<Alcance> {
  if (sesion.rol !== "lider_proceso") return { todos: true };
  const sql = opciones?.sql ?? obtenerSql();
  const filas = await sql`
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

/**
 * Quién ve una versión ya publicada (spec 13A §12): la vigente, todo el que pasa el nivel de acceso del
 * documento; la obsoleta y la anulada, además, quien tiene `documentos.ver_historial`. Un borrador o una
 * versión descartada no se sirve por aquí. El acta de la versión se rige por la misma regla.
 */
export async function puedeVerVersion(
  versionId: number,
  sujeto: SujetoVisibilidad,
  opciones?: { sql?: Cliente },
): Promise<boolean> {
  const sql = opciones?.sql ?? obtenerSql();
  const [v] = await sql`
    SELECT v.estado FROM documento_versiones v
    JOIN documentos d ON d.id = v.documento_id
    WHERE v.id = ${versionId} AND ${filtroAcceso(sql, sujeto)}`;
  if (!v) return false;
  if (v.estado === "vigente") return true;
  if (v.estado === "obsoleto" || v.estado === "anulado") return puede(sujeto, "documentos.ver_historial");
  return false;
}

/**
 * Quién ve un trámite (spec 13A §6.5): la participación es la única excepción a
 * `alcanceProcesos`. Un trámite publicado o eliminado es la evidencia de cómo se aprobó, y lo
 * ven además quien tiene historial y pasa el nivel de acceso. Para los demás no existe.
 */
export function puedeVerTramite(v: {
  etapa: Etapa;
  esParticipante: boolean;
  rol: Rol;
  lideraAlgunProceso: boolean;
  verHistorial: boolean;
  pasaNivelAcceso: boolean;
}): boolean {
  if (v.esParticipante || v.rol === "admin_sgc") return true;
  if (v.rol === "lider_proceso" && v.lideraAlgunProceso) return true;
  const esEvidencia = v.etapa === "publicado" || v.etapa === "eliminado";
  return esEvidencia && v.pasaNivelAcceso && puede({ rol: v.rol, verHistorial: v.verHistorial }, "documentos.ver_historial");
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

/** Quién ve el módulo de distribución: quien tiene `distribucion.ver` o responde por algún punto activo. */
export function puedeVerDistribucion(sesion: SujetoVisibilidad & { responsableDePuntos?: boolean }): boolean {
  return puede(sesion, "distribucion.ver") || sesion.responsableDePuntos === true;
}

/**
 * Qué puntos de uso ve una persona, para un `WHERE` sobre `puntos_uso pu`: los roles que ven todo, todos;
 * el líder, los de sus procesos activos y los suyos; el resto, solo aquellos de los que es responsable.
 */
export function filtroPuntos(sql: Cliente, sujeto: SujetoVisibilidad) {
  if (sujeto.rol === "admin_sgc" || sujeto.rol === "gerencia" || sujeto.rol === "control_interno") return sql`true`;
  if (sujeto.rol === "lider_proceso") {
    return sql`(pu.responsable_id = ${sujeto.usuarioId} OR EXISTS (
      SELECT 1
      FROM punto_uso_procesos puntos_pp
      JOIN procesos puntos_p ON puntos_p.id = puntos_pp.proceso_id AND puntos_p.activo
      JOIN usuario_procesos puntos_up ON puntos_up.proceso_id = puntos_p.id AND puntos_up.usuario_id = ${sujeto.usuarioId}
      WHERE puntos_pp.punto_uso_id = pu.id
    ))`;
  }
  return sql`pu.responsable_id = ${sujeto.usuarioId}`;
}
