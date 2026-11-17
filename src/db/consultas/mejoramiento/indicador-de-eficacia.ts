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

/** La última versión aprobada de `i`: su nombre y su periodicidad. */
const VIGENTE = (sql: Cliente) => sql`LATERAL (
  SELECT v.nombre, v.periodicidad FROM indicador_versiones v
  WHERE v.indicador_id = i.id AND v.estado = 'aprobada' ORDER BY v.numero DESC LIMIT 1) vig`;

/** El indicador con su ficha vigente; `null` si no existe o no tiene ninguna aprobada. Sin regla de visibilidad: la pone quien llama. */
export async function indicadorDeEficacia(sql: Cliente, indicadorId: number): Promise<IndicadorDeEficacia | null> {
  if (!Number.isSafeInteger(indicadorId) || indicadorId <= 0) return null;
  const [f] = await sql`SELECT i.id, i.codigo, i.estado, i.plazo_reporte_dias, vig.nombre, vig.periodicidad
    FROM indicadores i JOIN ${VIGENTE(sql)} ON true
    WHERE i.id = ${indicadorId}`;
  if (!f) return null;
  return {
    id: Number(f.id),
    codigo: f.codigo as string,
    nombre: (f.nombre as string | null) ?? (f.codigo as string),
    activo: f.estado === "activo",
    periodicidad: f.periodicidad as Periodicidad,
    plazoReporteDias: Number(f.plazo_reporte_dias),
  };
}

/** Los que quien formula puede enlazar: activos, con ficha vigente y que ve (`filtroIndicadores`). */
export async function indicadoresElegibles(
  sql: Cliente,
  sesion: Pick<SesionFlujo, "usuarioId" | "rol" | "verHistorial">,
): Promise<Array<{ id: number; codigo: string; nombre: string; periodicidad: Periodicidad }>> {
  const filas = await sql`SELECT i.id, i.codigo, vig.nombre, vig.periodicidad
    FROM indicadores i JOIN ${VIGENTE(sql)} ON true
    WHERE i.estado = 'activo' AND ${filtroIndicadores(sql, sesion)}
    ORDER BY i.codigo, i.id`;
  return filas.map((f) => ({
    id: Number(f.id),
    codigo: f.codigo as string,
    nombre: (f.nombre as string | null) ?? (f.codigo as string),
    periodicidad: f.periodicidad as Periodicidad,
  }));
}
