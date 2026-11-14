/**
 * Lo que pasa cuando una versión de la ficha queda aprobada (anexo 14B, §5.3 y §8): la llaman los dos caminos que publican,
 * `aprobarFichas` (después de la firma «Aprobó») y `enviarAAprobacion` en un cambio menor (después de la «Elaboró»),
 * dentro de su transacción y con el indicador ya `FOR UPDATE`. La importación de lotes no la llama: lo importado es
 * siempre manual, el indicador nace sin cálculo y sin ente (la plantilla no lo trae); ponérselo después es un cambio menor,
 * que sí pasa por aquí.
 *
 * El indicador guarda el cálculo y el alcance de su ficha vigente: el índice único parcial `indicadores_calculo_unico`
 * deja a lo sumo una ficha activa por cálculo y alcance (con alcance «proceso», por proceso), y quien llama convierte su
 * `23505` en un mensaje legible. Una ficha automática no la mide nadie ni lleva soporte obligatorio: si lo tenía, se apaga
 * y las mediciones en curso se recalculan como al desmarcarlo en «Datos de operación» (`recalcularPorSoporte`).
 *
 * Guarda también desde cuándo la ficha vigente se reporta a su ente (`indicadores.ente_desde`, anexo §8): las constancias
 * nacen solo para los periodos externos que terminan después. Si la versión que se publica se reporta (`seReportaAlEnte`) y
 * cambió el ente, la periodicidad externa o el plazo frente a la aprobada anterior (o la anterior no se reportaba), cuenta
 * desde ahora: añadir el ente a una ficha con años de historia no abre envíos vencidos. Si no se reporta, deja de contar y
 * sus constancias pendientes sin soporte dejan de pedirse (`quitarConstanciasSinSoporte`). Lo ya nacido no cambia.
 */
import type { TransactionSql } from "postgres";
import { registrarAuditoria } from "@/db/consultas/admin";
import { seReportaAlEnte } from "@/lib/indicadores/constancias";
import { ErrorIndicador } from "@/lib/indicadores/tipos";
import { quitarConstanciasSinSoporte, recalcularPorSoporte } from "./operacion";

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

/** Lo que una versión dice del ente, tal como lo lee `seReportaAlEnte`. */
type EnteDeVersion = { ente: string | null; periodicidadExterna: string | null; plazoExternoDias: number | null; periodicidad: string | null };

const enteDe = (v: Record<string, unknown>): EnteDeVersion => ({
  ente: (v.ente as string | null) ?? null,
  periodicidadExterna: (v.periodicidad_externa as string | null) ?? null,
  plazoExternoDias: v.plazo_externo_dias === null || v.plazo_externo_dias === undefined ? null : Number(v.plazo_externo_dias),
  periodicidad: (v.periodicidad as string | null) ?? null,
});

const mismoEnte = (a: EnteDeVersion, b: EnteDeVersion) =>
  a.ente?.trim() === b.ente?.trim() && a.periodicidadExterna === b.periodicidadExterna && a.plazoExternoDias === b.plazoExternoDias;

/**
 * `ente_desde` frente a la aprobada anterior (la de mayor número antes que esta): vuelve a contar desde `ahora` si la nueva
 * se reporta y la anterior no, o cambió lo que dice del ente; sin reportarse, nulo y las pendientes sin soporte se quitan.
 */
async function alPublicarElEnte(tx: TransactionSql, d: Publicacion, nueva: EnteDeVersion, numero: number): Promise<void> {
  if (!seReportaAlEnte(nueva)) {
    await tx`UPDATE indicadores SET ente_desde = NULL WHERE id = ${d.indicadorId}`;
    await quitarConstanciasSinSoporte(tx, d.indicadorId);
    return;
  }
  const [anterior] = await tx`SELECT ente, periodicidad_externa, plazo_externo_dias, periodicidad FROM indicador_versiones
    WHERE indicador_id = ${d.indicadorId} AND estado = 'aprobada' AND numero < ${numero} AND id <> ${d.versionId}
    ORDER BY numero DESC LIMIT 1`;
  const previa = anterior ? enteDe(anterior) : null;
  if (previa && seReportaAlEnte(previa) && mismoEnte(previa, nueva)) return;
  await tx`UPDATE indicadores SET ente_desde = ${d.ahora} WHERE id = ${d.indicadorId}`;
}

export async function alPublicarVersion(tx: TransactionSql, d: Publicacion): Promise<Publicado> {
  const [v] = await tx`SELECT v.numero, v.calculo, v.calculo_alcance, v.ente, v.periodicidad_externa, v.plazo_externo_dias, v.periodicidad,
      i.codigo, i.soporte_obligatorio
    FROM indicador_versiones v
    JOIN indicadores i ON i.id = v.indicador_id
    WHERE v.id = ${d.versionId} AND v.indicador_id = ${d.indicadorId}`;
  if (!v) throw new ErrorIndicador("La ficha no existe");
  const calculo = (v.calculo as string | null) ?? null;
  await tx`UPDATE indicadores SET calculo = ${calculo}, calculo_alcance = ${(v.calculo_alcance as string | null) ?? null}
    WHERE id = ${d.indicadorId}`;
  await alPublicarElEnte(tx, d, enteDe(v), Number(v.numero));
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
