import { obtenerSql } from "@/db/cliente";

export type FilaMaestro = {
  codigo: string;
  titulo: string;
  tipo: string;
  version: number | null;
  estado: string;
  fechaElaboracion: string | null;
  fechaRevision: string | null;
  fechaAprobacion: string | null;
  elaboro: string | null;
  reviso: string | null;
  aprobo: string | null;
  propietario: string;
};

/**
 * Listado Maestro (ISO 7.5): una fila por documento, contada UNA sola vez por
 * su asociación principal (D6). Por defecto solo documentos con versión
 * vigente; `incluir:'todos'` agrega los que no la tienen (obsoleto/anulado),
 * describiendo su versión de mayor número. Un borrador o una versión descartada
 * nunca es la representativa: el documento que solo tiene esas no aparece.
 */
export async function obtenerListadoMaestro(
  opciones: { incluir: "vigentes" | "todos" },
): Promise<FilaMaestro[]> {
  const sql = obtenerSql();
  const soloVigentes = opciones.incluir === "vigentes";

  // La versión "representativa": la vigente si existe; si no y se piden todos,
  // la de mayor número entre las que son historial.
  const filas = await sql`
    SELECT d.codigo, d.titulo, t.nombre AS tipo,
           v.numero AS version, v.estado,
           v.fecha_elaboracion::text AS fecha_elaboracion,
           v.fecha_revision::text AS fecha_revision,
           v.fecha_aprobacion::text AS fecha_aprobacion,
           v.elaboro, v.reviso, v.aprobo,
           COALESCE(
             pd.nombre,
             ps.nombre || ' › ' || sp.nombre
           ) AS propietario
    FROM documentos d
    JOIN tipos_documento t ON t.id = d.tipo_id
    JOIN LATERAL (
      SELECT * FROM documento_versiones vv
      WHERE vv.documento_id = d.id
        ${soloVigentes ? sql`AND vv.estado = 'vigente'` : sql`AND vv.estado NOT IN ('borrador', 'descartado')`}
      ORDER BY (vv.estado = 'vigente') DESC, vv.numero DESC
      LIMIT 1
    ) v ON true
    JOIN documento_proceso dp ON dp.documento_id = d.id AND dp.es_principal
    LEFT JOIN procesos pd ON pd.id = dp.proceso_id
    LEFT JOIN subprocesos sp ON sp.id = dp.subproceso_id
    LEFT JOIN procesos ps ON ps.id = sp.proceso_id
    ORDER BY d.codigo`;

  return filas.map((f) => ({
    codigo: f.codigo as string,
    titulo: f.titulo as string,
    tipo: f.tipo as string,
    version: (f.version as number | null) ?? null,
    estado: f.estado as string,
    fechaElaboracion: (f.fecha_elaboracion as string | null) ?? null,
    fechaRevision: (f.fecha_revision as string | null) ?? null,
    fechaAprobacion: (f.fecha_aprobacion as string | null) ?? null,
    elaboro: (f.elaboro as string | null) ?? null,
    reviso: (f.reviso as string | null) ?? null,
    aprobo: (f.aprobo as string | null) ?? null,
    propietario: f.propietario as string,
  }));
}
