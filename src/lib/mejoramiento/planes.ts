/**
 * El plan de mejoramiento (Fase 15B, anexo §3): su código, su estado y su avance, que se calculan al leer (F15B-DC8), el plazo
 * de una actividad en el Excel del ente (§4.3) y los mensajes del dominio. Puro: sin base, lo importan los componentes.
 */
import type { EstadoHallazgo } from "./tipos";

/** La entidad de bitácora de un plan: cada fila lleva el id del plan. */
export const ENTIDAD_PLAN = "mejora_plan";

export const PLAN_NO_EXISTE = "El plan no existe";
export const PLAN_ANULADO = "El plan está anulado";
export const PLAN_CON_HALLAZGOS = "Saque primero los hallazgos del plan";
export const YA_EN_UN_PLAN = "El hallazgo ya está en un plan";
export const NO_CUENTA_PARA_PLAN = "Un hallazgo anulado o rechazado no se añade a un plan";
export const MOTIVO_CORTO = "Escriba el motivo (al menos 10 caracteres)";
export const OBJETIVO_INACTIVO = "El objetivo ya no está activo";
/** Sacar o cambiar de plan un hallazgo que no está en ninguno. */
export const NO_ESTA_EN_UN_PLAN = "El hallazgo no está en un plan";
/** El origen «Ente de control» lleva su fecha límite (spec 15 §13.4). */
export const FALTA_LA_FECHA_DEL_ENTE = "Escriba la fecha límite del ente";
export const SIN_CAMBIOS_EN_EL_PLAN = "No cambió ningún dato del plan";

/** Los estados de un hallazgo que no cuentan para un plan: no entran y, si se quedan en él, dejan de contar (F15B-DC6). */
export const NO_CUENTAN_PARA_PLAN: readonly EstadoHallazgo[] = ["rechazado", "anulado"];

/** Si un hallazgo en ese estado cuenta para un plan; acepta el texto tal como lo trae una lectura. */
export const cuentaParaElPlan = (estado: string) => !(NO_CUENTAN_PARA_PLAN as readonly string[]).includes(estado);

/** `PM-AAAA-NN`: la vigencia y el consecutivo de esa vigencia, de dos cifras como mínimo (el cien es `PM-2026-100`). */
export function codigoDePlan(vigencia: number, n: number): string {
  return "PM-" + vigencia + "-" + String(n).padStart(2, "0");
}

export const PATRON_DE_PLAN = /^PM-\d{4}-\d{2,}$/;

export type EstadoDePlan = "sin_hallazgos" | "abierto" | "cerrado" | "anulado";

export const ETIQUETA_ESTADO_PLAN: Readonly<Record<EstadoDePlan, string>> = {
  sin_hallazgos: "Sin hallazgos",
  abierto: "Abierto",
  cerrado: "Cerrado",
  anulado: "Anulado",
};

/**
 * El estado de un plan (§3.5): «Anulado» manda; sin ningún hallazgo que cuente (los anulados y rechazados no cuentan),
 * «Sin hallazgos»; con alguno sin terminar, «Abierto»; con todos terminados, «Cerrado». `cuentan` y `abiertos` son los de los
 * hallazgos que ve quien mira.
 */
export function estadoDePlan(p: { anulado: boolean; cuentan: number; abiertos: number }): EstadoDePlan {
  if (p.anulado) return "anulado";
  if (p.cuentan === 0) return "sin_hallazgos";
  return p.abiertos > 0 ? "abierto" : "cerrado";
}

/**
 * El avance del plan (§3.5): el promedio simple, redondeado, del avance de sus hallazgos que lo tienen (los que cuentan y
 * tienen plan de acción aprobado en su ronda en curso; los demás llegan nulos). Sin ninguno, nulo («—»).
 */
export function avanceDePlan(avances: ReadonlyArray<number | null>): number | null {
  const con = avances.filter((a): a is number => a !== null);
  if (con.length === 0) return null;
  return Math.round(con.reduce((s, a) => s + a, 0) / con.length);
}

const MS_DIA = 86_400_000;

/** Los días desde 1970-01-01 de un día `AAAA-MM-DD`, sin zona: un día del calendario. */
const diaDe = (fecha: string) => Date.parse(`${fecha}T00:00:00Z`) / MS_DIA;

/**
 * El plazo de una actividad en el Excel del ente (§4.3, F15B-DC11), de dos días `AAAA-MM-DD`: si del inicio al día siguiente de
 * la terminación hay un número exacto de meses calendario, «N meses» («1 mes»); si no, los días calendario contando los dos
 * extremos, «N días» («1 día»). Exacto es caer en el mismo día del mes, sin recortar al último día de un mes más corto: del 31
 * de enero al 27 de febrero son «28 días», no «1 mes» (por eso no usa `sumarMeses`, que recorta).
 */
export function plazoEnTexto(inicio: string, fin: string): string {
  const [anio, mes, dia] = inicio.split("-").map(Number);
  const siguiente = new Date((diaDe(fin) + 1) * MS_DIA);
  const meses = siguiente.getUTCFullYear() * 12 + siguiente.getUTCMonth() - (anio * 12 + (mes - 1));
  if (meses >= 1 && siguiente.getUTCDate() === dia) return meses === 1 ? "1 mes" : `${meses} meses`;
  const dias = diaDe(fin) - diaDe(inicio) + 1;
  return dias === 1 ? "1 día" : `${dias} días`;
}
