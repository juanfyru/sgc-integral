/**
 * Las alertas de resultado de una medición (spec 14 §10.3). `recalcularMedicion` llama `alRecalcular` en su misma
 * transacción cada vez que algo cambió; las alertas, la corrección y el incumplimiento repetido llegan en la Tarea 13.
 */
import type { TransactionSql } from "postgres";
import type { Recalculo } from "./mediciones";

export async function alRecalcular(tx: TransactionSql, r: Recalculo, c: { ahora: Date; actorId: number | null }): Promise<void> {
  void tx;
  void r;
  void c;
}
