import { fechaEnZona, finDeFecha } from "@/lib/tramites/plazos";

const MS_DIA = 86_400_000;

export type OrigenVigencia = "plataforma" | "fuera" | "externo";

export type BaseDeRevision = {
  origen: OrigenVigencia;
  publicadoEn: Date | null;
  fechaAprobacion: string | null;
  ultimaRatificacion: Date | null;
  ultimaVerificacion: Date | null;
};

/**
 * Desde cuándo corre el plazo de revisión. Lo aprobado fuera de la plataforma cuenta desde su
 * fecha de aprobación, nunca desde `publicadoEn` (la carga directa lo escribe con la fecha de
 * carga). Un externo cuenta desde su última verificación o su adopción.
 */
export function fechaBase(b: BaseDeRevision, zona: string): Date | null {
  if (b.origen === "externo") return b.ultimaVerificacion ?? b.publicadoEn;
  const inicial = b.origen === "fuera" ? (b.fechaAprobacion ? finDeFecha(b.fechaAprobacion, zona) : null) : b.publicadoEn;
  if (!b.ultimaRatificacion) return inicial;
  if (!inicial) return b.ultimaRatificacion;
  return b.ultimaRatificacion.getTime() > inicial.getTime() ? b.ultimaRatificacion : inicial;
}

function isoFecha(anio: number, mes: number, dia: number): string {
  return `${String(anio).padStart(4, "0")}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/** Suma meses calendario en la zona y devuelve el fin de ese día (recorta al último día del mes). */
export function sumarMeses(fecha: Date, meses: number, zona: string): Date {
  const [anio, mes, dia] = fechaEnZona(fecha, zona).split("-").map(Number);
  const indice = anio * 12 + (mes - 1) + meses;
  const anioFinal = Math.floor(indice / 12);
  const mesFinal = (indice % 12) + 1;
  const ultimoDia = new Date(Date.UTC(anioFinal, mesFinal, 0)).getUTCDate();
  return finDeFecha(isoFecha(anioFinal, mesFinal, Math.min(dia, ultimoDia)), zona);
}

export function proximaRevision(d: { base: Date | null; meses: number; fijada: string | null }, zona: string): Date | null {
  if (d.fijada) return finDeFecha(d.fijada, zona);
  return d.base ? sumarMeses(d.base, d.meses, zona) : null;
}

/** Rango permitido para fijar a mano la próxima revisión: de mañana al plazo del documento. */
export function limitesDeFechaFijada(d: { meses: number }, hoy: Date, zona: string): { minima: string; maxima: string } {
  const manana = new Date(Date.parse(`${fechaEnZona(hoy, zona)}T00:00:00Z`) + MS_DIA).toISOString().slice(0, 10);
  return { minima: manana, maxima: fechaEnZona(sumarMeses(hoy, d.meses, zona), zona) };
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** «14 ago 2026» de una fecha `yyyy-mm-dd`, tal cual: un día del calendario no depende de la zona. */
export function textoDeDia(fecha: string): string {
  const [anio, mes, dia] = fecha.split("-").map(Number);
  return `${dia} ${MESES[mes - 1]} ${anio}`;
}

/** «14 ago 2026»: un instante leído en la zona o una fecha `yyyy-mm-dd` tal cual. */
export function textoFecha(fecha: Date | string, zona: string): string {
  return textoDeDia(typeof fecha === "string" ? fecha : fechaEnZona(fecha, zona));
}
