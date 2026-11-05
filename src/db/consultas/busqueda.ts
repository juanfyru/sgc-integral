import { obtenerSql } from "@/db/cliente";
import { MARCA_FIN, MARCA_INICIO } from "@/lib/marcas-busqueda";
import type { ArchivoResumen } from "@/db/consultas/procesos";

/**
 * Búsqueda pública con filtros facetados (Fase 5). Tres señales combinadas:
 *  - FTS `espanol_unaccent` (config de la Fase 2: spanish + unaccent) con
 *    ranking por pesos A/B/C (código+título / palabras clave / descripción).
 *  - ILIKE sobre el código (índice trigram): "GTH" trae todo talento humano.
 *  - `word_similarity` sobre el título para tolerar errores de tipeo
 *    ("vacunasion" → Vacunación); solo con términos de 4+ caracteres para no
 *    meter ruido en búsquedas cortas.
 * Toda query exige versión VIGENTE (regla de negocio 3).
 */

export type FiltrosBusqueda = {
  q?: string;
  /** Sigla del tipo de documento (FO, PR, …). */
  tipo?: string;
  /** Slug del proceso: cualquier asociación, directa o vía subproceso. */
  proceso?: string;
  /** Slug del subproceso; solo tiene efecto junto con `proceso`. */
  subproceso?: string;
  /** Rango sobre la fecha de aprobación de la versión vigente (yyyy-mm-dd). */
  desde?: string;
  hasta?: string;
  limite?: number;
};

// Marcadores de resaltado de ts_headline (definidos en un módulo sin BD para el cliente).
export { MARCA_FIN, MARCA_INICIO };

export type ResultadoBusqueda = {
  id: number;
  codigo: string;
  titulo: string;
  tituloResaltado: string | null;
  descripcion: string | null;
  descripcionResaltada: string | null;
  tipo: { nombre: string; sigla: string; esDiligenciable: boolean };
  version: number;
  fechaAprobacion: string | null;
  propietario: { nombre: string; url: string; color: string } | null;
  archivos: ArchivoResumen[];
};

export type FacetaConteo = { clave: string; nombre: string; cantidad: number };

export type RespuestaBusqueda = {
  resultados: ResultadoBusqueda[];
  total: number;
  facetas: { tipos: FacetaConteo[]; procesos: FacetaConteo[] };
};

const RESPUESTA_VACIA: RespuestaBusqueda = {
  resultados: [],
  total: 0,
  facetas: { tipos: [], procesos: [] },
};

const PATRON_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const LIMITE_POR_DEFECTO = 50;

export function hayCriterios(filtros: FiltrosBusqueda): boolean {
  return Boolean(
    filtros.q?.trim() ||
      filtros.tipo ||
      filtros.proceso ||
      (filtros.desde && PATRON_FECHA.test(filtros.desde)) ||
      (filtros.hasta && PATRON_FECHA.test(filtros.hasta)),
  );
}

export async function buscarDocumentos(
  filtros: FiltrosBusqueda,
): Promise<RespuestaBusqueda> {
  if (!hayCriterios(filtros)) return RESPUESTA_VACIA;

  const sql = obtenerSql();
  const texto = filtros.q?.trim() ?? "";
  const conTexto = texto.length > 0;
  // Con menos de 4 caracteres la similitud trigram solo agrega ruido.
  const conSimilitud = texto.length >= 4;
  const patron = `%${texto}%`;
  const desde = filtros.desde && PATRON_FECHA.test(filtros.desde) ? filtros.desde : null;
  const hasta = filtros.hasta && PATRON_FECHA.test(filtros.hasta) ? filtros.hasta : null;
  const limite = Math.min(Math.max(filtros.limite ?? LIMITE_POR_DEFECTO, 1), 100);

  const condTexto = conTexto
    ? sql`AND (
        d.tsv @@ websearch_to_tsquery('espanol_unaccent', ${texto})
        OR d.codigo ILIKE ${patron}
        ${conSimilitud ? sql`OR word_similarity(unaccent(${texto}), unaccent(d.titulo)) >= 0.4` : sql``}
      )`
    : sql``;

  const condFechas = sql`
    ${desde ? sql`AND v.fecha_aprobacion >= ${desde}` : sql``}
    ${hasta ? sql`AND v.fecha_aprobacion <= ${hasta}` : sql``}`;

  const condTipo = filtros.tipo ? sql`AND t.sigla = ${filtros.tipo}` : sql``;

  // Cualquier asociación cuenta (directa o vía subproceso): coherente con la
  // pregunta del funcionario "¿qué aplica en mi proceso?" (D10).
  const condProceso = filtros.proceso
    ? sql`AND EXISTS (
        SELECT 1
        FROM documento_proceso dp
        LEFT JOIN subprocesos s ON s.id = dp.subproceso_id AND s.activo
        JOIN procesos p ON p.id = COALESCE(dp.proceso_id, s.proceso_id) AND p.activo
        WHERE dp.documento_id = d.id AND p.slug = ${filtros.proceso}
          ${filtros.subproceso ? sql`AND s.slug = ${filtros.subproceso}` : sql``}
      )`
    : sql``;

  const opcionesTitulo = `StartSel=${MARCA_INICIO}, StopSel=${MARCA_FIN}, HighlightAll=true`;
  const opcionesDescripcion = `StartSel=${MARCA_INICIO}, StopSel=${MARCA_FIN}, MaxWords=30, MinWords=10`;

  const [filas, facetaTipos, facetaProcesos] = await Promise.all([
    sql`
      SELECT d.id, d.codigo, d.titulo, d.descripcion,
             t.nombre AS tipo_nombre, t.sigla AS tipo_sigla, t.es_diligenciable,
             v.numero AS version, v.fecha_aprobacion::text AS fecha_aprobacion,
             count(*) OVER ()::int AS total,
             ${
               conTexto
                 ? sql`
             ts_headline('espanol_unaccent', d.titulo,
                         websearch_to_tsquery('espanol_unaccent', ${texto}),
                         ${opcionesTitulo}) AS titulo_resaltado,
             CASE WHEN d.descripcion IS NOT NULL THEN
               ts_headline('espanol_unaccent', d.descripcion,
                           websearch_to_tsquery('espanol_unaccent', ${texto}),
                           ${opcionesDescripcion})
             END AS descripcion_resaltada,
             ts_rank(d.tsv, websearch_to_tsquery('espanol_unaccent', ${texto}))
               + CASE WHEN d.codigo ILIKE ${patron} THEN 1 ELSE 0 END
               ${conSimilitud ? sql`+ word_similarity(unaccent(${texto}), unaccent(d.titulo))` : sql``}
               AS puntaje`
                 : sql`
             NULL AS titulo_resaltado, NULL AS descripcion_resaltada,
             0 AS puntaje`
             },
             (
               SELECT json_build_object(
                 'nombre', COALESCE(pp.nombre, pps.nombre),
                 'url', CASE
                   WHEN sp.id IS NOT NULL
                     THEN '/procesos/' || pps.slug || '/' || sp.slug
                   ELSE '/procesos/' || pp.slug
                 END,
                 'color', m.color
               )
               FROM documento_proceso dpp
               LEFT JOIN procesos pp ON pp.id = dpp.proceso_id
               LEFT JOIN subprocesos sp ON sp.id = dpp.subproceso_id
               LEFT JOIN procesos pps ON pps.id = sp.proceso_id
               JOIN macroprocesos m
                 ON m.id = COALESCE(pp.macroproceso_id, pps.macroproceso_id)
               WHERE dpp.documento_id = d.id AND dpp.es_principal
             ) AS propietario,
             (
               SELECT json_agg(
                 json_build_object('id', a.id, 'rol', a.rol, 'mime', a.mime,
                                   'tamanoBytes', a.tamano_bytes)
                 ORDER BY CASE a.rol WHEN 'principal' THEN 0 WHEN 'editable' THEN 1 ELSE 2 END
               )
               FROM archivos a WHERE a.version_id = v.id
             ) AS archivos
      FROM documentos d
      JOIN tipos_documento t ON t.id = d.tipo_id
      JOIN documento_versiones v ON v.documento_id = d.id AND v.estado = 'vigente'
      WHERE true ${condTexto} ${condFechas} ${condTipo} ${condProceso}
      ORDER BY puntaje DESC, t.orden, d.codigo
      LIMIT ${limite}`,
    // Faceta de tipo: aplica todos los filtros MENOS el de tipo, para que
    // cambiar de tipo nunca sea un callejón sin salida.
    sql`
      SELECT t.sigla AS clave, t.nombre, count(DISTINCT d.id)::int AS cantidad
      FROM documentos d
      JOIN tipos_documento t ON t.id = d.tipo_id
      JOIN documento_versiones v ON v.documento_id = d.id AND v.estado = 'vigente'
      WHERE true ${condTexto} ${condFechas} ${condProceso}
      GROUP BY t.sigla, t.nombre, t.orden
      ORDER BY t.orden`,
    // Faceta de proceso: todos los filtros MENOS proceso/subproceso.
    sql`
      SELECT p.slug AS clave, p.nombre, count(DISTINCT d.id)::int AS cantidad
      FROM documentos d
      JOIN tipos_documento t ON t.id = d.tipo_id
      JOIN documento_versiones v ON v.documento_id = d.id AND v.estado = 'vigente'
      JOIN documento_proceso dp ON dp.documento_id = d.id
      LEFT JOIN subprocesos s ON s.id = dp.subproceso_id AND s.activo
      JOIN procesos p ON p.id = COALESCE(dp.proceso_id, s.proceso_id) AND p.activo
      WHERE true ${condTexto} ${condFechas} ${condTipo}
      GROUP BY p.slug, p.nombre
      ORDER BY cantidad DESC, p.nombre`,
  ]);

  return {
    resultados: filas.map((f) => ({
      id: f.id as number,
      codigo: f.codigo as string,
      titulo: f.titulo as string,
      tituloResaltado: (f.titulo_resaltado as string | null) ?? null,
      descripcion: f.descripcion as string | null,
      descripcionResaltada: (f.descripcion_resaltada as string | null) ?? null,
      tipo: {
        nombre: f.tipo_nombre as string,
        sigla: f.tipo_sigla as string,
        esDiligenciable: f.es_diligenciable as boolean,
      },
      version: f.version as number,
      fechaAprobacion: (f.fecha_aprobacion as string | null) ?? null,
      propietario:
        (f.propietario as ResultadoBusqueda["propietario"]) ?? null,
      archivos: (f.archivos ?? []) as ArchivoResumen[],
    })),
    total: (filas[0]?.total as number | undefined) ?? 0,
    facetas: {
      tipos: facetaTipos.map(aFaceta),
      procesos: facetaProcesos.map(aFaceta),
    },
  };
}

function aFaceta(fila: Record<string, unknown>): FacetaConteo {
  return {
    clave: fila.clave as string,
    nombre: fila.nombre as string,
    cantidad: fila.cantidad as number,
  };
}

/**
 * Registra el término y su cantidad de resultados (tabla `busquedas`): las
 * búsquedas con 0 resultados le dicen a calidad qué documentación falta.
 * Nunca debe tumbar la respuesta al usuario: quien llama decide si ignora
 * el error.
 */
export async function registrarBusqueda(
  termino: string,
  cantidadResultados: number,
) {
  const sql = obtenerSql();
  await sql`
    INSERT INTO busquedas (termino, cantidad_resultados)
    VALUES (${termino.trim()}, ${cantidadResultados})`;
}
