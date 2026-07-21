import { obtenerSql } from "@/db/cliente";

export type Rango = "7" | "30" | "90" | "todo";
export type DocConteo = { codigo: string; titulo: string; conteo: number };
export type TerminoConteo = { termino: string; veces: number };
export type PuntoSerie = { fecha: string; conteo: number };
export type Estadisticas = {
  totalVistas: number;
  totalDescargas: number;
  masVistos: DocConteo[];
  masDescargados: DocConteo[];
  sinResultados: TerminoConteo[];
  serie: PuntoSerie[];
};

const DIAS: Record<Exclude<Rango, "todo">, number> = { "7": 7, "30": 30, "90": 90 };

/**
 * Métricas del dashboard admin (D8). El reloj `ahora` es inyectable para que
 * el filtrado por rango sea determinista en los tests. `rango:'todo'` no pone
 * cota inferior. La serie agrupa por día, solo días con actividad.
 */
export async function obtenerEstadisticas(
  opciones: { rango: Rango; ahora?: Date },
): Promise<Estadisticas> {
  const sql = obtenerSql();
  const ahora = opciones.ahora ?? new Date();
  const desde =
    opciones.rango === "todo"
      ? null
      : new Date(ahora.getTime() - DIAS[opciones.rango] * 86_400_000).toISOString();
  const cota = desde ? sql`AND ec.creado_en >= ${desde}` : sql``;

  const [totales, masVistos, masDescargados, sinResultados, serie] = await Promise.all([
    sql`SELECT
          count(*) FILTER (WHERE ec.tipo = 'vista')::int AS vistas,
          count(*) FILTER (WHERE ec.tipo = 'descarga')::int AS descargas
        FROM eventos_consulta ec WHERE true ${cota}`,
    sql`SELECT d.codigo, d.titulo, count(*)::int AS conteo
        FROM eventos_consulta ec JOIN documentos d ON d.id = ec.documento_id
        WHERE ec.tipo = 'vista' ${cota}
        GROUP BY d.codigo, d.titulo ORDER BY conteo DESC, d.codigo LIMIT 10`,
    sql`SELECT d.codigo, d.titulo, count(*)::int AS conteo
        FROM eventos_consulta ec JOIN documentos d ON d.id = ec.documento_id
        WHERE ec.tipo = 'descarga' ${cota}
        GROUP BY d.codigo, d.titulo ORDER BY conteo DESC, d.codigo LIMIT 10`,
    sql`SELECT lower(trim(b.termino)) AS termino, count(*)::int AS veces
        FROM busquedas b
        WHERE b.cantidad_resultados = 0
          ${desde ? sql`AND b.creado_en >= ${desde}` : sql``}
        GROUP BY lower(trim(b.termino)) ORDER BY veces DESC, termino LIMIT 10`,
    sql`SELECT to_char(date_trunc('day', ec.creado_en), 'YYYY-MM-DD') AS fecha,
               count(*)::int AS conteo
        FROM eventos_consulta ec WHERE true ${cota}
        GROUP BY 1 ORDER BY 1`,
  ]);

  return {
    totalVistas: (totales[0]?.vistas as number) ?? 0,
    totalDescargas: (totales[0]?.descargas as number) ?? 0,
    masVistos: masVistos.map(aDoc),
    masDescargados: masDescargados.map(aDoc),
    sinResultados: sinResultados.map((f) => ({
      termino: f.termino as string,
      veces: f.veces as number,
    })),
    serie: serie.map((f) => ({ fecha: f.fecha as string, conteo: f.conteo as number })),
  };
}

function aDoc(f: Record<string, unknown>): DocConteo {
  return {
    codigo: f.codigo as string,
    titulo: f.titulo as string,
    conteo: f.conteo as number,
  };
}
