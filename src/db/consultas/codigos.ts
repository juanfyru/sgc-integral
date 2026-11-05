import { obtenerSql, type Cliente } from "@/db/cliente";
import { obtenerConfigDocumental } from "@/db/consultas/config-documental";
import { codigoSiguiente } from "@/lib/tramites/codigo";

/** Cuentan todos los documentos, también los que nunca se publicaron: un código no se reutiliza. */
export async function todosLosCodigos(opciones?: { sql?: Cliente }): Promise<string[]> {
  const sql = opciones?.sql ?? obtenerSql();
  const filas = await sql`SELECT codigo FROM documentos`;
  return filas.map((f) => f.codigo);
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
