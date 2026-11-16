/**
 * El paso 0 del orden de candados del cierre (anexo 14C, §3.5; ver el encabezado de `reapertura.ts`): el candado consultivo
 * de transacción que serializan todo lo que cierra o reabre — el cierre del mes, la reapertura en cascada, la reapertura
 * directa de una medición, «Cerrar de nuevo» una medición y «Cerrar de nuevo» un periodo de un dato. Es la primera sentencia
 * de la transacción de cada uno, y toda lectura que decide va después.
 *
 * Módulo liviano, en su propio archivo: lo importan `cierre.ts`, `reapertura.ts` y `datos-periodos.ts`, y `reapertura.ts`
 * importa `datos-periodos.ts` (cerraría un ciclo si viviera allí).
 */
import type { TransactionSql } from "postgres";

export async function serializarCierreYReapertura(tx: TransactionSql): Promise<void> {
  await tx`SELECT pg_advisory_xact_lock(hashtext('sgc.indicadores.cierre'))`;
}
