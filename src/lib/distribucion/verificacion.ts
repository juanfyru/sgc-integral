import { fechaEnZona, fechaLimite } from "@/lib/tramites/plazos";
import { textoDeDia } from "@/lib/vigencia/plazo";
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
  return { porcentaje: porcentajeDeConformidad(conformes, puntos.length), cumple: conformes * 100 >= umbral * puntos.length };
}

/**
 * La cifra de conformidad desde los conteos, la misma en Distribución, los indicadores y el informe anual: se trunca,
 * 18 de 19 es 94 y no 95, así la cifra entera nunca contradice el veredicto (Ruling 59). Nula sin verificaciones.
 */
export function porcentajeDeConformidad(conformes: number, total: number): number | null {
  return total === 0 ? null : Math.floor((conformes * 100) / total);
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

/**
 * Las fechas de corrección del diálogo de cierre que el servidor rechazaría (`cerrarVerificacion`): un día que no existe
 * o fuera del rango de `fechas`, con el texto del ítem en el mensaje para que la persona sepa cuál corregir. Una vacía
 * (borrada a mano) también se pide: sin ella el servidor aplicaría la propuesta sin que nadie la viera. La que no se
 * tocó es la propuesta y siempre vale. El servidor sigue validando.
 */
export function fechasInvalidas(
  items: readonly { id: number; texto: string }[],
  elegidas: Readonly<Record<number, string>>,
  fechas: FechasCorreccion,
): { itemId: number; mensaje: string }[] {
  return items.flatMap((i) => {
    const fecha = elegidas[i.id];
    if (fecha === undefined) return [];
    if (fecha === "") return [{ itemId: i.id, mensaje: `Elija la fecha de corrección de «${i.texto}»` }];
    if (!esDiaReal(fecha)) return [{ itemId: i.id, mensaje: `Elija una fecha de corrección válida para «${i.texto}»` }];
    if (fecha < fechas.minima || fecha > fechas.maxima) {
      const rango = `entre mañana (${textoDeDia(fechas.minima)}) y el ${textoDeDia(fechas.maxima)}`;
      return [{ itemId: i.id, mensaje: `La fecha de corrección de «${i.texto}» debe estar ${rango}` }];
    }
    return [];
  });
}

/** Lo que el bloqueo del cierre necesita de un campo de fecha: la validación del navegador. */
export type CampoConValidez = { setCustomValidity(mensaje: string): void; reportValidity(): boolean };

/**
 * Antes de enviar el cierre: deja en cada campo su mensaje (vacío si vale) y pide al navegador que muestre el de la
 * primera inválida, que además recibe el foco. Devuelve si alguna lo es: entonces el botón no envía. Los campos están
 * en el diálogo, fuera del formulario: la validación del formulario no los ve.
 */
export function avisarFechasInvalidas(
  itemIds: readonly number[],
  invalidas: readonly { itemId: number; mensaje: string }[],
  campo: (itemId: number) => CampoConValidez | null,
): boolean {
  const mensajes = new Map(invalidas.map((f) => [f.itemId, f.mensaje]));
  for (const id of itemIds) campo(id)?.setCustomValidity(mensajes.get(id) ?? "");
  const primera = invalidas[0];
  if (!primera) return false;
  campo(primera.itemId)?.reportValidity();
  return true;
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
