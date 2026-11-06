import type { PDFFont } from "pdf-lib";

const codificablesPorFuente = new WeakMap<PDFFont, ReadonlySet<number>>();

function codificables(fuente: PDFFont): ReadonlySet<number> {
  let conjunto = codificablesPorFuente.get(fuente);
  if (!conjunto) {
    conjunto = new Set(fuente.getCharacterSet());
    codificablesPorFuente.set(fuente, conjunto);
  }
  return conjunto;
}

/** Lo común que las fuentes estándar no traen, escrito con lo que sí traen (R33). */
const TRANSLITERACION: ReadonlyMap<string, string> = new Map([
  ["≥", ">="],
  ["≤", "<="],
  ["≠", "<>"],
  ["→", "->"],
  ["←", "<-"],
  ["✓", "[x]"],
  ["✔", "[x]"],
  ["Ω", "Ohm"],
  ["μ", "µ"],
  ["α", "alfa"],
  ["β", "beta"],
  ["γ", "gamma"],
  ["δ", "delta"],
  ["Δ", "Delta"],
  ["λ", "lambda"],
  ["π", "pi"],
  ["σ", "sigma"],
  ["Σ", "Sigma"],
]);

/** Lo que se dibuja por ese carácter; null si no hay cómo. */
function imprimible(caracter: string, conjunto: ReadonlySet<number>): string | null {
  if (conjunto.has(caracter.codePointAt(0) as number)) return caracter;
  return TRANSLITERACION.get(caracter) ?? null;
}

const caracteres = (texto: string) => Array.from(texto.normalize("NFC"));

/**
 * Texto que la fuente estándar puede dibujar: normalizado a NFC, para que «ñ» escrita como «n» y
 * una marca combinante no salga «?», con lo común transliterado, y con un solo «?» por cada punto
 * de código que aun así no codifica (emoji, cirílico, saltos de línea y tabulaciones incluidos).
 * Quien dibuja líneas parte antes por los saltos de línea.
 */
export function textoParaFuente(texto: string, fuente: PDFFont): string {
  const conjunto = codificables(fuente);
  return caracteres(texto)
    .map((c) => imprimible(c, conjunto) ?? "?")
    .join("");
}

/** Si `textoParaFuente` cambiaría algún carácter por «?». Un «?» escrito por la persona no cuenta. */
export function pierdeCaracteres(texto: string, fuente: PDFFont): boolean {
  const conjunto = codificables(fuente);
  return caracteres(texto).some((c) => imprimible(c, conjunto) === null);
}
