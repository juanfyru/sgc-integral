/**
 * Periodos de los indicadores (Fase 14, spec §8.1): reglas puras sobre las claves `AAAA-MM`, `AAAA-B1..B6`,
 * `AAAA-T1..T4`, `AAAA-S1..S2` y `AAAA`. La zona horaria es siempre un parámetro. Sin Node ni BD: lo importan
 * componentes de cliente.
 */
import { dos, periodoDe, type Periodo } from "@/lib/indicadores-documentales/periodo";
import { fechaEnZona, fechaLimite } from "@/lib/tramites/plazos";
import type { Periodicidad } from "./tipos";

/** Meses que abarca cada periodicidad. */
const MESES: Record<Periodicidad, number> = { mensual: 1, bimestral: 2, trimestral: 3, semestral: 6, anual: 12 };
const PREFIJO: Record<Periodicidad, string> = { mensual: "", bimestral: "B", trimestral: "T", semestral: "S", anual: "" };

type Partes = { periodicidad: Periodicidad; anio: number; indice: number };

/** Descompone una clave válida; `null` si la clave no existe. */
function partes(clave: string): Partes | null {
  const m = /^(\d{4})(?:-(?:(\d{2})|([BTS])(\d)))?$/.exec(clave);
  if (!m) return null;
  const anio = Number(m[1]);
  if (m[2] !== undefined) {
    const mes = Number(m[2]);
    return mes >= 1 && mes <= 12 ? { periodicidad: "mensual", anio, indice: mes } : null;
  }
  if (m[3] === undefined) return { periodicidad: "anual", anio, indice: 1 };
  const indice = Number(m[4]);
  const periodicidad: Periodicidad = m[3] === "B" ? "bimestral" : m[3] === "T" ? "trimestral" : "semestral";
  const cuantos = 12 / MESES[periodicidad];
  return indice >= 1 && indice <= cuantos ? { periodicidad, anio, indice } : null;
}

function claveDe(p: Periodicidad, anio: number, indice: number): string {
  if (p === "anual") return String(anio);
  return p === "mensual" ? `${anio}-${dos(indice)}` : `${anio}-${PREFIJO[p]}${indice}`;
}

export function periodicidadDe(clave: string): Periodicidad | null {
  return partes(clave)?.periodicidad ?? null;
}

/** El periodo de esa periodicidad al que pertenece el instante, según el calendario de la zona. */
export function periodoQueContiene(p: Periodicidad, instante: Date, zona: string): Periodo {
  const [anio, mes] = fechaEnZona(instante, zona).split("-").map(Number);
  const indice = p === "anual" ? 1 : Math.ceil(mes / MESES[p]);
  return periodoDe(claveDe(p, anio, indice), zona)!;
}

function siguiente(clave: string): string {
  const x = partes(clave)!;
  const cuantos = 12 / MESES[x.periodicidad];
  return x.indice === cuantos ? claveDe(x.periodicidad, x.anio + 1, 1) : claveDe(x.periodicidad, x.anio, x.indice + 1);
}

export function anterior(clave: string): string {
  const x = partes(clave)!;
  const cuantos = 12 / MESES[x.periodicidad];
  return x.indice === 1 ? claveDe(x.periodicidad, x.anio - 1, cuantos) : claveDe(x.periodicidad, x.anio, x.indice - 1);
}

export function mismoDelAnioAnterior(clave: string): string {
  const x = partes(clave)!;
  return claveDe(x.periodicidad, x.anio - 1, x.indice);
}

export function clavesDelAnio(p: Periodicidad, anio: number): string[] {
  return Array.from({ length: 12 / MESES[p] }, (_, i) => claveDe(p, anio, i + 1));
}

/** Los periodos de la periodicidad desde `desdeClave` (incluida) hasta el último que terminó antes de `ahora`. */
export function periodosTerminados(p: Periodicidad, desdeClave: string, ahora: Date, zona: string): Periodo[] {
  if (periodicidadDe(desdeClave) !== p) return [];
  const terminados: Periodo[] = [];
  for (let clave = desdeClave; terminados.length < 1000; clave = siguiente(clave)) {
    const periodo = periodoDe(clave, zona);
    if (!periodo || periodo.hasta.getTime() >= ahora.getTime()) break;
    terminados.push(periodo);
  }
  return terminados;
}

/** Primer y último mes (1 a 12) que abarca el periodo. */
export function mesesDe(clave: string): [number, number] {
  const x = partes(clave)!;
  const largo = MESES[x.periodicidad];
  const primero = x.periodicidad === "mensual" ? x.indice : (x.indice - 1) * largo + 1;
  return [primero, primero + largo - 1];
}

/** Fin del día, en la zona, del último día del periodo más el plazo de reporte (días calendario). */
export function fechaLimiteDeReporte(periodo: Periodo, plazoDias: number, zona: string): Date {
  return fechaLimite(periodo.hasta, plazoDias, zona);
}

/** ¿Cada periodo de `mayor` se forma con periodos enteros de `menor`? */
export function contiene(mayor: Periodicidad, menor: Periodicidad): boolean {
  return MESES[mayor] >= MESES[menor] && MESES[mayor] % MESES[menor] === 0;
}
