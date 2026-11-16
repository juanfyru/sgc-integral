/**
 * Las mediciones en curso de un indicador y el recálculo que «soporte obligatorio» les pide. Aparte de `operacion.ts` para
 * que `publicacion.ts` (`alPublicarVersion`) los use sin importar la operación, que importa `aprobacion.ts`, que importa
 * `publicacion.ts`: solo depende de `./mediciones` y `@/lib` (lo vigila `tests/indicadores-ciclos.test.ts`).
 */
import type { TransactionSql } from "postgres";
import { periodoDe } from "@/lib/indicadores-documentales/periodo";
import { versionQueRigeEntre } from "@/lib/indicadores/periodos";
import { zonaHoraria } from "@/lib/zona-horaria";
import { esDeOtraPeriodicidad, recalcularMedicion, versionesAprobadas } from "./mediciones";

/**
 * Las mediciones que todavía siguen su curso: sin cerrar y no históricas (un histórico no tiene plazo ni avisos), bloqueadas.
 * `plazo_desde` es la hora de la última vez que el sistema les movió la fecha límite, o nulo: la foto que la movió (el evento
 * `foto` con `venceEn`, anexo 14B §5.4; a lo sumo una) o la propagación que la dejó pidiendo un análisis (el evento
 * `propagacion` con `venceEn`, anexo 14C §3.4), que puede moverla más de una vez.
 */
export const enCurso = (tx: TransactionSql, indicadorId: number) =>
  tx`SELECT m.id, m.periodo, m.vence_en, m.aviso_previo_en, m.aviso_vencido_en, m.escalado_en,
      (SELECT e.creado_en FROM medicion_eventos e
        WHERE e.medicion_id = m.id AND e.tipo IN ('foto', 'propagacion') AND e.detalle->>'venceEn' IS NOT NULL
        ORDER BY e.id DESC LIMIT 1) AS plazo_desde
    FROM mediciones m
    WHERE m.indicador_id = ${indicadorId} AND m.estado <> 'cerrada' AND NOT m.historica
    ORDER BY m.desde, m.id FOR UPDATE OF m`;

/**
 * «Soporte obligatorio» cambió: las mediciones en curso se recalculan (evento `recalculo`, la misma persona y la misma
 * hora, recálculo de sistema `"soporte"`: con la versión con que se calcularon). El soporte rige hacia adelante (residuos
 * finales, punto 1): al **activarlo** solo alcanza las que siguen en plazo (`vence_en >= ahora`), y una ya reportada sin
 * soporte vuelve a abierta para pedirlo; las que ya vencieron se quedan como están (se reportaron cuando no se pedía y no
 * se vuelven vencidas). Al **desactivarlo**, todas: una que solo esperaba el soporte queda reportada. Las de otra
 * periodicidad no se calculan. Devuelve cuántas cambiaron. Quien llama tiene el indicador `FOR UPDATE` y ya escribió el valor
 * nuevo en `indicadores` (`recalcularMedicion` lo lee de ahí): `cambiarOperacion` y `alPublicarVersion`.
 */
export async function recalcularPorSoporte(
  tx: TransactionSql,
  indicadorId: number,
  c: { ahora: Date; actorId: number; activado: boolean },
): Promise<number> {
  const zona = zonaHoraria();
  const versiones = await versionesAprobadas(tx, indicadorId);
  let recalculadas = 0;
  for (const m of await enCurso(tx, indicadorId)) {
    if (c.activado && new Date(m.vence_en as string).getTime() < c.ahora.getTime()) continue;
    const clave = m.periodo as string;
    const periodo = periodoDe(clave, zona);
    const version = periodo ? versionQueRigeEntre(versiones, periodo, zona) : null;
    if (!version || esDeOtraPeriodicidad(clave, version)) continue;
    const r = await recalcularMedicion(tx, Number(m.id), {
      ahora: c.ahora,
      actorId: c.actorId,
      evento: "recalculo",
      detalle: { causa: "soporte_obligatorio" },
      sistema: "soporte",
    });
    if (r.cambio) recalculadas += 1;
  }
  return recalculadas;
}
