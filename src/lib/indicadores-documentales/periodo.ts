import { fechaEnZona, finDeFecha } from "@/lib/tramites/plazos";

export type Periodo = { clave: string; desde: Date; hasta: Date; etiqueta: string };

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const ORDINAL = ["", "primer", "segundo", "tercer", "cuarto"];

const dos = (n: number) => String(n).padStart(2, "0");

/** Periodo del mes `primero` al mes `ultimo` (1-12) del año, del inicio al fin del día en la zona. */
function entre(clave: string, anio: number, primero: number, ultimo: number, etiqueta: string, zona: string): Periodo {
  const diaAnterior = new Date(Date.UTC(anio, primero - 1, 0)).toISOString().slice(0, 10);
  const ultimoDia = new Date(Date.UTC(anio, ultimo, 0)).getUTCDate();
  return {
    clave,
    desde: new Date(finDeFecha(diaAnterior, zona).getTime() + 1),
    hasta: finDeFecha(`${anio}-${dos(ultimo)}-${dos(ultimoDia)}`, zona),
    etiqueta,
  };
}

/** Acepta `AAAA`, `AAAA-MM`, `AAAA-T1..T4` y `AAAA-S1..S2`; cualquier otra cosa es `null`. */
export function periodoDe(clave: string, zona: string): Periodo | null {
  const m = /^(\d{4})(?:-(?:(\d{2})|T([1-4])|S([12])))?$/.exec(clave);
  if (!m) return null;
  const anio = Number(m[1]);
  if (anio < 1900) return null;
  if (m[2] !== undefined) {
    const mes = Number(m[2]);
    if (mes < 1 || mes > 12) return null;
    return entre(clave, anio, mes, mes, `${MESES[mes - 1]} de ${anio}`, zona);
  }
  if (m[3] !== undefined) {
    const t = Number(m[3]);
    return entre(clave, anio, t * 3 - 2, t * 3, `${ORDINAL[t]} trimestre de ${anio}`, zona);
  }
  if (m[4] !== undefined) {
    const s = Number(m[4]);
    return entre(clave, anio, s * 6 - 5, s * 6, `${ORDINAL[s]} semestre de ${anio}`, zona);
  }
  return entre(clave, anio, 1, 12, String(anio), zona);
}

/** El año en curso. */
export function periodoActual(ahora: Date, zona: string): Periodo {
  return periodoDe(fechaEnZona(ahora, zona).slice(0, 4), zona)!;
}
