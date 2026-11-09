import { estadoPlazo } from "./plazos";
import { esEtapaDeTrabajo, type Etapa } from "./tipos";

/** Lo que queda en el historial sin mover el trámite de etapa. */
export const EVENTOS_SIN_CAMBIO_DE_ETAPA: readonly string[] = ["reasignar", "corregir_datos"];

/** La entrada a la etapa en curso: el último evento que la cambió (en el orden en que se registraron) o la creación. */
export function entradaDeEtapa(eventos: readonly { tipo: string; creadoEn: Date }[], creadoEn: Date): Date {
  return eventos.filter((e) => !EVENTOS_SIN_CAMBIO_DE_ETAPA.includes(e.tipo)).at(-1)?.creadoEn ?? creadoEn;
}

/**
 * «día 2 de 5» de la etapa en curso: el plazo de la etapa contado desde su entrada y cuánto va de él; pasado el
 * vencimiento sigue contando. `null` si la etapa no es de trabajo o no tiene fecha límite. La usan el
 * encabezado del trámite y el semáforo de vigencia.
 */
export function diaDeEtapa(
  t: { etapa: Etapa; venceEn: Date | null; entrada: Date },
  ahora: Date,
  zona: string,
): { dia: number; total: number } | null {
  if (!t.venceEn || !esEtapaDeTrabajo(t.etapa)) return null;
  const total = Math.max(estadoPlazo(t.venceEn, t.entrada, zona).dias, 1);
  const { estado, dias } = estadoPlazo(t.venceEn, ahora, zona);
  const dia = estado === "a_tiempo" ? total - dias : estado === "vence_hoy" ? total : total + dias;
  return { dia: Math.max(dia, 1), total };
}
