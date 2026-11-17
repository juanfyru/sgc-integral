/**
 * Las dos fechas de la eficacia (spec 15 §11.3 y §11.4, F15-DC24). Puro: sin base de datos. Los días son `AAAA-MM-DD` del
 * calendario de la zona; un día se vuelve instante con `finDeFecha` y un instante vuelve a día con `fechaEnZona`, nunca
 * con `new Date("AAAA-MM-DD")` (la medianoche UTC es el día anterior en Bogotá).
 */
import { z } from "zod";
import type { ContextoMejora } from "@/db/consultas/mejoramiento/config";
import { sumarDiasHabiles } from "@/lib/dias-habiles";
import { periodoQueContiene } from "@/lib/indicadores/periodos";
import type { Periodicidad } from "@/lib/indicadores/tipos";
import { fechaEnZona, finDeFecha } from "@/lib/tramites/plazos";
import { sumarMeses } from "@/lib/vigencia/plazo";
import { venceEn } from "./plazos";
import { CRITERIOS_EFICACIA, type Clase, type CriterioEficacia } from "./tipos";

type Contexto = Pick<ContextoMejora, "config" | "calendario" | "zona">;

const mayor = (a: string, b: string) => (a > b ? a : b);

/** Días calendario sobre un día del calendario: aritmética de fechas, sin zona. */
const masDias = (dia: string, n: number) => new Date(Date.parse(`${dia}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** El día siguiente al fin del segundo periodo de la periodicidad que empieza después del día `r`. */
function trasDosPeriodos(p: Periodicidad, r: string, zona: string): string {
  const contiene = periodoQueContiene(p, finDeFecha(r, zona), zona);
  const primero = periodoQueContiene(p, new Date(contiene.hasta.getTime() + 1), zona);
  const segundo = periodoQueContiene(p, new Date(primero.hasta.getTime() + 1), zona);
  return fechaEnZona(new Date(segundo.hasta.getTime() + 1), zona);
}

/**
 * La fecha mínima de eficacia: desde qué día se puede registrar «eficaz». En la no conformidad, la mayor entre `r` más dos
 * meses calendario y, con indicador enlazado activo (`periodicidad`), el día siguiente al segundo periodo completo del
 * indicador que empieza después de `r`. En la observación y la oportunidad, la fecha de evaluación del plan, o `r` si es
 * posterior. `r` es el día en que terminó la última actividad (o, para el cierre previsto, su fin planeado).
 */
export function fechaMinimaDeEficacia(
  x: { clase: Clase; r: string; fechaEvaluacion: string | null; periodicidad: Periodicidad | null },
  zona: string,
): string {
  if (x.clase !== "no_conformidad") return x.fechaEvaluacion ? mayor(x.fechaEvaluacion, x.r) : x.r;
  const dosMeses = fechaEnZona(sumarMeses(finDeFecha(x.r, zona), 2, zona), zona);
  return x.periodicidad ? mayor(dosMeses, trasDosPeriodos(x.periodicidad, x.r, zona)) : dosMeses;
}

/**
 * Hasta cuándo se evalúa la eficacia: el plazo de evaluar (días hábiles) desde la fecha mínima y, con indicador enlazado,
 * después de sumarle los días calendario de su plazo de reporte, para que el resultado del segundo periodo ya esté.
 */
export function venceLaEvaluacion(minima: string, plazoReporteDias: number | null, c: Contexto): Date {
  return venceEn("evaluar", finDeFecha(masDias(minima, plazoReporteDias ?? 0), c.zona), c);
}

/**
 * El cierre previsto de la ronda (se calcula una vez, al aprobarse el plan): la misma cuenta de la fecha mínima desde el
 * mayor fin planeado de las actividades, el plazo de evaluar (con el de reporte del indicador, si lo hay) y el de cerrar.
 */
export function cierrePrevisto(
  x: { clase: Clase; finPlaneado: string; fechaEvaluacion: string | null; periodicidad: Periodicidad | null; plazoReporteDias: number | null },
  c: Contexto,
): Date {
  const minima = fechaMinimaDeEficacia({ clase: x.clase, r: x.finPlaneado, fechaEvaluacion: x.fechaEvaluacion, periodicidad: x.periodicidad }, c.zona);
  return sumarDiasHabiles(venceLaEvaluacion(minima, x.plazoReporteDias, c), c.config.plazos.decision, c.calendario, c.zona);
}

const LeidoCriterios = z.array(z.enum(CRITERIOS_EFICACIA));

/** Lo guardado en `mejora_rondas.criterios`, sin confiar en su forma: una lista que no se puede leer es «sin criterio». */
export function leerCriterios(crudo: unknown): CriterioEficacia[] {
  const leido = LeidoCriterios.safeParse(crudo);
  return leido.success ? CRITERIOS_EFICACIA.filter((x) => leido.data.includes(x)) : [];
}
