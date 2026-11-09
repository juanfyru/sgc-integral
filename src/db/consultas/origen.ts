/**
 * El origen de un documento manda (spec 13C §8.1): solo el camino de externos pone `origen = 'externo'`, un externo
 * lleva siempre el tipo «Documento externo» (sigla `DE`) y no tiene trámite, y los caminos de los internos (el
 * trámite, la carga directa y la edición del panel) no lo tocan. Las guardas lanzan `ErrorTramite`: las acciones
 * muestran su mensaje y los manejadores de archivos responden 409, como a cualquier regla de negocio.
 */
import type { Cliente } from "@/db/cliente";
import { filtroAccesoDe } from "@/lib/alcance";
import { ErrorTramite } from "./flujo/contrato";

export const SIGLA_EXTERNO = "DE";
export const EXTERNO_SE_ADOPTA = "Un documento externo se adopta desde Vigencia → Externos";
export const EXTERNO_SIN_TRAMITE = "Un documento externo no tiene trámite: se adopta o se retira desde Vigencia → Externos";
export const TIPO_SOLO_EXTERNOS = "El tipo «Documento externo» es solo para documentos externos: regístrelo desde Vigencia → Externos";
export const EXTERNO_CONSERVA_TIPO = "Un documento externo conserva el tipo «Documento externo»";
export const RESPONSABLE_SIN_ACCESO = "El responsable técnico no tiene acceso a este documento restringido";

/** Rechaza un documento de origen externo, dado por él o por una de sus versiones; `mensaje` dice dónde se hace. */
export async function exigirInterno(
  sql: Cliente,
  donde: { documentoId: number } | { versionId: number },
  mensaje: string = EXTERNO_SE_ADOPTA,
): Promise<void> {
  const [externo] =
    "versionId" in donde
      ? await sql`SELECT 1 FROM documento_versiones v JOIN documentos d ON d.id = v.documento_id
          WHERE v.id = ${donde.versionId} AND d.origen = 'externo'`
      : await sql`SELECT 1 FROM documentos WHERE id = ${donde.documentoId} AND origen = 'externo'`;
  if (externo) throw new ErrorTramite(mensaje);
}

/** El tipo «Documento externo» es solo de los externos: un interno no nace ni pasa a ese tipo. */
export async function exigirTipoDeInterno(sql: Cliente, tipoId: number): Promise<void> {
  const [tipo] = await sql`SELECT 1 FROM tipos_documento WHERE id = ${tipoId} AND sigla = ${SIGLA_EXTERNO}`;
  if (tipo) throw new ErrorTramite(TIPO_SOLO_EXTERNOS);
}

/**
 * El responsable técnico de un externo debe poder verlo: si no, nadie lo verificaría y la pasada de vencidos no podría
 * avisarle (spec 13C §8.2). Va después de cambiar el nivel de acceso o los procesos del documento, dentro de su
 * transacción; con un interno no hace nada.
 */
export async function exigirQueElResponsableTecnicoLoVea(sql: Cliente, documentoId: number): Promise<void> {
  const [f] = await sql`SELECT ${filtroAccesoDe(sql, sql`ex.responsable_id`)} AS lo_ve
    FROM documentos d JOIN externos ex ON ex.documento_id = d.id
    WHERE d.id = ${documentoId} AND d.origen = 'externo'`;
  if (f && !f.lo_ve) throw new ErrorTramite(RESPONSABLE_SIN_ACCESO);
}
