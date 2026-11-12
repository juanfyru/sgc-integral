/**
 * Los indicadores fuera de su módulo (spec 14 §12.8): la búsqueda de la paleta y de «Buscar» y «Indicadores que exige»
 * de la ficha de una norma. Las dos son una sola consulta, con la visibilidad de `filtroIndicadores`; ninguna abre
 * periodos ni lee mediciones (la paleta consulta mientras se teclea).
 */
import { obtenerSql, type Cliente } from "@/db/cliente";
import { escaparLike } from "@/db/consultas/normograma/busqueda";
import { filtroIndicadores, type SujetoVisibilidad } from "@/lib/alcance";

type Opciones = { sql?: Cliente };

export type ResultadoIndicador = { codigo: string; nombre: string; proceso: string; retirado: boolean };

/**
 * Hasta `limite` indicadores activos o retirados que la persona ve y cuyo código o nombre (el de la versión vigente)
 * contiene el texto, sin tildes ni mayúsculas; primero los que empiezan por él en el código, después por nombre y por código. Nunca un borrador ni un
 * descartado. Con menos de 2 caracteres, ninguno.
 */
export async function buscarIndicadores(
  q: string,
  sesion: SujetoVisibilidad,
  limite: number,
  opciones?: Opciones,
): Promise<ResultadoIndicador[]> {
  const texto = q.trim();
  if (texto.length < 2) return [];
  const sql = opciones?.sql ?? obtenerSql();
  const contiene = `%${escaparLike(texto)}%`;
  const empieza = `${escaparLike(texto)}%`;
  const filas = await sql`
    SELECT i.codigo, va.nombre, p.nombre AS proceso, (i.estado = 'retirado') AS retirado
    FROM indicadores i
    JOIN procesos p ON p.id = i.proceso_id
    JOIN LATERAL (
      SELECT nombre FROM indicador_versiones WHERE indicador_id = i.id AND estado = 'aprobada' ORDER BY numero DESC LIMIT 1
    ) va ON true
    WHERE i.estado IN ('activo', 'retirado') AND ${filtroIndicadores(sql, sesion)}
      AND (unaccent(i.codigo) ILIKE unaccent(${contiene}) OR unaccent(coalesce(va.nombre, '')) ILIKE unaccent(${contiene}))
    ORDER BY (unaccent(i.codigo) ILIKE unaccent(${empieza})) DESC, unaccent(lower(coalesce(va.nombre, ''))), i.codigo
    LIMIT ${Math.min(Math.max(Math.trunc(limite), 1), 50)}`;
  return filas.map((f) => ({ codigo: f.codigo as string, nombre: (f.nombre as string | null) ?? "", proceso: f.proceso as string, retirado: f.retirado === true }));
}

export type IndicadorQueExige = { codigo: string; nombre: string; proceso: string };

/**
 * «Indicadores que exige» una norma: los activos cuya versión vigente (la aprobada de mayor número) la cita, los que la
 * persona ve (`filtroIndicadores`). Sin N+1: una consulta.
 */
export async function indicadoresQueExige(sesion: SujetoVisibilidad, normaId: number, opciones?: Opciones): Promise<IndicadorQueExige[]> {
  const sql = opciones?.sql ?? obtenerSql();
  const filas = await sql`
    SELECT i.codigo, va.nombre, p.nombre AS proceso
    FROM indicadores i
    JOIN procesos p ON p.id = i.proceso_id
    JOIN LATERAL (
      SELECT id, nombre FROM indicador_versiones WHERE indicador_id = i.id AND estado = 'aprobada' ORDER BY numero DESC LIMIT 1
    ) va ON true
    WHERE i.estado = 'activo' AND ${filtroIndicadores(sql, sesion)}
      AND EXISTS (SELECT 1 FROM indicador_normas inn WHERE inn.version_id = va.id AND inn.norma_id = ${normaId})
    ORDER BY i.codigo`;
  return filas.map((f) => ({ codigo: f.codigo as string, nombre: (f.nombre as string | null) ?? "", proceso: f.proceso as string }));
}
