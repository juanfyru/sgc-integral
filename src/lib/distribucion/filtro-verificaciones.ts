import type { FiltroHistorial } from "@/db/consultas/distribucion/verificaciones-resumen";
import { periodoDeAcuses } from "./periodo-acuses";

/** El filtro de la pestaña y del Excel: punto, fechas (por defecto el año en curso) y resultado. */
export function filtroDeVerificaciones(
  q: { punto?: string | null; desde?: string | null; hasta?: string | null; resultado?: string | null },
  ahora: Date = new Date(),
): { filtro: FiltroHistorial; desdeTexto: string; hastaTexto: string } {
  const periodo = periodoDeAcuses({ desde: q.desde, hasta: q.hasta }, ahora);
  const punto = q.punto && /^\d{1,15}$/.test(q.punto) ? Number(q.punto) : undefined;
  const resultado = q.resultado === "conforme" || q.resultado === "no_conforme" ? q.resultado : undefined;
  return {
    filtro: { puntoId: punto, desde: periodo.desde, hasta: periodo.hasta, resultado },
    desdeTexto: periodo.desdeTexto,
    hastaTexto: periodo.hastaTexto,
  };
}
