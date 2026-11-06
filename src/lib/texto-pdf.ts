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

/**
 * Texto que la fuente estándar puede dibujar: normalizado a NFC, para que «ñ» escrita como «n» y
 * una marca combinante no salga «?», y con un solo «?» por cada punto de código que la fuente no
 * codifica (emoji, cirílico, saltos de línea y tabulaciones incluidos). Quien dibuja líneas parte
 * antes por los saltos de línea.
 */
export function textoParaFuente(texto: string, fuente: PDFFont): string {
  const conjunto = codificables(fuente);
  return Array.from(texto.normalize("NFC"))
    .map((c) => (conjunto.has(c.codePointAt(0) as number) ? c : "?"))
    .join("");
}
