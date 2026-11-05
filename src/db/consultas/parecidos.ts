import { obtenerSql, type Cliente } from "@/db/cliente";

export type Parecido = {
  documentoId: number;
  codigo: string;
  titulo: string;
  version: number;
  procesoId: number;
  nivel: "muy_parecido" | "parecido";
};

const UMBRAL_MUY_PARECIDO = 0.6;
const UMBRAL_PARECIDO = 0.3;
const MAXIMO = 5;

/**
 * Documentos vigentes con un título parecido, para ver si una creación es un duplicado
 * (spec 13A §8.3). Lo consulta quien gestiona los trámites, que ve todos los documentos.
 */
export async function buscarParecidos(titulo: string, opciones?: { sql?: Cliente }): Promise<Parecido[]> {
  const sql = opciones?.sql ?? obtenerSql();
  const filas = await sql`SELECT d.id, d.codigo, d.titulo, v.numero AS version,
      COALESCE(dp.proceso_id, s.proceso_id) AS proceso_id,
      similarity(lower(unaccent(d.titulo)), lower(unaccent(${titulo}))) AS similitud
    FROM documentos d
    JOIN documento_versiones v ON v.documento_id = d.id AND v.estado = 'vigente'
    JOIN documento_proceso dp ON dp.documento_id = d.id AND dp.es_principal
    LEFT JOIN subprocesos s ON s.id = dp.subproceso_id
    WHERE similarity(lower(unaccent(d.titulo)), lower(unaccent(${titulo}))) >= ${UMBRAL_PARECIDO}
    ORDER BY similitud DESC, d.codigo
    LIMIT ${MAXIMO}`;
  return filas.map((f) => ({
    documentoId: Number(f.id),
    codigo: f.codigo,
    titulo: f.titulo,
    version: f.version,
    procesoId: Number(f.proceso_id),
    nivel: f.similitud >= UMBRAL_MUY_PARECIDO ? "muy_parecido" : "parecido",
  }));
}
