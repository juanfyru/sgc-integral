import type { Sql, TransactionSql } from "postgres";

export function mensajeDuplicados(grupos: string[][]): string {
  const lista = grupos.map((g) => g.join(", ")).join("; ");
  return `Hay cuentas duplicadas sin distinguir mayúsculas: ${lista}. Renombre una antes de actualizar.`;
}

/**
 * Antes de migrar: el índice único por lower(usuario) fallaría con duplicados. Agrupa en SQL con
 * el mismo lower() del índice (el toLowerCase() de JS difiere en Unicode, p. ej. la sigma final).
 * Grupos en orden de aparición y, dentro de cada uno, los nombres por id.
 */
export async function comprobarDuplicadosUsuario(sql: Sql | TransactionSql): Promise<void> {
  const [{ existe }] = await sql<{ existe: string | null }[]>`SELECT to_regclass('usuarios') AS existe`;
  if (existe === null) return;
  const grupos = await sql<{ nombres: string[] }[]>`
    SELECT json_agg(usuario ORDER BY id) AS nombres
    FROM usuarios
    GROUP BY lower(usuario)
    HAVING count(*) > 1
    ORDER BY min(id)`;
  if (grupos.length > 0) throw new Error(mensajeDuplicados(grupos.map((g) => g.nombres)));
}
