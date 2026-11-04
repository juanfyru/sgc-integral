import type { Sql } from "postgres";

/** Grupos de 2 o más nombres que coinciden sin distinguir mayúsculas, en orden de aparición. */
export function duplicadosSinMayusculas(nombres: string[]): string[][] {
  const grupos = new Map<string, string[]>();
  for (const nombre of nombres) {
    const clave = nombre.toLowerCase();
    const grupo = grupos.get(clave);
    if (grupo) grupo.push(nombre);
    else grupos.set(clave, [nombre]);
  }
  return [...grupos.values()].filter((g) => g.length > 1);
}

export function mensajeDuplicados(grupos: string[][]): string {
  const lista = grupos.map((g) => g.join(", ")).join("; ");
  return `Hay cuentas duplicadas sin distinguir mayúsculas: ${lista}. Renombre una antes de actualizar.`;
}

/** Antes de migrar: el índice único por lower(usuario) fallaría con duplicados. */
export async function comprobarDuplicadosUsuario(sql: Sql): Promise<void> {
  const [{ existe }] = await sql<{ existe: string | null }[]>`SELECT to_regclass('usuarios') AS existe`;
  if (existe === null) return;
  const filas = await sql<{ usuario: string }[]>`SELECT usuario FROM usuarios ORDER BY id`;
  const grupos = duplicadosSinMayusculas(filas.map((f) => f.usuario));
  if (grupos.length > 0) throw new Error(mensajeDuplicados(grupos));
}
