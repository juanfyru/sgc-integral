/**
 * El indicador enlazado al criterio de eficacia (spec 15 §11.2, F15-DC23). Liviano: lee por SQL y no importa las lecturas
 * ni la aprobación de los indicadores. La ficha vigente es la última versión aprobada (la misma consulta que
 * `versionVigente`, `src/db/consultas/indicadores/aprobacion.ts`).
 */
import type { Cliente } from "@/db/cliente";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { filtroIndicadores } from "@/lib/alcance";
import type { Periodicidad } from "@/lib/indicadores/tipos";

export type IndicadorDeEficacia = {
  id: number;
  codigo: string;
  nombre: string;
  activo: boolean;
  periodicidad: Periodicidad;
  plazoReporteDias: number;
};

/**
 * La única regla de qué indicador se puede enlazar, sin la visibilidad (que pone `filtroIndicadores` donde hay una sesión):
 * activo y con ficha vigente. La usan `indicadorDeEficacia` (su `activo`), `indicadoresElegibles` e `indicadorElegible`.
 */
const ENLAZABLE = (sql: Cliente) => sql`(i.estado = 'activo'
  AND EXISTS (SELECT 1 FROM indicador_versiones ev WHERE ev.indicador_id = i.id AND ev.estado = 'aprobada'))`;

type Persona = Pick<SesionFlujo, "usuarioId" | "rol" | "verHistorial">;

/** La última versión aprobada de `i`: su nombre y su periodicidad. */
const VIGENTE = (sql: Cliente) => sql`LATERAL (
  SELECT v.nombre, v.periodicidad FROM indicador_versiones v
  WHERE v.indicador_id = i.id AND v.estado = 'aprobada' ORDER BY v.numero DESC LIMIT 1) vig`;

/** El indicador con su ficha vigente; `null` si no existe o no tiene ninguna aprobada. Sin regla de visibilidad: la pone quien llama. */
export async function indicadorDeEficacia(sql: Cliente, indicadorId: number): Promise<IndicadorDeEficacia | null> {
  if (!Number.isSafeInteger(indicadorId) || indicadorId <= 0) return null;
  const [f] = await sql`SELECT i.id, i.codigo, ${ENLAZABLE(sql)} AS enlazable, i.plazo_reporte_dias, vig.nombre, vig.periodicidad
    FROM indicadores i JOIN ${VIGENTE(sql)} ON true
    WHERE i.id = ${indicadorId}`;
  if (!f) return null;
  return {
    id: Number(f.id),
    codigo: f.codigo as string,
    nombre: (f.nombre as string | null) ?? (f.codigo as string),
    activo: f.enlazable === true,
    periodicidad: f.periodicidad as Periodicidad,
    plazoReporteDias: Number(f.plazo_reporte_dias),
  };
}

/** Los que quien formula puede enlazar: activos, con ficha vigente y que ve (`filtroIndicadores`). */
export async function indicadoresElegibles(
  sql: Cliente,
  sesion: Persona,
): Promise<Array<{ id: number; codigo: string; nombre: string; periodicidad: Periodicidad }>> {
  const filas = await sql`SELECT i.id, i.codigo, vig.nombre, vig.periodicidad
    FROM indicadores i JOIN ${VIGENTE(sql)} ON true
    WHERE ${ENLAZABLE(sql)} AND ${filtroIndicadores(sql, sesion)}
    ORDER BY i.codigo, i.id`;
  return filas.map((f) => ({
    id: Number(f.id),
    codigo: f.codigo as string,
    nombre: (f.nombre as string | null) ?? (f.codigo as string),
    periodicidad: f.periodicidad as Periodicidad,
  }));
}

/** Si la persona puede enlazar ese indicador ahora: la misma regla de la lista, para uno. */
export async function indicadorElegible(sql: Cliente, sesion: Persona, indicadorId: number): Promise<boolean> {
  const [f] = await sql`SELECT 1 FROM indicadores i
    WHERE i.id = ${indicadorId} AND ${ENLAZABLE(sql)} AND ${filtroIndicadores(sql, sesion)}`;
  return f !== undefined;
}
