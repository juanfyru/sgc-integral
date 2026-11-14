/**
 * Lo que pasa cuando una versión de la ficha queda aprobada (anexo 14B, §5.3): la llaman los dos caminos que publican,
 * `aprobarFichas` (después de la firma «Aprobó») y `enviarAAprobacion` en un cambio menor (después de la «Elaboró»),
 * dentro de su transacción y con el indicador ya `FOR UPDATE`. La importación de lotes no la llama: lo importado es
 * siempre manual y el indicador nace sin cálculo.
 *
 * El indicador guarda el cálculo y el alcance de su ficha vigente: el índice único parcial `indicadores_calculo_unico`
 * deja a lo sumo una ficha activa por cálculo y alcance (con alcance «proceso», por proceso), y quien llama convierte su
 * `23505` en un mensaje legible. Una ficha automática no la mide nadie ni lleva soporte obligatorio: si lo tenía, se apaga
 * y las mediciones en curso se recalculan como al desmarcarlo en «Datos de operación» (`recalcularPorSoporte`).
 */
import type { TransactionSql } from "postgres";
import { registrarAuditoria } from "@/db/consultas/admin";
import { ErrorIndicador } from "@/lib/indicadores/tipos";
import { recalcularPorSoporte } from "./operacion";

export type Publicacion = {
  indicadorId: number;
  versionId: number;
  elaboradaPor: number | null;
  elaboradaEn: Date | null;
  actorId: number;
  ahora: Date;
};

/** El mensaje de una segunda ficha activa con el mismo cálculo y alcance; con el código de la que ya lo está, si se sabe. */
export const yaHayUnaActiva = (codigo?: string) => `Ya hay una ficha activa para ese cálculo y alcance${codigo ? `: ${codigo}` : ""}`;

/** El `23505` del índice que deja una sola ficha activa por cálculo y alcance (dos aprobaciones a la vez). */
export const esCalculoRepetido = (err: unknown) =>
  (err as { code?: string }).code === "23505" && (err as { constraint_name?: string }).constraint_name === "indicadores_calculo_unico";

/** Lo que la publicación cambió en los datos de operación: quien llama lo deja en el detalle de su entrada de bitácora. */
export type Publicado = { medidoresQuitados: number; soporteApagado: boolean; medicionesRecalculadas: number };

export async function alPublicarVersion(tx: TransactionSql, d: Publicacion): Promise<Publicado> {
  const [v] = await tx`SELECT v.calculo, v.calculo_alcance, i.codigo, i.soporte_obligatorio FROM indicador_versiones v
    JOIN indicadores i ON i.id = v.indicador_id
    WHERE v.id = ${d.versionId} AND v.indicador_id = ${d.indicadorId}`;
  if (!v) throw new ErrorIndicador("La ficha no existe");
  const calculo = (v.calculo as string | null) ?? null;
  await tx`UPDATE indicadores SET calculo = ${calculo}, calculo_alcance = ${(v.calculo_alcance as string | null) ?? null}
    WHERE id = ${d.indicadorId}`;
  const hecho: Publicado = { medidoresQuitados: 0, soporteApagado: false, medicionesRecalculadas: 0 };
  if (calculo === null) return hecho;

  const quitados = await tx`DELETE FROM indicador_designados WHERE indicador_id = ${d.indicadorId} AND funcion = 'mide' RETURNING usuario_id`;
  if (v.soporte_obligatorio === true) {
    // Como al desmarcarlo en «Datos de operación» (F14A-R52): la que solo esperaba el soporte queda reportada.
    await tx`UPDATE indicadores SET soporte_obligatorio = false WHERE id = ${d.indicadorId}`;
    hecho.soporteApagado = true;
    hecho.medicionesRecalculadas = await recalcularPorSoporte(tx, d.indicadorId, { ahora: d.ahora, actorId: d.actorId, activado: false });
  }
  hecho.medidoresQuitados = quitados.length;
  if (quitados.length > 0) {
    await registrarAuditoria(tx, {
      usuarioId: d.actorId,
      accion: "indicador_medidores_quitados",
      entidad: "indicador",
      entidadId: d.indicadorId,
      detalle: { codigo: v.codigo as string, cuantos: quitados.length },
    });
  }
  return hecho;
}
