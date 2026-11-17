/** Las opciones de los formularios y filtros del módulo de mejoramiento. */
import { obtenerSql, type Cliente } from "@/db/cliente";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { nombreSql } from "@/db/consultas/normograma/busqueda";
import { alcanceProcesos, filtroAcceso } from "@/lib/alcance";

/** Los procesos activos que la persona alcanza: el líder, solo los suyos; Admin SGC y Control Interno, todos (`alcanceProcesos`). */
export async function procesosDelAlcance(sesion: SesionFlujo, opciones?: { sql?: Cliente }): Promise<Array<{ id: number; nombre: string }>> {
  const sql = opciones?.sql ?? obtenerSql();
  const alcance = await alcanceProcesos(sesion, { sql });
  const filas = alcance.todos
    ? await sql`SELECT id, nombre FROM procesos WHERE activo ORDER BY nombre`
    : await sql`SELECT id, nombre FROM procesos WHERE activo AND id = ANY(${sql.array(alcance.procesoIds)}::bigint[]) ORDER BY nombre`;
  return filas.map((f) => ({ id: Number(f.id), nombre: f.nombre as string }));
}

/** Las normas del normograma que rigen (vigentes o modificadas), para elegir el requisito incumplido; las lee toda sesión. */
export async function normasQueRigen(opciones?: { sql?: Cliente }): Promise<Array<{ id: number; nombre: string; titulo: string }>> {
  const sql = opciones?.sql ?? obtenerSql();
  const filas = await sql`
    SELECT n.id, ${nombreSql(sql)} AS nombre, n.titulo
    FROM normas n JOIN tipos_norma tn ON tn.id = n.tipo_norma_id
    WHERE n.estado IN ('vigente', 'modificada')
    ORDER BY n.anio DESC, tn.orden, n.numero, n.id`;
  return filas.map((f) => ({ id: Number(f.id), nombre: f.nombre as string, titulo: f.titulo as string }));
}

/** Los documentos con una versión vigente que la persona puede ver (`filtroAcceso`). */
export async function documentosVigentesVisibles(
  sesion: SesionFlujo,
  opciones?: { sql?: Cliente },
): Promise<Array<{ id: number; codigo: string; titulo: string }>> {
  const sql = opciones?.sql ?? obtenerSql();
  const filas = await sql`
    SELECT d.id, d.codigo, d.titulo FROM documentos d
    WHERE EXISTS (SELECT 1 FROM documento_versiones v WHERE v.documento_id = d.id AND v.estado = 'vigente')
      AND ${filtroAcceso(sql, sesion)}
    ORDER BY d.codigo`;
  return filas.map((f) => ({ id: Number(f.id), codigo: f.codigo as string, titulo: f.titulo as string }));
}

/** Los hallazgos cerrados de un proceso, para elegir de cuál es reincidencia otro (spec 15 §7.5). */
export async function cerradosDelProceso(
  procesoId: number,
  excluirId: number,
  opciones?: { sql?: Cliente },
): Promise<Array<{ id: number; codigo: string; titulo: string }>> {
  const sql = opciones?.sql ?? obtenerSql();
  const filas = await sql`SELECT id, codigo, titulo FROM mejora_hallazgos
    WHERE proceso_id = ${procesoId} AND estado = 'cerrado' AND id <> ${excluirId} ORDER BY cerrado_en DESC NULLS LAST, id DESC LIMIT 100`;
  return filas.map((f) => ({ id: Number(f.id), codigo: f.codigo as string, titulo: f.titulo as string }));
}

/** Los usuarios activos, para elegir el responsable de una corrección (spec 15 §8.4). */
export async function usuariosActivos(opciones?: { sql?: Cliente }): Promise<Array<{ id: number; nombre: string }>> {
  const sql = opciones?.sql ?? obtenerSql();
  const filas = await sql`SELECT id, nombre FROM usuarios WHERE activo ORDER BY nombre, id`;
  return filas.map((f) => ({ id: Number(f.id), nombre: f.nombre as string }));
}
