const MS_DIA = 86_400_000;

export type Medicion = { valor: number | null; numerador: number; denominador: number };

/** Porcentaje entero; sin denominador no hay dato (`valor` nulo). */
export function porcentaje(numerador: number, denominador: number): Medicion {
  return { valor: denominador === 0 ? null : Math.round((numerador / denominador) * 100), numerador, denominador };
}

/**
 * Vigentes cuya próxima revisión no ha pasado, sobre los vigentes con fecha; los que no la tienen
 * (`vencida` nulo) no cuentan como cumplidos: no entran y se cuentan aparte.
 */
export function dentroDelPlazo(docs: { vencida: boolean | null }[]): Medicion & { sinDato: number } {
  const conDato = docs.filter((d) => d.vencida !== null);
  return { ...porcentaje(conDato.filter((d) => !d.vencida).length, conDato.length), sinDato: docs.length - conDato.length };
}

export const unDecimal = (n: number) => Math.round(n * 10) / 10;
const promedioDe = (valores: number[]) => unDecimal(valores.reduce((a, b) => a + b, 0) / valores.length);

function medianaDe(valores: number[]): number {
  const orden = [...valores].sort((a, b) => a - b);
  const medio = Math.floor(orden.length / 2);
  return unDecimal(orden.length % 2 === 1 ? orden[medio] : (orden[medio - 1] + orden[medio]) / 2);
}

/** Días entre la aceptación y la publicación (promedio y mediana) y entre la solicitud y la publicación. */
export function tiempoDeAprobacion(
  tramites: { solicitadoEn: Date; aceptadoEn: Date; publicadoEn: Date }[],
): { promedio: number | null; mediana: number | null; desdeSolicitud: number | null; n: number } {
  if (tramites.length === 0) return { promedio: null, mediana: null, desdeSolicitud: null, n: 0 };
  const aceptacion = tramites.map((t) => (t.publicadoEn.getTime() - t.aceptadoEn.getTime()) / MS_DIA);
  const solicitud = tramites.map((t) => (t.publicadoEn.getTime() - t.solicitadoEn.getTime()) / MS_DIA);
  return { promedio: promedioDe(aceptacion), mediana: medianaDe(aceptacion), desdeSolicitud: promedioDe(solicitud), n: tramites.length };
}

/** Etapas cerradas antes de su fecha límite; las que no la guardan no entran y se cuentan aparte. */
export function etapasEnPlazo(eventos: { cerradaEn: Date; venceEn: Date | null }[]): Medicion & { sinDato: number } {
  const conLimite = eventos.filter((e) => e.venceEn !== null);
  const enPlazo = conLimite.filter((e) => e.cerradaEn.getTime() <= e.venceEn!.getTime()).length;
  return { ...porcentaje(enPlazo, conLimite.length), sinDato: eventos.length - conLimite.length };
}

/** `dentro` se calcula solo con los documentos de estado conocido; los que no tienen fecha van en `sinDato`. */
export function vencidosPorProceso(
  docs: { procesoId: number; proceso: string; sigla: string; vencida: boolean | null }[],
): { procesoId: number; proceso: string; sigla: string; vencidos: number; vigentes: number; sinDato: number; dentro: Medicion }[] {
  const porProceso = new Map<number, { procesoId: number; proceso: string; sigla: string; vencidos: number; vigentes: number; sinDato: number }>();
  for (const d of docs) {
    const fila = porProceso.get(d.procesoId) ?? { procesoId: d.procesoId, proceso: d.proceso, sigla: d.sigla, vencidos: 0, vigentes: 0, sinDato: 0 };
    fila.vigentes += 1;
    if (d.vencida === null) fila.sinDato += 1;
    else if (d.vencida) fila.vencidos += 1;
    porProceso.set(d.procesoId, fila);
  }
  return [...porProceso.values()]
    .map((f) => ({ ...f, dentro: porcentaje(f.vigentes - f.sinDato - f.vencidos, f.vigentes - f.sinDato) }))
    .sort((a, b) => b.vencidos - a.vencidos || a.proceso.localeCompare(b.proceso, "es"));
}
