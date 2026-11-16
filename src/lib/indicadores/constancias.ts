/**
 * Las constancias de envío al ente (anexo 14B, §8): «se reporta a un ente» es un estado completo (el ente, la periodicidad
 * externa y el plazo en días, con una periodicidad externa que contiene a la de medición) y lo que se escribe al registrar
 * o corregir una. Funciones puras: sin Node ni BD.
 */
import { contiene } from "./periodos";
import { COMPONENTE_PARCIAL, COMPONENTE_SIN_RESULTADO } from "./resultados";
import type { Periodicidad } from "./tipos";

/** Lo que la ficha dice del ente, como lo guarda la versión (`null`) o lo trae el formulario (`undefined`). */
type EnteDeFicha = {
  ente?: string | null;
  periodicidadExterna?: Periodicidad | null;
  plazoExternoDias?: number | null;
};

const falta = (v: unknown) => v === undefined || v === null || (typeof v === "string" && v.trim() === "");

/** Lo que dice `errorDeEnte` de las periodicidades al revés, y la vista de una ficha antigua que las trae así. */
export const PERIODICIDAD_EXTERNA_NO_CONTIENE = "La periodicidad del ente debe ser la de medición o una que la contenga";

/**
 * Por qué la ficha no se puede guardar con lo que dice del ente, o `null` si vale: sin ente no lleva periodicidad externa
 * ni plazo; con ente, los dos, y la periodicidad externa es la de medición o una que la contiene (un mensual puede
 * reportarse trimestral; nunca al revés). Un plazo de 0 días es un plazo.
 */
export function errorDeEnte(d: EnteDeFicha & { periodicidad: Periodicidad }): string | null {
  if (falta(d.ente)) return falta(d.periodicidadExterna) && falta(d.plazoExternoDias) ? null : "Escriba el ente al que se reporta";
  if (falta(d.periodicidadExterna)) return "Diga con qué periodicidad se reporta al ente";
  if (falta(d.plazoExternoDias)) return "Diga el plazo del ente en días";
  if (!contiene(d.periodicidadExterna!, d.periodicidad)) return PERIODICIDAD_EXTERNA_NO_CONTIENE;
  return null;
}

/** La versión trae los tres datos del ente. Una aprobada antes de la 14B puede no traerlos: esa no genera constancias. */
export function enteCompleto(v: { ente: string | null; periodicidadExterna: string | null; plazoExternoDias: number | null }): boolean {
  return !falta(v.ente) && !falta(v.periodicidadExterna) && !falta(v.plazoExternoDias);
}

/** Lo que una versión dice del ente, como lo leen `enteCompleto` y `seReportaAlEnte`. */
export type EnteDeVersion = { ente: string | null; periodicidadExterna: string | null; plazoExternoDias: number | null; periodicidad: string | null };

/**
 * Lo que dice del ente una fila de `indicador_versiones`, por sus columnas `ente`, `periodicidad_externa`,
 * `plazo_externo_dias` y `periodicidad` (la leen `alPublicarVersion`, `asegurarConstancias` y `enteDeLaFicha`).
 */
export function enteDeVersion(v: Record<string, unknown>): EnteDeVersion {
  return {
    ente: (v.ente as string | null | undefined) ?? null,
    periodicidadExterna: (v.periodicidad_externa as string | null | undefined) ?? null,
    plazoExternoDias: v.plazo_externo_dias === null || v.plazo_externo_dias === undefined ? null : Number(v.plazo_externo_dias),
    periodicidad: (v.periodicidad as string | null | undefined) ?? null,
  };
}

/**
 * La versión genera constancias: el ente completo y una periodicidad externa que contiene a la de medición. Una aprobada
 * antes de la 14B puede tener las dos periodicidades al revés: no genera nada hasta que un cambio lo corrija.
 */
export function seReportaAlEnte(v: EnteDeVersion): boolean {
  return enteCompleto(v) && v.periodicidad !== null && contiene(v.periodicidadExterna as Periodicidad, v.periodicidad as Periodicidad);
}

export const RADICADO_MAXIMO = 100;
export const SIN_RADICADO = "Escriba el radicado o número de constancia";
export const FECHA_FUTURA = "La fecha de envío no puede ser futura";
export const FECHA_INVALIDA = "La fecha de envío no es válida";
export const NOTA_MAXIMA = 1000;
export const JUSTIFICACION_MINIMA_CONSTANCIA = 10;
export const JUSTIFICACION_MAXIMA_CONSTANCIA = 500;

/** «2026-11-14», un día que existe. */
export function esFechaValida(f: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) return false;
  const [anio, mes, dia] = f.split("-").map(Number);
  const d = new Date(Date.UTC(anio, mes - 1, dia));
  return d.getUTCFullYear() === anio && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
}

/** Lo que se escribe al registrar o corregir el envío, ya recortado. */
export type Envio = { fechaEnvio: string; radicado: string; nota: string | null };

/** El envío que se registra o corrige, o el mensaje de lo primero que no vale; `hoy` es el día de hoy en la zona (`AAAA-MM-DD`). */
export function envioValido(d: { fechaEnvio: string; radicado: string; nota?: string | null }, hoy: string): Envio | string {
  const fecha = typeof d.fechaEnvio === "string" ? d.fechaEnvio.trim() : "";
  if (!esFechaValida(fecha)) return FECHA_INVALIDA;
  if (fecha > hoy) return FECHA_FUTURA;
  const radicado = typeof d.radicado === "string" ? d.radicado.trim() : "";
  if (radicado.length === 0 || radicado.length > RADICADO_MAXIMO) return SIN_RADICADO;
  const nota = typeof d.nota === "string" ? d.nota.trim() : "";
  if (nota.length > NOTA_MAXIMA) return `La nota no puede pasar de ${NOTA_MAXIMA} caracteres`;
  return { fechaEnvio: fecha, radicado, nota: nota || null };
}

/** «a», «a y b», «a, b y c». */
function enumerar(partes: readonly string[]): string {
  return partes.length <= 1 ? (partes[0] ?? "") : `${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]}`;
}

/**
 * El aviso de un resultado parcial antes de registrar (anexo §8): qué periodos de medición faltan y cuáles, con su dato, no
 * están cerrados (uno sin dato no se repite como abierto) y, primero, desde qué periodo acumula si la ficha cambió de versión
 * dentro del periodo externo (`desde`, de `resultadoDelPeriodoExterno`), separados por «; ». En un compuesto, sin nombrar al
 * componente (anexo 14C, §6.4): que alguno no cubre todos los periodos (`componenteParcial`) o que alguno no tiene resultado
 * en ellos y no hay acumulado (`sinComponente`). Se puede registrar así.
 */
export function avisoDeParcial(r: {
  faltan: readonly string[];
  sinCerrar: readonly string[];
  desde: string | null;
  componenteParcial?: boolean;
  sinComponente?: boolean;
}): string {
  const abiertos = r.sinCerrar.filter((p) => !r.faltan.includes(p));
  const partes = [
    r.desde ? `solo acumula desde ${r.desde} (la ficha cambió de versión)` : null,
    r.faltan.length > 0 ? `${r.faltan.length === 1 ? "falta" : "faltan"} ${enumerar(r.faltan)}` : null,
    abiertos.length > 0 ? `${abiertos.length === 1 ? "no está cerrado" : "no están cerrados"} ${enumerar(abiertos)}` : null,
    r.componenteParcial ? COMPONENTE_PARCIAL : null,
    r.sinComponente ? COMPONENTE_SIN_RESULTADO : null,
  ].filter((p): p is string => p !== null);
  return `El resultado es parcial: ${partes.join("; ")}. Puede registrarlo así.`;
}

/** La justificación de una corrección, recortada, o el mensaje de por qué no vale. */
export function justificacionValida(j: string): { ok: true; texto: string } | { ok: false; mensaje: string } {
  const t = typeof j === "string" ? j.trim() : "";
  if (t.length < JUSTIFICACION_MINIMA_CONSTANCIA) return { ok: false, mensaje: `La justificación debe tener al menos ${JUSTIFICACION_MINIMA_CONSTANCIA} caracteres` };
  if (t.length > JUSTIFICACION_MAXIMA_CONSTANCIA) return { ok: false, mensaje: `La justificación no puede pasar de ${JUSTIFICACION_MAXIMA_CONSTANCIA} caracteres` };
  return { ok: true, texto: t };
}
