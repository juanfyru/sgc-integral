/**
 * Lo que el formulario de la importación manda al servidor (spec 14A §5.3), armado a partir de su estado: puro, para
 * probarlo junto con `juntarImportacion` y `EsquemaImportarLote` (ida y vuelta) sin montar la pantalla.
 */
import type { FilaRevisada } from "./revisar";

/** La clave de una correspondencia: el texto sin acentos, en minúsculas y con espacios simples (como `normalizar`). */
export function claveDeCorrespondencia(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Una fila entra a la importación si tiene ficha, ningún problema y ninguna correspondencia pendiente. */
export function esImportable(f: Pick<FilaRevisada, "ficha" | "problemas" | "pendientes">): boolean {
  return f.ficha !== null && f.problemas.length === 0 && f.pendientes.length === 0;
}

/**
 * Una lista de códigos como viaja en un campo del formulario: separada por comas o espacios, sin importar si el envío
 * (multipart) cambió un salto de línea por otro. Sin vacíos, en minúsculas y ordenada: dos listas con los mismos
 * códigos dan el mismo resultado (Ruling 40). La usan el cliente y el servidor.
 */
export function listaDeCodigos(texto: string): string[] {
  return texto
    .split(/[\s,]+/)
    .filter((c) => c !== "")
    .map((c) => c.toLowerCase())
    .sort();
}

/** Los códigos de las filas importables de la vista, separados por comas (los códigos no llevan comas ni espacios). */
export function codigosDeLaVista(filas: readonly Pick<FilaRevisada, "ficha" | "problemas" | "pendientes">[]): string {
  return listaDeCodigos(
    filas
      .filter(esImportable)
      .map((f) => f.ficha!.codigo)
      .join(","),
  ).join(",");
}

export type EstadoDeLaVista = {
  loteId: number;
  pctAscendente: string;
  pctDescendente: string;
  /** Por `<tipo>:<clave>`, lo elegido en cada correspondencia (vacío: sin elegir). */
  elegidas: Record<string, { valor: string }>;
};

export type EstadoDeLaImportacion = EstadoDeLaVista & {
  documento: string;
  aprobadoPor: string;
  fecha: string;
  /** Por id de subproceso, la sigla que se le da. */
  siglas: Record<number, string>;
  codigos: string;
};

/** Los campos de «Actualizar la vista previa». */
export function camposDeLaVista(e: EstadoDeLaVista): Record<string, string> {
  const campos: Record<string, string> = { id: String(e.loteId), pctAscendente: e.pctAscendente, pctDescendente: e.pctDescendente };
  for (const [k, v] of Object.entries(e.elegidas)) if (v.valor.trim() !== "") campos[`corr:${k}`] = v.valor;
  return campos;
}

/** Los campos de «Importar» (sin la clave, que pone el diálogo). */
export function camposDeLaImportacion(e: EstadoDeLaImportacion): Record<string, string> {
  const campos: Record<string, string> = {
    ...camposDeLaVista(e),
    documento: e.documento,
    aprobadoPor: e.aprobadoPor,
    fecha: e.fecha,
    codigos: e.codigos,
  };
  for (const [subprocesoId, sigla] of Object.entries(e.siglas)) campos[`sigla:${subprocesoId}`] = sigla;
  return campos;
}
