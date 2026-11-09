/**
 * El origen de un documento manda (spec 13C §8.1): solo el camino de externos pone `origen = 'externo'`, un externo
 * lleva siempre el tipo «Documento externo» (sigla `DE`) y no tiene trámite, y los caminos de los internos (el
 * trámite, la carga directa y la edición del panel) no lo tocan. Las guardas lanzan `ErrorTramite`: las acciones
 * muestran su mensaje y los manejadores de archivos responden 409, como a cualquier regla de negocio.
 */
import type { Cliente } from "@/db/cliente";
import { ErrorTramite } from "./flujo/contrato";

export const SIGLA_EXTERNO = "DE";
export const EXTERNO_SE_ADOPTA = "Un documento externo se adopta desde Vigencia → Externos";
export const EXTERNO_SIN_TRAMITE = "Un documento externo no tiene trámite: se adopta o se retira desde Vigencia → Externos";
export const TIPO_SOLO_EXTERNOS = "El tipo «Documento externo» es solo para documentos externos: regístrelo desde Vigencia → Externos";
export const EXTERNO_CONSERVA_TIPO = "Un documento externo conserva el tipo «Documento externo»";

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
