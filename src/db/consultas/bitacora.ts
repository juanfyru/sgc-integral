import { obtenerSql, type Cliente } from "@/db/cliente";

export type FiltrosBitacora = {
  accion?: string;
  entidad?: string;
  desde?: string;
  hasta?: string;
  texto?: string;
  pagina?: number;
};
export type FilaBitacora = {
  id: number;
  usuario: string;
  accion: string;
  entidad: string;
  entidadId: number | null;
  detalle: Record<string, unknown>;
  codigoDocumento: string | null;
  creadoEn: string;
};
export type RespuestaBitacora = {
  filas: FilaBitacora[];
  total: number;
  pagina: number;
  totalPaginas: number;
  acciones: string[];
  entidades: string[];
};

const TAMANO = 50;
const PATRON_FECHA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Vista filtrable de la bitácora (regla ISO 5). Más reciente primero, paginada.
 * Resuelve el código del documento afectado (por entidad o por `detalle`) para
 * responder "¿por qué desapareció este formato?" y permitir buscar por código.
 *
 * Una relación entre normas deja una fila en cada norma, con el mismo detalle (`auditarEnLasDos`, 13C): aquí se
 * muestra una vez por `relacionId`, la de la norma que la causa, sin tocar las filas. La de la afectada se sigue
 * encontrando por el texto: su detalle la nombra.
 */
export async function obtenerBitacora(
  filtros: FiltrosBitacora,
  opciones?: { sql?: Cliente },
): Promise<RespuestaBitacora> {
  const sql = opciones?.sql ?? obtenerSql();
  const pagina = Math.max(filtros.pagina ?? 1, 1);
  const desde = filtros.desde && PATRON_FECHA.test(filtros.desde) ? filtros.desde : null;
  const hasta = filtros.hasta && PATRON_FECHA.test(filtros.hasta) ? filtros.hasta : null;
  const texto = filtros.texto?.trim() ? `%${filtros.texto.trim()}%` : null;

  const codigoLateral = sql`
    LEFT JOIN LATERAL (
      SELECT dd.codigo FROM documentos dd
      WHERE dd.id = CASE
        WHEN a.entidad = 'documento' THEN a.entidad_id
        WHEN a.entidad = 'documento_version' THEN (a.detalle->>'documentoId')::bigint
        ELSE NULL END
      LIMIT 1
    ) cd ON true`;

  const cond = sql`
    AND NOT (a.accion IN ('norma_relacion', 'norma_relacion_eliminada') AND a.detalle ? 'relacionId' AND a.detalle ? 'normaId'
      AND a.entidad_id IS DISTINCT FROM (a.detalle->>'normaId')::bigint)
    ${filtros.accion ? sql`AND a.accion = ${filtros.accion}` : sql``}
    ${filtros.entidad ? sql`AND a.entidad = ${filtros.entidad}` : sql``}
    ${desde ? sql`AND a.creado_en >= ${desde}` : sql``}
    ${hasta ? sql`AND a.creado_en < (${hasta}::date + 1)` : sql``}
    ${texto ? sql`AND (a.entidad_id::text ILIKE ${texto} OR cd.codigo ILIKE ${texto} OR a.detalle::text ILIKE ${texto})` : sql``}`;

  const [filas, conteo, acciones, entidades] = await Promise.all([
    sql`
      SELECT a.id, COALESCE(u.nombre, 'sistema') AS usuario, a.accion, a.entidad,
             a.entidad_id, a.detalle, cd.codigo AS codigo_documento,
             to_char(a.creado_en, 'YYYY-MM-DD HH24:MI') AS creado_en
      FROM auditoria a
      LEFT JOIN usuarios u ON u.id = a.usuario_id
      ${codigoLateral}
      WHERE true ${cond}
      ORDER BY a.creado_en DESC, a.id DESC
      LIMIT ${TAMANO} OFFSET ${(pagina - 1) * TAMANO}`,
    // Total independiente de la página: count(*) OVER() no llega en páginas vacías.
    sql`SELECT count(*)::int AS total FROM auditoria a ${codigoLateral} WHERE true ${cond}`,
    sql`SELECT DISTINCT accion FROM auditoria ORDER BY accion`,
    sql`SELECT DISTINCT entidad FROM auditoria ORDER BY entidad`,
  ]);

  const total = (conteo[0]?.total as number | undefined) ?? 0;
  return {
    filas: filas.map((f) => ({
      id: f.id as number,
      usuario: f.usuario as string,
      accion: f.accion as string,
      entidad: f.entidad as string,
      entidadId: (f.entidad_id as number | null) ?? null,
      detalle: (f.detalle ?? {}) as Record<string, unknown>,
      codigoDocumento: (f.codigo_documento as string | null) ?? null,
      creadoEn: f.creado_en as string,
    })),
    total,
    pagina,
    totalPaginas: Math.max(Math.ceil(total / TAMANO), 1),
    acciones: acciones.map((a) => a.accion as string),
    entidades: entidades.map((e) => e.entidad as string),
  };
}
