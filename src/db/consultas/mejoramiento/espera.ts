/**
 * La espera de la eficacia (spec 15 §11.3; R4): desde qué día se puede registrar «eficaz» y si ya llegó, calculado al leer y en
 * lote para la lista, la página, la actividad y los parecidos. Liviano: solo lee los hallazgos, sus rondas y actividades y el
 * indicador enlazado (`indicador-de-eficacia.ts`); no importa la verificación ni las lecturas de los indicadores.
 */
import type { Cliente } from "@/db/cliente";
import type { Periodicidad } from "@/lib/indicadores/tipos";
import type { ContextoMejora } from "@/db/consultas/mejoramiento/config";
import { fechaMinimaDeEficacia, venceLaEvaluacion, yaSePuedeEvaluar } from "@/lib/mejoramiento/eficacia";
import type { Clase } from "@/lib/mejoramiento/tipos";
import { fechaEnZona } from "@/lib/tramites/plazos";
import { zonaHoraria } from "@/lib/zona-horaria";
import { indicadoresDeEficacia } from "./indicador-de-eficacia";

export type IndicadorDeLaEspera = { id: number; codigo: string; nombre: string; periodicidad: Periodicidad; plazoReporteDias: number };

/** La fecha mínima de un hallazgo en espera, con R y el indicador enlazado (spec §11.3). */
export type FechaMinima = { minima: string; r: string; indicador: IndicadorDeLaEspera | null; indicadorRetirado: boolean };

/**
 * Lo que una lectura ya sabe de la espera de eficacia de un conjunto de hallazgos (la lista, Fase 15B, anexo §11.1): cuáles están en
 * espera (`ids`), sus fechas mínimas (`fechasMinimasDe`) y el contexto de los plazos, a la misma hora (nulo si no lo necesitó). Quien
 * la recibe en la misma lectura (las tareas de quien mira) la usa solo si cubre todos sus hallazgos en espera; si no, los lee.
 */
export type EsperaLeida = { ids: ReadonlySet<number>; fechas: ReadonlyMap<number, FechaMinima>; contexto: ContextoMejora | null };

/**
 * La fecha mínima de eficacia de cada hallazgo de `hallazgoIds` que está «En espera de eficacia» (spec §11.3), calculada al leer,
 * en dos consultas para todos (la lista y las cifras, R4): R es el día, en la zona, en que terminó la última actividad no
 * cancelada de la ronda en curso (sin R si no tiene ninguna o alguna sigue sin terminar); con el indicador enlazado si sigue
 * activo, con la periodicidad de su ficha vigente. Retirado (o ya no enlazable), la espera vuelve a la de dos meses e
 * `indicadorRetirado` lo dice. Los que no están en espera, o no tienen R, no están en el mapa. Sin regla de visibilidad: el nombre
 * del indicador lo muestra quien llama solo a quien puede verlo.
 */
export async function fechasMinimasDe(sql: Cliente, hallazgoIds: readonly number[], zona: string): Promise<Map<number, FechaMinima>> {
  const ids = [...new Set(hallazgoIds.filter((id) => Number.isSafeInteger(id) && id > 0))];
  if (ids.length === 0) return new Map();
  const filas = await sql`SELECT h.id, h.clase, r.indicador_eficacia_id, to_char(r.fecha_evaluacion, 'YYYY-MM-DD') AS fecha_evaluacion,
      ult.r, ult.todas
    FROM mejora_hallazgos h
    JOIN mejora_rondas r ON r.hallazgo_id = h.id AND r.numero = h.ronda
    JOIN LATERAL (SELECT max(a.terminada_en) AS r, bool_and(a.estado = 'terminada') AS todas
      FROM mejora_actividades a JOIN mejora_acciones ac ON ac.id = a.accion_id
      WHERE ac.ronda_id = r.id AND a.estado <> 'cancelada') ult ON true
    WHERE h.id IN ${sql(ids)} AND h.estado = 'en_espera'`;
  const indicadores = await indicadoresDeEficacia(
    sql,
    filas.flatMap((f) => (f.indicador_eficacia_id === null ? [] : [Number(f.indicador_eficacia_id)])),
  );
  const resultado = new Map<number, FechaMinima>();
  for (const f of filas) {
    if (f.r === null || f.todas !== true) continue;
    const r = fechaEnZona(f.r as Date, zona);
    const enlazado = f.indicador_eficacia_id === null ? null : (indicadores.get(Number(f.indicador_eficacia_id)) ?? null);
    const activo = enlazado !== null && enlazado.activo;
    const minima = fechaMinimaDeEficacia(
      { clase: f.clase as Clase, r, fechaEvaluacion: (f.fecha_evaluacion as string | null) ?? null, periodicidad: activo ? enlazado.periodicidad : null },
      zona,
    );
    resultado.set(Number(f.id), {
      minima,
      r,
      indicador: enlazado
        ? { id: enlazado.id, codigo: enlazado.codigo, nombre: enlazado.nombre, periodicidad: enlazado.periodicidad, plazoReporteDias: enlazado.plazoReporteDias }
        : null,
      indicadorRetirado: enlazado !== null && !activo,
    });
  }
  return resultado;
}

/**
 * Hasta cuándo se evalúa la eficacia de un hallazgo en espera (spec §13.3): `venceLaEvaluacion` desde su fecha mínima, con el plazo
 * de reporte del indicador enlazado solo si sigue activo. Una sola regla para «Mis tareas», la pasada y «Con algo vencido».
 */
export function venceLaEvaluacionDe(fm: FechaMinima, c: Pick<ContextoMejora, "config" | "calendario" | "zona">): Date {
  return venceLaEvaluacion(fm.minima, fm.indicadorRetirado ? null : (fm.indicador?.plazoReporteDias ?? null), c);
}

/** La fecha mínima de eficacia de un hallazgo (`fechasMinimasDe` con uno solo); nulo si no está «En espera de eficacia». */
export async function fechaMinimaDe(sql: Cliente, hallazgoId: number, zona: string): Promise<FechaMinima | null> {
  return (await fechasMinimasDe(sql, [hallazgoId], zona)).get(hallazgoId) ?? null;
}

/**
 * Desde qué día se puede registrar «eficaz» y si ya llegó, para varios hallazgos en una pasada (R4: «Por evaluar la eficacia»
 * en la lista, la página y las cifras, con `etiquetaDeEstado(h, { yaSePuedeEvaluar })`). Los que no están en espera no están.
 */
export async function evaluablesDesde(
  sql: Cliente,
  hallazgoIds: readonly number[],
  ahora: Date,
): Promise<Map<number, { desde: string; yaSePuede: boolean }>> {
  const zona = zonaHoraria();
  const fechas = await fechasMinimasDe(sql, hallazgoIds, zona);
  return new Map([...fechas].map(([id, fm]) => [id, { desde: fm.minima, yaSePuede: yaSePuedeEvaluar(fm.minima, ahora, zona) }]));
}

/** `evaluablesDesde` de un solo hallazgo; nulo si no está «En espera de eficacia». */
export async function evaluableDesde(
  sql: Cliente,
  hallazgoId: number,
  ahora: Date,
): Promise<{ desde: string; yaSePuede: boolean } | null> {
  return (await evaluablesDesde(sql, [hallazgoId], ahora)).get(hallazgoId) ?? null;
}
