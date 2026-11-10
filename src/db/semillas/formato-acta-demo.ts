/**
 * Los formatos ficticios de la demo, el del acta y el del informe de la revisión anual: encabezado y pie
 * dibujados aquí, con el cuerpo en blanco. No son el formato de ninguna entidad: su nombre llega por
 * parámetro. Con el encabezado hasta 4 cm y el pie desde 3 cm, los márgenes de 4,2 y 3,2 cm que guarda la
 * semilla dejan el cuerpo libre.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

export const CODIGO_FORMATO_ACTA = "SGC-FO-06";
export const CODIGO_FORMATO_INFORME = "SGC-FO-07";

const cm = (x: number) => (x * 72) / 2.54;

const ANCHO = 612;
const ALTO = 792;
const IZQUIERDA = 48;
const DERECHA = ANCHO - IZQUIERDA;
const TECHO = ALTO - cm(1.4);
const BASE_ENCABEZADO = ALTO - cm(3.9);
const COLUMNA_CENTRO = 186;
const COLUMNA_DERECHA = 444;
const INICIO_PIE = cm(2.9);
const TEXTO = rgb(0.1, 0.1, 0.1);
const SUAVE = rgb(0.38, 0.38, 0.38);
const LINEA = rgb(0.45, 0.45, 0.45);

/** Parte el texto en líneas de hasta `ancho`, sin cortar palabras. */
function enLineas(texto: string, fuente: PDFFont, tamano: number, ancho: number): string[] {
  const lineas: string[] = [];
  for (const palabra of texto.split(/\s+/).filter(Boolean)) {
    const conPalabra = lineas.length === 0 ? palabra : `${lineas[lineas.length - 1]} ${palabra}`;
    if (lineas.length > 0 && fuente.widthOfTextAtSize(conPalabra, tamano) <= ancho) lineas[lineas.length - 1] = conPalabra;
    else lineas.push(palabra);
  }
  return lineas;
}

function centrado(pagina: PDFPage, texto: string, y: number, desde: number, hasta: number, font: PDFFont, size: number, color = TEXTO): void {
  const x = desde + (hasta - desde - font.widthOfTextAtSize(texto, size)) / 2;
  pagina.drawText(texto, { x, y, font, size, color });
}

function raya(pagina: PDFPage, x1: number, y1: number, x2: number, y2: number): void {
  pagina.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: 0.8, color: LINEA });
}

/** El membrete de la demo con el título y el código de cada formato; el resto es igual en los dos. */
async function generarMembreteDemo(entidad: string, d: { titulo: string; codigo: string }): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const pagina = doc.addPage([ANCHO, ALTO]);
  const normal = await doc.embedFont(StandardFonts.Helvetica);
  const negrita = await doc.embedFont(StandardFonts.HelveticaBold);

  for (const y of [TECHO, BASE_ENCABEZADO]) raya(pagina, IZQUIERDA, y, DERECHA, y);
  for (const x of [IZQUIERDA, COLUMNA_CENTRO, COLUMNA_DERECHA, DERECHA]) raya(pagina, x, TECHO, x, BASE_ENCABEZADO);
  const mitad = (TECHO + BASE_ENCABEZADO) / 2;

  const nombre = enLineas(entidad, negrita, 9.5, COLUMNA_CENTRO - IZQUIERDA - 16);
  nombre.forEach((linea, i) => {
    centrado(pagina, linea, mitad - 3 + ((nombre.length - 1) / 2 - i) * 12, IZQUIERDA, COLUMNA_CENTRO, negrita, 9.5);
  });
  centrado(pagina, d.titulo, mitad + 3, COLUMNA_CENTRO, COLUMNA_DERECHA, negrita, 12);
  centrado(pagina, "Sistema de Gestión de Calidad", mitad - 13, COLUMNA_CENTRO, COLUMNA_DERECHA, normal, 9, SUAVE);
  centrado(pagina, `Código: ${d.codigo}`, mitad + 3, COLUMNA_DERECHA, DERECHA, normal, 9.5);
  centrado(pagina, "Versión: 1", mitad - 13, COLUMNA_DERECHA, DERECHA, normal, 9.5);

  raya(pagina, IZQUIERDA, INICIO_PIE, DERECHA, INICIO_PIE);
  enLineas(entidad, normal, 8.5, DERECHA - IZQUIERDA).forEach((linea, i) => {
    centrado(pagina, linea, INICIO_PIE - 15 - i * 11, IZQUIERDA, DERECHA, normal, 8.5);
  });
  centrado(pagina, "Formato ficticio de la demostración: no es un documento real.", 30, IZQUIERDA, DERECHA, normal, 8, SUAVE);

  return doc.save();
}

export function generarFormatoActaDemo(entidad: string): Promise<Uint8Array> {
  return generarMembreteDemo(entidad, { titulo: "ACTA DE CONTROL DOCUMENTAL", codigo: CODIGO_FORMATO_ACTA });
}

/** El formato propio del informe de la revisión anual: sin él, el informe saldría sobre el membrete del acta. */
export function generarFormatoInformeDemo(entidad: string): Promise<Uint8Array> {
  return generarMembreteDemo(entidad, { titulo: "INFORME DE REVISIÓN ANUAL", codigo: CODIGO_FORMATO_INFORME });
}
