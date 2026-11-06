import { obtenerSql, type Cliente } from "@/db/cliente";
import { obtenerConfigDocumental } from "@/db/consultas/config-documental";
import { codigoSiguiente } from "@/lib/tramites/codigo";

/**
 * Cuentan todos los documentos, también los que nunca se publicaron, y los códigos que un trámite
 * dejó al corregirlos: un código no se reutiliza (spec 13A §8.4).
 */
export async function todosLosCodigos(opciones?: { sql?: Cliente }): Promise<string[]> {
  const sql = opciones?.sql ?? obtenerSql();
  const filas = await sql`SELECT codigo FROM documentos
    UNION
    SELECT detalle -> 'antes' ->> 'codigo' AS codigo FROM tramite_eventos
    WHERE tipo = 'corregir_datos' AND detalle -> 'antes' ->> 'codigo' IS NOT NULL`;
  return filas.map((f) => f.codigo);
}

/** Si otro trámite dejó ese código al corregirlo. El trámite que lo dejó sí puede volver a él. */
export async function codigoAbandonado(codigo: string, tramiteId: number, opciones?: { sql?: Cliente }): Promise<boolean> {
  const sql = opciones?.sql ?? obtenerSql();
  const [abandonado] = await sql`SELECT 1 FROM tramite_eventos
    WHERE tipo = 'corregir_datos' AND detalle -> 'antes' ->> 'codigo' = ${codigo} AND tramite_id <> ${tramiteId}
    LIMIT 1`;
  return Boolean(abandonado);
}

/** El siguiente código de ese proceso y tipo; null si no hay un `formato_codigo` válido. */
export async function sugerirCodigo(
  p: { procesoId: number; tipoDocumentoId: number },
  opciones?: { sql?: Cliente },
): Promise<string | null> {
  const sql = opciones?.sql ?? obtenerSql();
  const { formatoCodigo } = await obtenerConfigDocumental({ sql });
  const [siglas] = await sql`SELECT
      (SELECT sigla FROM procesos WHERE id = ${p.procesoId}) AS proceso,
      (SELECT sigla FROM tipos_documento WHERE id = ${p.tipoDocumentoId}) AS tipo`;
  if (!siglas.proceso || !siglas.tipo) return null;
  return codigoSiguiente(formatoCodigo, await todosLosCodigos({ sql }), { proceso: siglas.proceso, tipo: siglas.tipo });
}
