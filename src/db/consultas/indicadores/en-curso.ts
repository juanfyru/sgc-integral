/**
 * Las mediciones en curso de un indicador, y la marca y el recálculo que «soporte obligatorio» les pide. Aparte de
 * `operacion.ts` para que `publicacion.ts` (`alPublicarVersion`) los use sin importar la operación, que importa
 * `aprobacion.ts`, que importa `publicacion.ts`: solo depende de `./mediciones` y `@/lib` (lo vigila
 * `tests/indicadores-ciclos.test.ts`).
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
 * `propagacion` con `venceEn`, anexo 14C §3.4, o el `recalculo` de la racha que esa propagación disparó), que puede moverla
 * más de una vez.
 */
export const enCurso = (tx: TransactionSql, indicadorId: number) =>
  tx`SELECT m.id, m.periodo, m.vence_en, m.aviso_previo_en, m.aviso_vencido_en, m.escalado_en,
      (SELECT e.creado_en FROM medicion_eventos e
        WHERE e.medicion_id = m.id AND e.tipo IN ('foto', 'propagacion', 'recalculo') AND e.detalle->>'venceEn' IS NOT NULL
        ORDER BY e.id DESC LIMIT 1) AS plazo_desde
    FROM mediciones m
    WHERE m.indicador_id = ${indicadorId} AND m.estado <> 'cerrada' AND NOT m.historica
    ORDER BY m.desde, m.id FOR UPDATE OF m`;

/**
 * «Soporte obligatorio» cambió. Al **activarlo** decide la marca de las mediciones en curso (`debe_soporte`, anexo del
 * complemento de la 14C §4.2; las cerradas y las históricas no se tocan): la deben todas salvo las que quien mide ya había
 * reportado (`reportada_en`, también en un mixto que espera su dato) con la fecha límite **de su reporte** anterior a
 * `ahora`: el `venceAntes` del primer evento que lo lleve o, sin ninguno, `vence_en` (la de «Reportes a tiempo»,
 * `reportesDelPeriodo` de `calculos.ts`, y la del relleno de la `0017`). No la que la medición tiene si el sistema la contó
 * otra vez para un análisis (un dato que llegó tarde y no cumple): con ella, deber el soporte dependería del resultado. Sin
 * `venceAntes`, es `vence_en`, que `cambiarOperacion` ya movió si cambió el plazo. El reporte es de quien mide si lleva
 * `reportada_por`: el que pone el sistema (el contagio de un componente «No aplica», la foto, lo que nadie mide) no lo
 * lleva, y la medición que quien mide no reportó lo debe. Volver a activarlo la decide otra vez; desactivarlo no la toca,
 * porque el indicador ya no lo exige. Después, en los dos casos, las recalcula todas (evento `recalculo`, la misma persona
 * y la misma hora, recálculo de sistema `"soporte"`: con la versión con que se calcularon): una ya reportada que lo debe
 * vuelve a abierta para pedirlo y, al desactivarlo, una que solo esperaba el soporte queda reportada. Las de otra
 * periodicidad no se calculan. Devuelve cuántas cambiaron. Quien llama tiene el indicador `FOR UPDATE` y ya escribió el
 * valor nuevo en `indicadores` (`recalcularMedicion` lo lee de ahí): `cambiarOperacion` y `alPublicarVersion`.
 */
export async function recalcularPorSoporte(
  tx: TransactionSql,
  indicadorId: number,
  c: { ahora: Date; actorId: number; activado: boolean },
): Promise<number> {
  const zona = zonaHoraria();
  const versiones = await versionesAprobadas(tx, indicadorId);
  const filas = await enCurso(tx, indicadorId);
  if (c.activado && filas.length > 0) {
    await tx`UPDATE mediciones m SET debe_soporte = NOT (m.reportada_en IS NOT NULL AND m.reportada_por IS NOT NULL
        AND coalesce((SELECT (a.detalle ->> 'venceAntes')::timestamptz FROM medicion_eventos a
          WHERE a.medicion_id = m.id AND a.detalle ? 'venceAntes' ORDER BY a.id LIMIT 1), m.vence_en) < ${c.ahora})
      WHERE m.id IN ${tx(filas.map((f) => Number(f.id)))}`;
  }
  let recalculadas = 0;
  for (const m of filas) {
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
