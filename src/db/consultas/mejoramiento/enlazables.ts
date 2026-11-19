/**
 * Lo que «A qué se refiere» deja enlazar desde otra página (Fase 15B, anexo §10.2 y §10.3), con la regla de visibilidad del módulo de
 * cada cosa: un documento con versión vigente que la persona ve (`filtroAcceso`, la regla de `documentosVigentesVisibles`) y un
 * indicador activo o retirado que ve (`filtroIndicadores`, la de `indicadoresConMediciones`). Una sola regla para el prellenado del
 * registro, el del reporte y lo que `enviarReporte` vuelve a mirar dentro de su transacción: lo que la persona no ve, no existe (nulo,
 * sin decir por qué). Cada uno trae su proceso, el que se propone.
 *
 * Liviano: solo lee, y no importa nada del módulo.
 */
import type { Cliente } from "@/db/cliente";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { filtroAcceso, filtroIndicadores } from "@/lib/alcance";

/** Un documento por su id o por su código (tal como se guarda: la página lo enlaza con el suyo). */
export type CualDocumento = { id: number } | { codigo: string };
/** Un indicador por su id o por su código. */
export type CualIndicador = { id: number } | { codigo: string };

export type DocumentoEnlazable = { id: number; codigo: string; titulo: string; procesoId: number | null };
export type IndicadorEnlazable = { id: number; codigo: string; nombre: string; procesoId: number };

const esId = (n: number) => Number.isSafeInteger(n) && n > 0;

/**
 * El documento, si tiene versión vigente y la persona lo ve; con su proceso propietario (el del documento o, si su asociación
 * principal es a un subproceso, el de ese subproceso), nulo si no tiene. Nulo si no existe o no lo ve.
 */
export async function documentoEnlazable(sql: Cliente, sesion: SesionFlujo, cual: CualDocumento): Promise<DocumentoEnlazable | null> {
  if ("id" in cual && !esId(cual.id)) return null;
  const donde = "id" in cual ? sql`d.id = ${cual.id}` : sql`d.codigo = ${cual.codigo}`;
  const [d] = await sql`SELECT d.id, d.codigo, d.titulo, coalesce(dp.proceso_id, s.proceso_id) AS proceso_id FROM documentos d
      LEFT JOIN documento_proceso dp ON dp.documento_id = d.id AND dp.es_principal
      LEFT JOIN subprocesos s ON s.id = dp.subproceso_id
    WHERE ${donde}
      AND EXISTS (SELECT 1 FROM documento_versiones v WHERE v.documento_id = d.id AND v.estado = 'vigente')
      AND ${filtroAcceso(sql, sesion)}
    LIMIT 1`;
  if (!d) return null;
  return {
    id: Number(d.id),
    codigo: d.codigo as string,
    titulo: d.titulo as string,
    procesoId: d.proceso_id === null ? null : Number(d.proceso_id),
  };
}

/** El indicador, si está activo o retirado y la persona lo ve; con su proceso y el nombre de su ficha vigente. Nulo si no. */
export async function indicadorEnlazable(sql: Cliente, sesion: SesionFlujo, cual: CualIndicador): Promise<IndicadorEnlazable | null> {
  if ("id" in cual && !esId(cual.id)) return null;
  const donde = "id" in cual ? sql`i.id = ${cual.id}` : sql`i.codigo = ${cual.codigo}`;
  const [i] = await sql`SELECT i.id, i.codigo, i.proceso_id, coalesce((SELECT iv.nombre FROM indicador_versiones iv
      WHERE iv.indicador_id = i.id AND iv.estado = 'aprobada' ORDER BY iv.numero DESC LIMIT 1), i.codigo) AS nombre
    FROM indicadores i
    WHERE ${donde} AND i.estado IN ('activo', 'retirado') AND ${filtroIndicadores(sql, sesion)}`;
  if (!i) return null;
  return { id: Number(i.id), codigo: i.codigo as string, nombre: i.nombre as string, procesoId: Number(i.proceso_id) };
}
