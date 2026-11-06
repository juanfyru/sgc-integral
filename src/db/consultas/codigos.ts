import { obtenerSql, type Cliente } from "@/db/cliente";
import { obtenerConfigDocumental } from "@/db/consultas/config-documental";
import { codigoSiguiente, patronDeConfiguracion } from "@/lib/tramites/codigo";
import { ErrorTramite } from "./flujo/contrato";

/** La acción de la bitácora con que el panel corrige los datos de control: guarda `antes` y `despues`. */
export const ACCION_EDITAR_CONTROL = "editar_control";

/**
 * Cuentan todos los documentos, también los que nunca se publicaron, y los códigos que un trámite
 * o el panel dejaron al corregirlos: un código no se reutiliza (spec 13A §8.4).
 */
export async function todosLosCodigos(opciones?: { sql?: Cliente }): Promise<string[]> {
  const sql = opciones?.sql ?? obtenerSql();
  const filas = await sql`SELECT codigo FROM documentos
    UNION
    SELECT detalle -> 'antes' ->> 'codigo' AS codigo FROM tramite_eventos
    WHERE tipo = 'corregir_datos' AND detalle -> 'antes' ->> 'codigo' IS NOT NULL
    UNION
    SELECT detalle -> 'antes' ->> 'codigo' AS codigo FROM auditoria
    WHERE entidad = 'documento' AND accion = ${ACCION_EDITAR_CONTROL} AND detalle -> 'antes' ->> 'codigo' IS NOT NULL`;
  return filas.map((f) => f.codigo);
}

/**
 * Si otro dejó ese código al corregirlo: un trámite, o un documento desde el panel. Quien lo dejó sí puede
 * volver a él: `tramiteId` es el trámite que pregunta (null desde el panel) y `documentoId`, el documento.
 */
export async function codigoAbandonado(
  codigo: string,
  tramiteId: number | null,
  opciones?: { sql?: Cliente; documentoId?: number },
): Promise<boolean> {
  const sql = opciones?.sql ?? obtenerSql();
  const [abandonado] = await sql`SELECT 1 FROM tramite_eventos
    WHERE tipo = 'corregir_datos' AND detalle -> 'antes' ->> 'codigo' = ${codigo}
      AND tramite_id IS DISTINCT FROM ${tramiteId}
    UNION ALL
    SELECT 1 FROM auditoria
    WHERE entidad = 'documento' AND accion = ${ACCION_EDITAR_CONTROL} AND detalle -> 'antes' ->> 'codigo' = ${codigo}
      AND entidad_id IS DISTINCT FROM ${opciones?.documentoId ?? null}
    LIMIT 1`;
  return Boolean(abandonado);
}

/**
 * Patrón del código: sale de `formato_codigo` si es válido; si no, de la clave
 * heredada `patron_codigo` y, a falta de esta, del patrón por defecto.
 */
export async function obtenerPatronCodigo(opciones?: { sql?: Cliente }): Promise<RegExp> {
  const sql = opciones?.sql ?? obtenerSql();
  const filas = await sql`SELECT clave, valor FROM configuracion
    WHERE clave IN ('formato_codigo', 'patron_codigo')`;
  const valor = (clave: string) =>
    filas.find((f) => f.clave === clave)?.valor as string | undefined;
  return patronDeConfiguracion(valor("formato_codigo"), valor("patron_codigo"));
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

export type DestinoDeCodigo = { procesoId: number; tipoDocumentoId: number };

export async function exigirFormatoDeCodigo(sql: Cliente, codigo: string, destino: DestinoDeCodigo): Promise<void> {
  if ((await obtenerPatronCodigo({ sql })).test(codigo)) return;
  const ejemplo = await sugerirCodigo(destino, { sql });
  throw new ErrorTramite(`El código no cumple el formato configurado${ejemplo ? ` (ej. ${ejemplo})` : ""}`);
}

export function errorDeCodigoRepetido(siguiente: string | null): ErrorTramite {
  return new ErrorTramite(siguiente ? `Ese código ya existe. El siguiente disponible es ${siguiente}` : "Ese código ya existe");
}
