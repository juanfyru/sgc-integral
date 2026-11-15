/**
 * La foto de un indicador automático (anexo 14B, §5.4): cuándo se toma y cómo se dice. Reglas puras, con la zona como
 * parámetro: las usan la foto (`src/db/consultas/indicadores/fotos.ts`), la tabla del año y la pantalla de reportar.
 */
import { MESES, type Periodo } from "@/lib/indicadores-documentales/periodo";
import { fechaEnZona, fechaLimite } from "@/lib/tramites/plazos";
import { periodoQueContiene } from "./periodos";
import type { Periodicidad } from "./tipos";

type Clase = "estado" | "flujo";

/**
 * Desde cuándo se puede tomar la foto: la de flujo de una medición ordinaria, al vencer su plazo (`venceEn`); la de
 * estado, o la de una histórica de un cálculo que se llena hacia atrás, al terminar el periodo (`hasta`).
 */
export function cuandoSeCalcula(m: { clase: Clase; hasta: Date; venceEn: Date; historica: boolean }): Date {
  return m.clase === "flujo" && !m.historica ? m.venceEn : m.hasta;
}

/**
 * ¿Es el periodo más reciente que terminó a `ahora`? Terminó y el que le sigue, de la misma periodicidad, no. La foto de
 * estado es solo de ese: la de un periodo anterior no es suya (F14B-DC20).
 */
export function esElUltimoTerminado(periodo: Pick<Periodo, "hasta">, periodicidad: Periodicidad, ahora: Date, zona: string): boolean {
  const siguiente = periodoQueContiene(periodicidad, new Date(periodo.hasta.getTime() + 1), zona);
  return periodo.hasta.getTime() < ahora.getTime() && siguiente.hasta.getTime() >= ahora.getTime();
}

/**
 * Cuándo toma el sistema la foto de una medición que aún no la tiene, o `null` si nunca la tomará: una histórica de un
 * cálculo que no se llena hacia atrás, o una de estado cuyo periodo ya no es el más reciente que terminó (queda «Sin
 * dato»). Una sola regla para la foto y para lo que dicen las pantallas.
 */
export function cuandoSeToma(
  calculo: { clase: Clase; reconstruible: boolean },
  m: { hasta: Date; venceEn: Date; historica: boolean; periodicidad: Periodicidad },
  ahora: Date,
  zona: string,
): Date | null {
  if (m.historica && !calculo.reconstruible) return null;
  if (calculo.clase === "estado" && !m.historica && !esElUltimoTerminado(m, m.periodicidad, ahora, zona)) return null;
  return cuandoSeCalcula({ clase: calculo.clase, hasta: m.hasta, venceEn: m.venceEn, historica: m.historica });
}

/**
 * La fecha límite del análisis que pide una foto de flujo, contada desde ella: el plazo de reporte corre una vez para
 * esperar los datos y otra, desde la foto, para analizarlos. Fin del día, en la zona, de la foto más el plazo.
 */
export function fechaLimiteDesdeLaFoto(fotoEn: Date, plazoDias: number, zona: string): Date {
  return fechaLimite(fotoEn, plazoDias, zona);
}

/**
 * ¿La foto mueve la fecha límite? Solo en una medición ordinaria que, con la foto, queda abierta (pide un análisis) y
 * cuando la foto llegó con su plazo ya vencido: la de flujo, siempre (se toma al vencer el plazo); la de estado, si la
 * pasada llegó después de su fecha límite (`venceEn` anterior a `fotoEn`; con plazo 0, siempre), porque la pasada solo
 * corre cuando alguien usa la aplicación. La que cumple la meta o queda «No aplica» queda reportada y conserva su fecha, y
 * la de estado tomada a tiempo también.
 */
export function laFotoMueveElPlazo(m: {
  clase: Clase;
  historica: boolean;
  estadoTrasLaFoto: "abierta" | "reportada" | "cerrada";
  venceEn: Date;
  fotoEn: Date;
}): boolean {
  if (m.historica || m.estadoTrasLaFoto !== "abierta") return false;
  return m.clase === "flujo" || m.venceEn.getTime() < m.fotoEn.getTime();
}

/** «1 de abril», el día en la zona. */
function diaYMes(d: Date, zona: string): string {
  const [, mes, dia] = fechaEnZona(d, zona).split("-").map(Number);
  return `${dia} de ${MESES[mes - 1]}`;
}

/** «7:12 a. m.», «12:05 p. m.», en la zona. Se arma a mano: el formato de Intl cambia de espacios entre versiones. */
function horaEnPalabras(d: Date, zona: string): string {
  const partes = new Intl.DateTimeFormat("es-CO", { timeZone: zona, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d);
  const hora = Number(partes.find((p) => p.type === "hour")?.value ?? "0");
  const minuto = partes.find((p) => p.type === "minute")?.value ?? "00";
  const doce = hora % 12 === 0 ? 12 : hora % 12;
  return `${doce}:${minuto} ${hora < 12 ? "a. m." : "p. m."}`;
}

/** «foto del 1 de abril, 7:12 a. m.»: cuándo tomó el sistema los datos de la medición. */
export function textoDeFoto(fotoEn: Date, zona: string): string {
  return `foto del ${diaYMes(fotoEn, zona)}, ${horaEnPalabras(fotoEn, zona)}`;
}

/** «Se calcula el 10 de abril»: cuándo tomará el sistema los datos de una medición que los espera. */
export function textoDeEspera(cuando: Date, zona: string): string {
  return `Se calcula el ${diaYMes(cuando, zona)}`;
}

/**
 * ¿Se puede volver a calcular? Solo la foto de un cálculo de flujo, mientras la medición no se haya cerrado ni reabierto:
 * el cierre congela la foto y reabrir solo deja cambiar el análisis (§5.4).
 */
export function sePuedeVolverACalcular(m: { clase: Clase | null; fotoEn: Date | null; cerrada: boolean; reabierta: boolean }): boolean {
  return m.clase === "flujo" && m.fotoEn !== null && !m.cerrada && !m.reabierta;
}
