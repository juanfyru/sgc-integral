import type { Sql, TransactionSql } from "postgres";

class Reversion extends Error {}

/**
 * Corre `fn` dentro de una transacción que siempre se revierte y devuelve su
 * resultado. Un error de `fn` se propaga tal cual (también revierte).
 */
export async function revertida<T>(
  sql: Sql,
  fn: (tx: TransactionSql) => Promise<T>,
): Promise<T> {
  let resultado: T | undefined;
  try {
    await sql.begin(async (tx) => {
      resultado = await fn(tx);
      throw new Reversion("rollback");
    });
  } catch (err) {
    if (!(err instanceof Reversion)) throw err;
  }
  return resultado as T;
}
