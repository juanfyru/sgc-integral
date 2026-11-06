/**
 * Comprobación del PDF que la entidad elige como formato del acta (spec 13A §4.4). El acta se dibuja
 * sobre su única página; un PDF dañado, protegido con clave, de varias páginas o de otro tamaño no sirve.
 */
import { PDFDocument } from "pdf-lib";

/** Un PDF de Word tamaño carta mide 612,1 por 792,1 puntos: se acepta hasta esta diferencia. */
export const TOLERANCIA_CARTA_PT = 3;

const ANCHO_CARTA = 612;
const ALTO_CARTA = 792;

/** `null` si el PDF sirve como fondo del acta; si no, el motivo en una frase para quien lo eligió. */
export async function motivoMembreteNoUtilizable(bytes: Uint8Array): Promise<string | null> {
  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(bytes);
    // Una página sin contenido tampoco se puede incrustar como fondo.
    await (await PDFDocument.create()).embedPdf(doc, [0]);
  } catch {
    return "El archivo del formato no se puede leer";
  }
  if (doc.getPageCount() !== 1) return "El formato debe tener una sola página";
  const { width, height } = doc.getPage(0).getSize();
  if (Math.abs(width - ANCHO_CARTA) > TOLERANCIA_CARTA_PT || Math.abs(height - ALTO_CARTA) > TOLERANCIA_CARTA_PT) {
    return "El formato debe ser tamaño carta";
  }
  return null;
}
