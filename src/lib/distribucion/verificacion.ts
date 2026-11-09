import { fechaEnZona, fechaLimite } from "@/lib/tramites/plazos";
import { numeroDeCopia } from "./copias";
import type { RespuestaItem } from "./tipos";

export const ITEMS_FIJOS = [
  "Sin documentos obsoletos a la vista",
  "Sin copias no controladas (impresiones sin sello)",
  "El personal sabe consultar la plataforma",
] as const;

export type CopiaParaLista = {
  id: number;
  codigo: string;
  version: number;
  numero: number;
  estado: "emitida" | "recibida" | "por_recoger";
};

export type FilaListaChequeo = {
  origen: "copia" | "copia_por_recoger" | "fijo";
  copiaId: number | null;
  texto: string;
};

export function armarListaDeChequeo(copias: CopiaParaLista[]): FilaListaChequeo[] {
  const orden = (a: CopiaParaLista, b: CopiaParaLista) =>
    a.codigo.localeCompare(b.codigo) || a.version - b.version || a.numero - b.numero;
  const ordenadas = [...copias].sort(orden);
  const vivas = ordenadas.filter((c) => c.estado !== "por_recoger");
  const porRecoger = ordenadas.filter((c) => c.estado === "por_recoger");
  const nombre = (c: CopiaParaLista) => `${c.codigo} v${c.version} · Copia N.º ${numeroDeCopia(c.numero)}`;
  const filas: FilaListaChequeo[] = [];
  for (const c of vivas) {
    for (const pregunta of ["está", "legible", "es la versión vigente"]) {
      filas.push({ origen: "copia", copiaId: c.id, texto: `${nombre(c)}: ${pregunta}` });
    }
  }
  for (const c of porRecoger) {
    filas.push({ origen: "copia_por_recoger", copiaId: c.id, texto: `${nombre(c)} (obsoleta): ya no está` });
  }
  for (const texto of ITEMS_FIJOS) filas.push({ origen: "fijo", copiaId: null, texto });
  return filas;
}

export function esConforme(items: { respuesta: RespuestaItem | null }[]): boolean {
  return items.every((i) => i.respuesta !== "no_conforme");
}

export function conformidad(
  puntos: { conforme: boolean }[],
  umbral: number,
): { porcentaje: number | null; cumple: boolean | null } {
  if (puntos.length === 0) return { porcentaje: null, cumple: null };
  const conformes = puntos.filter((p) => p.conforme).length;
  // En enteros: 29 de 50 en coma flotante da 57,99999999999999 y quedaría por debajo de un umbral de 58.
  // El porcentaje se trunca: 18 de 19 es 94 y no 95, así la cifra entera nunca contradice el veredicto (Ruling 59).
  return { porcentaje: Math.floor((conformes * 100) / puntos.length), cumple: conformes * 100 >= umbral * puntos.length };
}

/** Hasta cuándo puede fijarse la corrección de un hallazgo, en días desde el cierre. */
export const MAXIMO_DIAS_CORRECCION = 365;

/**
 * La fecha de corrección que se propone al cerrar (hoy + `plazo_correccion_dias`) y el rango en que el verificador puede
 * cambiarla (de mañana a hoy + 365), como días `AAAA-MM-DD` de la zona de la instalación (spec 13C §12.2).
 */
export type FechasCorreccion = { propuesta: string; minima: string; maxima: string };

export function fechasDeCorreccion(ahora: Date, plazoDias: number, zona: string): FechasCorreccion {
  return {
    propuesta: fechaEnZona(fechaLimite(ahora, plazoDias, zona), zona),
    minima: fechaEnZona(fechaLimite(ahora, 1, zona), zona),
    maxima: fechaEnZona(fechaLimite(ahora, MAXIMO_DIAS_CORRECCION, zona), zona),
  };
}

/**
 * Las fechas de corrección que viajan con el cierre: solo las de un ítem no conforme que la persona cambió (distintas de
 * la propuesta pintada). Sin fecha, el servidor aplica su propia propuesta: una página abierta pasada la medianoche no
 * anota como ajustada, ni rechaza, una fecha que nadie tocó.
 */
export function fechasQueViajan(
  noConformes: number[],
  elegidas: Readonly<Record<number, string>>,
  propuesta: string,
): { itemId: number; fecha: string }[] {
  return noConformes.flatMap((itemId) => {
    const fecha = elegidas[itemId];
    return fecha && fecha !== propuesta ? [{ itemId, fecha }] : [];
  });
}

/** Un día real del calendario en `AAAA-MM-DD` (el 30 de febrero no lo es). */
export function esDiaReal(fecha: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return false;
  const d = new Date(`${fecha}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === fecha;
}

export function verificacionVencida(ultimaCerrada: Date | null, cadaDias: number, ahora: Date): boolean {
  if (!ultimaCerrada) return true;
  return ahora.getTime() - ultimaCerrada.getTime() >= cadaDias * 86_400_000;
}

/** El resumen que muestra la lista mientras se llena y el cierre: los «no aplica» no cuentan en el total. */
export function resumenDeChequeo(items: { respuesta: RespuestaItem | null }[]): {
  conformes: number;
  total: number;
  sinResponder: number;
  conforme: boolean;
} {
  return {
    conformes: items.filter((i) => i.respuesta === "conforme").length,
    total: items.filter((i) => i.respuesta !== "no_aplica").length,
    sinResponder: items.filter((i) => i.respuesta === null).length,
    conforme: esConforme(items),
  };
}
