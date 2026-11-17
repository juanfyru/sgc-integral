/** Las opciones de los formularios y filtros del módulo de mejoramiento. */
import { obtenerSql, type Cliente } from "@/db/cliente";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { alcanceProcesos } from "@/lib/alcance";

/** Los procesos activos que la persona alcanza: el líder, solo los suyos; Admin SGC y Control Interno, todos (`alcanceProcesos`). */
export async function procesosDelAlcance(sesion: SesionFlujo, opciones?: { sql?: Cliente }): Promise<Array<{ id: number; nombre: string }>> {
  const sql = opciones?.sql ?? obtenerSql();
  const alcance = await alcanceProcesos(sesion, { sql });
  const filas = alcance.todos
    ? await sql`SELECT id, nombre FROM procesos WHERE activo ORDER BY nombre`
    : await sql`SELECT id, nombre FROM procesos WHERE activo AND id = ANY(${sql.array(alcance.procesoIds)}::bigint[]) ORDER BY nombre`;
  return filas.map((f) => ({ id: Number(f.id), nombre: f.nombre as string }));
}
