/**
 * La búsqueda de normas (spec 13C §10.6): FTS sobre `normas.tsv` (número, año y título con peso A, tema B, emisor C)
 * con `espanol_unaccent`, más `ILIKE` sobre el número y sobre el nombre completo («Resolución 3100 de 2019», con o
 * sin tildes), que el FTS no parte. Las retiradas no salen (spec 13C §10.7). Toda sesión lee el normograma.
 */
import type { PendingQuery, Row } from "postgres";
import { obtenerSql, type Cliente } from "@/db/cliente";
import type { EstadoNorma } from "@/lib/normograma/tipos";

type Opciones = { sql?: Cliente };

/** «Resolución 3100 de 2019» en SQL, sobre `normas n` y `tipos_norma tn`; la misma cadena que `nombreDeNorma`. */
export function nombreSql(sql: Cliente): PendingQuery<Row[]> {
  return sql`concat_ws(' ', tn.nombre, n.numero, 'de', n.anio::text)`;
}

/** `%`, `_` y `\` son comodines de LIKE: lo escrito se busca tal cual. */
export function escaparLike(texto: string): string {
  return texto.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** El texto de la búsqueda sobre `normas n` y `tipos_norma tn`; `q` ya viene recortado y no vacío. */
export function condicionTexto(sql: Cliente, q: string): PendingQuery<Row[]> {
  const patron = `%${escaparLike(q)}%`;
  return sql`(n.tsv @@ websearch_to_tsquery('espanol_unaccent', ${q})
    OR n.numero ILIKE ${patron}
    OR unaccent(${nombreSql(sql)}) ILIKE unaccent(${patron}))`;
}

export type ResultadoNorma = { id: number; nombre: string; titulo: string; estado: EstadoNorma };

/** Hasta `limite` normas no retiradas, primero las que mejor coinciden; con menos de 2 caracteres, ninguna. */
export async function buscarNormas(q: string, limite: number, opciones?: Opciones): Promise<ResultadoNorma[]> {
  const texto = q.trim();
  if (texto.length < 2) return [];
  const sql = opciones?.sql ?? obtenerSql();
  const patron = `%${escaparLike(texto)}%`;
  const filas = await sql`
    SELECT n.id, ${nombreSql(sql)} AS nombre, n.titulo, n.estado
    FROM normas n JOIN tipos_norma tn ON tn.id = n.tipo_norma_id
    WHERE n.estado <> 'retirada' AND ${condicionTexto(sql, texto)}
    ORDER BY ts_rank(n.tsv, websearch_to_tsquery('espanol_unaccent', ${texto}))
        + CASE WHEN n.numero ILIKE ${patron} THEN 1 ELSE 0 END DESC,
      n.anio DESC, n.id DESC
    LIMIT ${Math.min(Math.max(Math.trunc(limite), 1), 50)}`;
  return filas.map((f) => ({ id: Number(f.id), nombre: f.nombre, titulo: f.titulo, estado: f.estado as EstadoNorma }));
}
