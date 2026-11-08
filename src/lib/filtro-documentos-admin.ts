/**
 * El filtro de la tabla de Gestión de documentos (pedido del usuario tras la revisión de la Fase 13B): corre en el
 * navegador sobre la lista ya cargada, sin tocar la dirección de la página. Reglas puras, sin React ni BD.
 */

export type DocumentoFiltrable = {
  codigo: string;
  titulo: string;
  tipoNombre: string;
  /** Siglas de los procesos del documento (el propietario y «donde aplica»). */
  procesos: string[];
  /** Los estados que la fila muestra: `vigente`, `borrador`, `obsoleto`, `anulado` o `descartado`. */
  estados: string[];
};

export type FiltroDocumentos = {
  texto: string;
  tipo: string;
  proceso: string;
  estado: string;
};

export const FILTRO_VACIO: FiltroDocumentos = { texto: "", tipo: "", proceso: "", estado: "" };

/** El orden en que se ofrecen los estados: el del ciclo de vida, no el alfabético. */
const ORDEN_ESTADOS = ["vigente", "borrador", "obsoleto", "anulado", "descartado"];

export const ETIQUETA_ESTADO_FILTRO: Record<string, string> = {
  vigente: "Vigente",
  borrador: "Borrador",
  obsoleto: "Obsoleto",
  anulado: "Anulado",
  descartado: "Descartado",
};

/** Minúsculas, sin tildes ni diéresis (la ñ se conserva) y sin espacios en los extremos. */
export function normalizarTexto(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-̂̄-ͯ]/g, "")
    .normalize("NFC")
    .toLowerCase()
    .trim();
}

export function filtrarDocumentos<T extends DocumentoFiltrable>(filas: T[], filtro: FiltroDocumentos): T[] {
  const palabras = normalizarTexto(filtro.texto).split(/\s+/).filter(Boolean);
  return filas.filter((f) => {
    if (filtro.tipo && f.tipoNombre !== filtro.tipo) return false;
    if (filtro.proceso && !f.procesos.includes(filtro.proceso)) return false;
    if (filtro.estado && !f.estados.includes(filtro.estado)) return false;
    if (palabras.length === 0) return true;
    const pajar = normalizarTexto(`${f.codigo} ${f.titulo}`);
    return palabras.every((p) => pajar.includes(p));
  });
}

/** Las opciones de los selectores salen de las filas: solo lo que existe se puede elegir. */
export function opcionesDe(filas: DocumentoFiltrable[]): { tipos: string[]; procesos: string[]; estados: string[] } {
  const ordenar = (valores: Iterable<string>) => [...new Set(valores)].sort((a, b) => a.localeCompare(b, "es"));
  const presentes = new Set(filas.flatMap((f) => f.estados));
  return {
    tipos: ordenar(filas.map((f) => f.tipoNombre)),
    procesos: ordenar(filas.flatMap((f) => f.procesos)),
    estados: ORDEN_ESTADOS.filter((e) => presentes.has(e)),
  };
}
