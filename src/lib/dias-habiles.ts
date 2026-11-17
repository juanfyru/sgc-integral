import { fechaEnZona, finDeFecha } from "./tramites/plazos";

/** Fechas `AAAA-MM-DD` que la entidad ajusta sobre el calendario calculado. */
export type AjustesDeCalendario = {
  noHabiles: ReadonlySet<string>;
  habiles: ReadonlySet<string>;
};

export const SIN_AJUSTES: AjustesDeCalendario = {
  noHabiles: new Set<string>(),
  habiles: new Set<string>(),
};

const MS_DIA = 86_400_000;

const aMs = (fecha: string): number => Date.parse(`${fecha}T00:00:00Z`);
const deMs = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
const sumarDias = (fecha: string, dias: number): string => deMs(aMs(fecha) + dias * MS_DIA);
const diaDeSemana = (fecha: string): number => new Date(aMs(fecha)).getUTCDay();

function fecha(anio: number, mes: number, dia: number): string {
  return deMs(Date.UTC(anio, mes - 1, dia));
}

function alLunesSiguiente(f: string): string {
  const d = diaDeSemana(f);
  return d === 1 ? f : sumarDias(f, (8 - d) % 7);
}

/** Domingo de Pascua gregoriano (algoritmo anónimo de Meeus). */
function domingoDePascua(anio: number): string {
  const a = anio % 19;
  const b = Math.floor(anio / 100);
  const c = anio % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return fecha(anio, mes, dia);
}

export function festivosDeColombia(anio: number): string[] {
  const pascua = domingoDePascua(anio);
  const lista = [
    fecha(anio, 1, 1),
    fecha(anio, 5, 1),
    fecha(anio, 7, 20),
    fecha(anio, 8, 7),
    fecha(anio, 12, 8),
    fecha(anio, 12, 25),
    sumarDias(pascua, -3),
    sumarDias(pascua, -2),
    alLunesSiguiente(fecha(anio, 1, 6)),
    alLunesSiguiente(fecha(anio, 3, 19)),
    alLunesSiguiente(fecha(anio, 6, 29)),
    alLunesSiguiente(fecha(anio, 8, 15)),
    alLunesSiguiente(fecha(anio, 10, 12)),
    alLunesSiguiente(fecha(anio, 11, 1)),
    alLunesSiguiente(fecha(anio, 11, 11)),
    sumarDias(pascua, 43),
    sumarDias(pascua, 64),
    sumarDias(pascua, 71),
  ];
  if (anio >= 2026) lista.push(alLunesSiguiente(fecha(anio, 7, 9)));
  return [...new Set(lista)].sort();
}

const cacheFestivos = new Map<number, ReadonlySet<string>>();

function esFestivo(dia: string): boolean {
  const anio = Number(dia.slice(0, 4));
  let festivos = cacheFestivos.get(anio);
  if (!festivos) {
    festivos = new Set(festivosDeColombia(anio));
    cacheFestivos.set(anio, festivos);
  }
  return festivos.has(dia);
}

export function esHabil(dia: string, ajustes: AjustesDeCalendario): boolean {
  const d = diaDeSemana(dia);
  if (d === 0 || d === 6) return false;
  if (ajustes.noHabiles.has(dia)) return false;
  return !esFestivo(dia) || ajustes.habiles.has(dia);
}

function mover(dia: string, n: number, sentido: 1 | -1, ajustes: AjustesDeCalendario): string {
  let actual = dia;
  let faltan = n;
  while (faltan > 0) {
    actual = sumarDias(actual, sentido);
    if (esHabil(actual, ajustes)) faltan--;
  }
  return actual;
}

/** Fin, en la zona, del n-ésimo día hábil posterior al día de `desde`. */
export function sumarDiasHabiles(
  desde: Date,
  n: number,
  ajustes: AjustesDeCalendario,
  zona: string,
): Date {
  return finDeFecha(mover(fechaEnZona(desde, zona), n, 1, ajustes), zona);
}

export function restarDiasHabiles(dia: string, n: number, ajustes: AjustesDeCalendario): string {
  return mover(dia, n, -1, ajustes);
}

/** Hábiles posteriores al día de `desde` hasta el de `hasta`, incluido; negativo si `hasta` es anterior. */
export function diasHabilesEntre(
  desde: Date,
  hasta: Date,
  ajustes: AjustesDeCalendario,
  zona: string,
): number {
  const a = fechaEnZona(desde, zona);
  const b = fechaEnZona(hasta, zona);
  if (a === b) return 0;
  const [ini, fin, signo] = a < b ? [a, b, 1] : [b, a, -1];
  let cuenta = 0;
  for (let d = sumarDias(ini, 1); d <= fin; d = sumarDias(d, 1)) {
    if (esHabil(d, ajustes)) cuenta++;
  }
  return signo * cuenta;
}
