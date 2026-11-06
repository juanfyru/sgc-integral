import { obtenerSql, type Cliente } from "@/db/cliente";
import { obtenerConfigDocumental } from "@/db/consultas/config-documental";
import { codigoSiguiente, consecutivoDe, motivoDeSiglas, patronDeConfiguracion, validarFormato } from "@/lib/tramites/codigo";
import { ErrorTramite } from "./flujo/contrato";

/** La acción de la bitácora con que el panel corrige los datos de control: guarda `antes` y `despues`. */
export const ACCION_EDITAR_CONTROL = "editar_control";

/**
 * Cuentan todos los documentos, también los que nunca se publicaron, y los códigos que un trámite
 * o el panel dejaron al corregirlos: un código no se reutiliza (spec 13A §8.4). Las acciones van
 * escritas en el SQL y no como parámetros: sin verlas, el planificador no usa el índice parcial de
 * `auditoria`. `editar_documento` es el panel heredado: guardaba `codigoAnterior` aunque el código
 * no cambiara.
 */
export async function todosLosCodigos(opciones?: { sql?: Cliente }): Promise<string[]> {
  const sql = opciones?.sql ?? obtenerSql();
  const filas = await sql`SELECT codigo FROM documentos
    UNION
    SELECT detalle -> 'antes' ->> 'codigo' AS codigo FROM tramite_eventos
    WHERE tipo = 'corregir_datos' AND detalle -> 'antes' ->> 'codigo' IS NOT NULL
    UNION
    SELECT detalle -> 'antes' ->> 'codigo' AS codigo FROM auditoria
    WHERE entidad = 'documento' AND accion = 'editar_control' AND detalle -> 'antes' ->> 'codigo' IS NOT NULL
    UNION
    SELECT detalle ->> 'codigoAnterior' AS codigo FROM auditoria
    WHERE entidad = 'documento' AND accion = 'editar_documento'
      AND detalle ->> 'codigoAnterior' IS DISTINCT FROM detalle ->> 'codigo' AND detalle ->> 'codigoAnterior' IS NOT NULL`;
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
    WHERE entidad = 'documento' AND entidad_id IS DISTINCT FROM ${opciones?.documentoId ?? null}
      AND ((accion = 'editar_control' AND detalle -> 'antes' ->> 'codigo' = ${codigo})
        OR (accion = 'editar_documento' AND detalle ->> 'codigoAnterior' = ${codigo} AND detalle ->> 'codigo' IS DISTINCT FROM ${codigo}))
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

export type DestinoDeCodigo = { procesoId: number; tipoDocumentoId: number };

/** La sigla del proceso propietario (en un subproceso, la de su proceso) y la del tipo; null si falta alguna. */
async function siglasDe(sql: Cliente, p: DestinoDeCodigo): Promise<{ proceso: string; tipo: string } | null> {
  const [siglas] = await sql`SELECT
      (SELECT sigla FROM procesos WHERE id = ${p.procesoId}) AS proceso,
      (SELECT sigla FROM tipos_documento WHERE id = ${p.tipoDocumentoId}) AS tipo`;
  return siglas.proceso && siglas.tipo ? { proceso: siglas.proceso, tipo: siglas.tipo } : null;
}

/** El siguiente código de ese proceso y tipo; null si no hay un `formato_codigo` válido. */
export async function sugerirCodigo(p: DestinoDeCodigo, opciones?: { sql?: Cliente }): Promise<string | null> {
  const sql = opciones?.sql ?? obtenerSql();
  const { formatoCodigo } = await obtenerConfigDocumental({ sql });
  const siglas = await siglasDe(sql, p);
  if (!siglas) return null;
  return codigoSiguiente(formatoCodigo, await todosLosCodigos({ sql }), siglas);
}

export async function exigirFormatoDeCodigo(sql: Cliente, codigo: string, destino: DestinoDeCodigo): Promise<void> {
  if ((await obtenerPatronCodigo({ sql })).test(codigo)) return;
  const ejemplo = await sugerirCodigo(destino, { sql });
  throw new ErrorTramite(`El código no cumple el formato configurado${ejemplo ? ` (ej. ${ejemplo})` : ""}`);
}

/**
 * El código de un documento que nace en un trámite lleva las siglas de su proceso y su tipo: es su
 * identidad (spec 13A §8.4 y §8.6, R32). Sin un formato válido solo aplica `exigirFormatoDeCodigo`,
 * y la carga directa del panel no pasa por aquí: esos documentos ya existen y llegan con su código.
 * Solo mira las siglas: el ancho de un código nuevo lo exige `exigirFormatoDeCodigo`, y uno anterior a
 * un cambio de formato conserva el suyo.
 */
export async function exigirSiglasDelCodigo(sql: Cliente, codigo: string, destino: DestinoDeCodigo): Promise<void> {
  const { formatoCodigo: formato } = await obtenerConfigDocumental({ sql });
  if (!formato || validarFormato(formato) !== null) return;
  const siglas = await siglasDe(sql, destino);
  if (siglas && consecutivoDe(formato, codigo, siglas, true) === null) throw new ErrorTramite(motivoDeSiglas(formato, siglas));
}

export function errorDeCodigoRepetido(siguiente: string | null): ErrorTramite {
  return new ErrorTramite(siguiente ? `Ese código ya existe. El siguiente disponible es ${siguiente}` : "Ese código ya existe");
}
