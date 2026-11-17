/**
 * Los hallazgos que se parecen a uno que se va a registrar (spec 15 §7.5, F15-DC9). Es el mecanismo de
 * `src/db/consultas/parecidos.ts` (`similarity` de `pg_trgm` sobre el texto sin tildes y en minúsculas), aplicado al
 * título y a la descripción. No filtra por visibilidad: quien llama ya comprobó que la persona actúa en ese proceso.
 */
import type { Cliente } from "@/db/cliente";
import { etiquetaDeEstado } from "@/lib/mejoramiento/estados";
import { TERMINALES, type EstadoHallazgo, type ResultadoCierre } from "@/lib/mejoramiento/tipos";

export type HallazgoParecido = {
  id: number;
  codigo: string;
  titulo: string;
  etiqueta: string;
  /** Abierto: todavía no es `cerrado` (los anulados y los rechazados no se ofrecen nunca). */
  abierto: boolean;
  cuando: Date;
};

const UMBRAL = 0.3;
const MAXIMO = 5;

const TEXTO = (sql: Cliente, texto: string) => sql`lower(unaccent(${texto}))`;
const DEL_HALLAZGO = (sql: Cliente) => sql`lower(unaccent(h.titulo || ' ' || h.descripcion))`;

function aParecido(f: Record<string, unknown>): HallazgoParecido {
  const estado = f.estado as EstadoHallazgo;
  return {
    id: Number(f.id),
    codigo: f.codigo as string,
    titulo: f.titulo as string,
    etiqueta: etiquetaDeEstado({
      estado,
      resultadoCierre: (f.resultado_cierre as ResultadoCierre | null) ?? null,
      correccionRequerida: (f.correccion_requerida as boolean | null) ?? null,
    }),
    abierto: !TERMINALES.includes(estado),
    cuando: f.registrado_en as Date,
  };
}

/** Hasta cinco hallazgos del proceso, abiertos o cerrados (no anulados ni rechazados), de lo más a lo menos parecido. */
export async function parecidosDelProceso(
  sql: Cliente,
  x: { procesoId: number; texto: string; excluirId?: number },
): Promise<HallazgoParecido[]> {
  const filas = await sql`SELECT h.id, h.codigo, h.titulo, h.estado, h.resultado_cierre, h.correccion_requerida, h.registrado_en
    FROM mejora_hallazgos h
    WHERE h.proceso_id = ${x.procesoId}
      AND h.estado NOT IN ('anulado', 'rechazado')
      AND h.id <> ${x.excluirId ?? 0}
      AND similarity(${DEL_HALLAZGO(sql)}, ${TEXTO(sql, x.texto)}) >= ${UMBRAL}
    ORDER BY similarity(${DEL_HALLAZGO(sql)}, ${TEXTO(sql, x.texto)}) DESC, h.id
    LIMIT ${MAXIMO}`;
  return filas.map(aParecido);
}

/**
 * Los parecidos de **otros** procesos de un hallazgo: los ve solo el Admin SGC al revisar el plan (spec §7.5, §8.6). Hasta
 * cinco, sin anulados ni rechazados.
 */
export async function parecidosDeOtrosProcesos(
  sql: Cliente,
  hallazgoId: number,
): Promise<Array<HallazgoParecido & { proceso: string }>> {
  const [o] = await sql`SELECT proceso_id, titulo || ' ' || descripcion AS texto FROM mejora_hallazgos WHERE id = ${hallazgoId}`;
  if (!o) return [];
  const filas = await sql`SELECT h.id, h.codigo, h.titulo, h.estado, h.resultado_cierre, h.correccion_requerida, h.registrado_en,
      p.nombre AS proceso
    FROM mejora_hallazgos h
    JOIN procesos p ON p.id = h.proceso_id
    WHERE h.proceso_id <> ${Number(o.proceso_id)}
      AND h.estado NOT IN ('anulado', 'rechazado')
      AND h.id <> ${hallazgoId}
      AND similarity(${DEL_HALLAZGO(sql)}, ${TEXTO(sql, o.texto as string)}) >= ${UMBRAL}
    ORDER BY similarity(${DEL_HALLAZGO(sql)}, ${TEXTO(sql, o.texto as string)}) DESC, h.id
    LIMIT ${MAXIMO}`;
  return filas.map((f) => ({ ...aParecido(f), proceso: f.proceso as string }));
}
