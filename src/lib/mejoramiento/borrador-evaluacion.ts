/**
 * El borrador de la evaluación de la eficacia (spec 15 §11.4; Tarea 17): si al firmar cambió lo que se mostraba
 * (`LO_VISTO_CAMBIO`), la página vuelve con `?visto=cambio` y lo escrito no se pierde. Vive en el almacén de la pestaña
 * (`sessionStorage`), por hallazgo y ronda; se escribe solo al enviar la firma, se toma (y se borra) una sola vez al volver con
 * el aviso, y cualquier otra carga de la página del hallazgo lo borra: lo escrito puede llevar texto sensible y nada del uso
 * interno debe quedar guardado. Puro salvo el almacén que recibe: todo acceso va dentro de try/catch.
 */

/** La forma de `sessionStorage` que se usa (los ayudantes la reciben: así se prueban sin navegador). */
export type AlmacenDeLaPestana = {
  readonly length: number;
  key(indice: number): string | null;
  getItem(clave: string): string | null;
  setItem(clave: string, valor: string): void;
  removeItem(clave: string): void;
};

export type BorradorDeEvaluacion = { justificacion?: string; lecciones?: string; cambiosAtendidos?: string };

const prefijo = (hallazgoId: number) => `mejora-evaluar:${hallazgoId}:`;

/** La clave del borrador de un hallazgo en una ronda. */
export const claveDelBorrador = (hallazgoId: number, ronda: number) => `${prefijo(hallazgoId)}${ronda}`;

/** El almacén de la pestaña, o nulo si no hay (en el servidor) o el navegador no deja usarlo. */
export function almacenDeLaPestana(): AlmacenDeLaPestana | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

/** Escribe el borrador (justo antes de enviar la firma). `false` si no se pudo guardar. */
export function guardarBorrador(almacen: AlmacenDeLaPestana | null, clave: string, borrador: BorradorDeEvaluacion): boolean {
  if (!almacen) return false;
  try {
    almacen.setItem(clave, JSON.stringify(borrador));
    return true;
  } catch {
    return false;
  }
}

const texto = (v: unknown) => (typeof v === "string" ? v : undefined);

/**
 * Toma el borrador y lo borra en el mismo paso: la página que vuelve con el aviso lo recupera una sola vez. `disponible` es
 * `false` si no hay almacén o el navegador no lo deja leer (el aviso lo dice). Lo que no se puede leer es «ninguno».
 */
export function tomarBorrador(
  almacen: AlmacenDeLaPestana | null,
  clave: string,
): { disponible: boolean; borrador: BorradorDeEvaluacion | null } {
  if (!almacen) return { disponible: false, borrador: null };
  let crudo: string | null;
  try {
    crudo = almacen.getItem(clave);
    almacen.removeItem(clave);
  } catch {
    return { disponible: false, borrador: null };
  }
  if (crudo === null) return { disponible: true, borrador: null };
  try {
    const x = JSON.parse(crudo) as unknown;
    if (typeof x !== "object" || x === null) return { disponible: true, borrador: null };
    const o = x as Record<string, unknown>;
    const borrador: BorradorDeEvaluacion = {};
    for (const k of ["justificacion", "lecciones", "cambiosAtendidos"] as const) {
      const v = texto(o[k]);
      if (v !== undefined) borrador[k] = v;
    }
    return { disponible: true, borrador };
  } catch {
    return { disponible: true, borrador: null };
  }
}

/** Borra los borradores de un hallazgo, de todas sus rondas (una carga de su página sin el aviso de cambio). */
export function quitarBorradoresDelHallazgo(almacen: AlmacenDeLaPestana | null, hallazgoId: number): void {
  if (!almacen) return;
  try {
    const suyas: string[] = [];
    for (let i = 0; i < almacen.length; i++) {
      const k = almacen.key(i);
      if (k !== null && k.startsWith(prefijo(hallazgoId))) suyas.push(k);
    }
    for (const k of suyas) almacen.removeItem(k);
  } catch {
    // Sin almacén no hay nada que borrar.
  }
}

/** La dirección sin `visto=cambio` (los demás parámetros y el ancla quedan): recargar no repite el aviso. */
export function sinAvisoDeCambio(direccion: string): string {
  const [antesDelAncla, ...ancla] = direccion.split("#");
  const [ruta, consulta = ""] = antesDelAncla.split("?");
  const quedan = new URLSearchParams(consulta);
  quedan.delete("visto");
  const q = quedan.toString();
  return `${ruta}${q ? `?${q}` : ""}${ancla.length > 0 ? `#${ancla.join("#")}` : ""}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// En el navegador: lo que la pestaña ya tomó, para que el formulario lo lea en cada render sin volver al almacén
// ─────────────────────────────────────────────────────────────────────────────

type Toma = ReturnType<typeof tomarBorrador>;
const tomas = new Map<string, Toma>();

/**
 * La toma vigente del borrador de esa clave (para `useSyncExternalStore`, que la pide en cada render): con el aviso de cambio,
 * la primera vez se toma del almacén (y se borra de él); después, o sin el aviso, la que ya se tomó, o nada.
 */
export function tomaDelBorrador(clave: string, conAviso: boolean): Toma | null {
  const ya = tomas.get(clave);
  if (ya) return ya;
  if (!conAviso) return null;
  const toma = tomarBorrador(almacenDeLaPestana(), clave);
  tomas.set(clave, toma);
  return toma;
}

/** Una carga de la página sin el aviso: el almacén y lo ya tomado de ese hallazgo se olvidan. */
export function olvidarBorradoresDelHallazgo(hallazgoId: number): void {
  quitarBorradoresDelHallazgo(almacenDeLaPestana(), hallazgoId);
  for (const k of [...tomas.keys()]) if (k.startsWith(prefijo(hallazgoId))) tomas.delete(k);
}
