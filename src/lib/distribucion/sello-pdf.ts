import QRCode from "qrcode";
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import { textoParaFuente } from "@/lib/texto-pdf";

const PT_POR_CM = 72 / 2.54;
const TAMANO_MAX = 9;
const TAMANO_MIN = 6;
const MARGEN_CM = 0.4;
const FONDO_QR_CM = 0.15;
const ELIPSIS = "…";

export type DatosSello = {
  titulo: string;
  detalle: string;
  qr: string | null;
  colorHex: string;
  franjaCm: number;
  qrCm: number;
};

export async function imagenQr(url: string): Promise<Uint8Array> {
  const png = await QRCode.toBuffer(url, { type: "png", margin: 1, errorCorrectionLevel: "M", scale: 6 });
  return new Uint8Array(png);
}

function colorDe(hex: string) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (!m) throw new Error(`Color inválido: ${hex}`);
  return rgb(parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255);
}

/** El texto que cabe en `ancho` a `tamano`; si no cabe entero, termina en «…». Por puntos de código. */
function recortar(texto: string, fuente: PDFFont, tamano: number, ancho: number): string {
  if (fuente.widthOfTextAtSize(texto, tamano) <= ancho) return texto;
  const letras = Array.from(texto);
  while (letras.length > 0) {
    letras.pop();
    const candidato = `${letras.join("").trimEnd()}${ELIPSIS}`;
    if (fuente.widthOfTextAtSize(candidato, tamano) <= ancho) return candidato;
  }
  return ELIPSIS;
}

/**
 * Sello de copia controlada (ISO 9001 — 7.5.3) en cada página: franja de color pegada al borde inferior
 * con el título y el detalle en blanco, y, si hay dirección pública, el QR que lleva al documento vigente.
 * Lanza si el PDF no se puede abrir (cifrado o dañado): una copia controlada sin sello no se entrega.
 */
export async function estamparCopiaControlada(pdf: Uint8Array, d: DatosSello): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdf);
  const negrita = await doc.embedFont(StandardFonts.HelveticaBold);
  const normal = await doc.embedFont(StandardFonts.Helvetica);
  const color = colorDe(d.colorHex);
  const titulo = textoParaFuente(d.titulo, negrita);
  const detalle = textoParaFuente(d.detalle, normal);
  const qr = d.qr === null ? null : await doc.embedPng(await imagenQr(d.qr));

  const alto = d.franjaCm * PT_POR_CM;
  const margen = MARGEN_CM * PT_POR_CM;
  const lado = d.qrCm * PT_POR_CM;
  const fondo = FONDO_QR_CM * PT_POR_CM;
  const reservaQr = qr ? lado + 2 * fondo : 0;

  for (const pagina of doc.getPages()) {
    const { width: ancho } = pagina.getSize();
    pagina.drawRectangle({ x: 0, y: 0, width: ancho, height: alto, color });

    const disponible = Math.max(ancho - 2 * margen - reservaQr, 1);
    let tamano = TAMANO_MAX;
    while (
      tamano > TAMANO_MIN &&
      (negrita.widthOfTextAtSize(titulo, tamano) > disponible || normal.widthOfTextAtSize(detalle, tamano) > disponible)
    ) {
      tamano -= 0.5;
    }
    const lineaTitulo = recortar(titulo, negrita, tamano, disponible);
    const lineaDetalle = recortar(detalle, normal, tamano, disponible);

    // Dos líneas centradas en la franja.
    const interlinea = tamano * 1.25;
    const base = alto / 2 - interlinea / 2 - tamano * 0.3;
    pagina.drawText(lineaTitulo, { x: margen, y: base + interlinea, size: tamano, font: negrita, color: rgb(1, 1, 1) });
    pagina.drawText(lineaDetalle, { x: margen, y: base, size: tamano, font: normal, color: rgb(1, 1, 1) });

    if (qr) {
      const lado2 = lado + 2 * fondo;
      pagina.drawRectangle({ x: ancho - lado2, y: 0, width: lado2, height: lado2, color: rgb(1, 1, 1) });
      pagina.drawImage(qr, { x: ancho - lado2 + fondo, y: fondo, width: lado, height: lado });
    }
  }
  return doc.save();
}
