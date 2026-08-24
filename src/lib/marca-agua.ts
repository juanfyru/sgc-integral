import { PDFDocument, StandardFonts, radians, rgb } from "pdf-lib";

/**
 * Estampa "COPIA NO CONTROLADA" + fecha de descarga en diagonal sobre CADA
 * página del PDF (ISO 9001 — 7.5.3: la copia que sale del sistema deja de
 * estar controlada). Lanza si el buffer no es un PDF procesable (corrupto o
 * cifrado): el llamador decide el fallback — la marca es una salvaguarda,
 * nunca un motivo para dejar inaccesible un documento vigente.
 */

const MARCA = "COPIA NO CONTROLADA";
const GRIS = rgb(0.45, 0.45, 0.45);

function fechaCorta(fecha: Date): string {
  const dia = String(fecha.getDate()).padStart(2, "0");
  const mes = String(fecha.getMonth() + 1).padStart(2, "0");
  return `${dia}/${mes}/${fecha.getFullYear()}`;
}

export async function estamparCopiaNoControlada(
  pdf: Uint8Array,
  fecha: Date,
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdf);
  const fuente = await doc.embedFont(StandardFonts.HelveticaBold);
  const leyenda = `Descargada el ${fechaCorta(fecha)} — verifique su vigencia en el SGC`;

  for (const pagina of doc.getPages()) {
    const { width: ancho, height: alto } = pagina.getSize();
    const angulo = Math.atan2(alto, ancho);
    const [cos, sen] = [Math.cos(angulo), Math.sin(angulo)];

    // La marca ocupa ~60% de la diagonal de la página, sea cual sea su tamaño.
    const tam = (Math.hypot(ancho, alto) * 0.6) / fuente.widthOfTextAtSize(MARCA, 1);
    const tamLeyenda = tam * 0.28;

    // Centrado geométrico del texto rotado: se retrocede desde el centro de la
    // página media longitud a lo largo de la diagonal y medio ojo tipográfico
    // (~0.35 em) en la perpendicular; la leyenda va en una línea paralela por
    // debajo de la marca.
    const trazar = (texto: string, tamano: number, distancia: number, opacidad: number) => {
      const largo = fuente.widthOfTextAtSize(texto, tamano);
      const centroX = ancho / 2 + distancia * sen;
      const centroY = alto / 2 - distancia * cos;
      pagina.drawText(texto, {
        x: centroX - (largo / 2) * cos + 0.35 * tamano * sen,
        y: centroY - (largo / 2) * sen - 0.35 * tamano * cos,
        size: tamano,
        font: fuente,
        color: GRIS,
        opacity: opacidad,
        rotate: radians(angulo),
      });
    };

    trazar(MARCA, tam, 0, 0.22);
    trazar(leyenda, tamLeyenda, tam * 0.75, 0.45);
  }

  return doc.save();
}
