/**
 * El lote de una importación de indicadores (spec fase 14A §5.3 y §5.7): su candado y su estado. Aparte de
 * `importacion.ts` para que `registrarArchivo` lo use sin cargar la lectura del Excel.
 *
 * El lote y sus eventos son de solo inserción y `sgc_app` no tiene `UPDATE` sobre ellos, así que no se pueden tomar
 * `FOR UPDATE`: quien sube su plantilla, quien lo importa y quien lo deshace se ordenan con un candado de transacción
 * por lote (`bloquearLote`), siempre el primero que se toma.
 */
import type { TransactionSql } from "postgres";
import type { Cliente } from "@/db/cliente";
import { ErrorTramite } from "@/db/consultas/flujo/contrato";

export type EstadoLote = "sin_archivo" | "por_importar" | "importado" | "deshecho";

/** El candado de transacción del lote: lo toman la subida de su plantilla, la importación y el deshacer. */
export async function bloquearLote(tx: TransactionSql, loteId: number): Promise<void> {
  await tx`SELECT pg_advisory_xact_lock(hashtext('importaciones_indicadores'), ${loteId}::int)`;
}

/** El estado del lote, de sus eventos y de su archivo; `null` si no existe. */
export async function estadoDeLote(sql: Cliente, loteId: number): Promise<EstadoLote | null> {
  if (!Number.isSafeInteger(loteId) || loteId <= 0 || loteId > 2_147_483_647) return null;
  const [l] = await sql`SELECT
      EXISTS (SELECT 1 FROM archivos a WHERE a.contexto = 'importacion_indicadores' AND a.contexto_id = l.id) AS con_archivo,
      EXISTS (SELECT 1 FROM importacion_eventos e WHERE e.importacion_id = l.id AND e.tipo = 'importado') AS importado,
      EXISTS (SELECT 1 FROM importacion_eventos e WHERE e.importacion_id = l.id AND e.tipo = 'deshecho') AS deshecho
    FROM importaciones_indicadores l WHERE l.id = ${loteId}`;
  if (!l) return null;
  if (l.deshecho) return "deshecho";
  if (l.importado) return "importado";
  return l.con_archivo ? "por_importar" : "sin_archivo";
}

/**
 * Lo que `registrarArchivo` exige antes de escribir la plantilla de un lote: el lote bloqueado, existente y aún sin
 * archivo. Dos subidas a la vez pasan las dos `autorizarArchivoDeLote`: aquí solo entra la primera.
 */
export async function exigirLoteSinArchivo(tx: TransactionSql, loteId: number): Promise<void> {
  await bloquearLote(tx, loteId);
  const estado = await estadoDeLote(tx, loteId);
  if (estado === null) throw new ErrorTramite("La importación no existe");
  if (estado !== "sin_archivo") throw new ErrorTramite("La importación ya tiene su plantilla");
}
