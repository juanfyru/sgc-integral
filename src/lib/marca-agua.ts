import { PDFDocument, StandardFonts, radians, rgb, type PDFFont } from "pdf-lib";
import { textoParaFuente } from "@/lib/texto-pdf";

/**
 * Estampa "COPIA NO CONTROLADA" + nombre de quien descarga y fecha en diagonal
 * sobre CADA página del PDF (ISO 9001 — 7.5.3: la copia que sale del sistema
 * deja de estar controlada). Lanza si el buffer no es un PDF procesable
 * (corrupto o cifrado): el llamador decide el fallback — la marca es una
 * salvaguarda, nunca un motivo para dejar inaccesible un documento vigente.
 */

const MARCA = "COPIA NO CONTROLADA";
const LARGO_MAX_NOMBRE = 60;
const GRIS = rgb(0.45, 0.45, 0.45);

function fechaCorta(fecha: Date, zona: string): string {
  const partes = new Intl.DateTimeFormat("es-CO", {
    timeZone: zona,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(fecha);
  const de = (tipo: Intl.DateTimeFormatPartTypes) => partes.find((p) => p.type === tipo)?.value ?? "";
  return `${de("day")}/${de("month")}/${de("year")}`;
}

// Por puntos de código, no por unidades UTF-16: así el recorte no parte un carácter en dos.
function nombreEstampable(nombre: string, fuente: PDFFont): string {
  return textoParaFuente(Array.from(nombre.normalize("NFC")).slice(0, LARGO_MAX_NOMBRE).join(""), fuente);
}

export async function estamparCopiaNoControlada(
  pdf: Uint8Array,
  datos: { fecha: Date; nombre: string; zona: string },
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdf);
  const fuente = await doc.embedFont(StandardFonts.HelveticaBold);
  const nombre = nombreEstampable(datos.nombre, fuente);
  const leyenda = `Descargada por ${nombre} el ${fechaCorta(datos.fecha, datos.zona)} — verifique su vigencia en el SGC`;

  for (const pagina of doc.getPages()) {
    const { width: ancho, height: alto } = pagina.getSize();
    const angulo = Math.atan2(alto, ancho);
    const [cos, sen] = [Math.cos(angulo), Math.sin(angulo)];

    // La marca ocupa ~60% de la diagonal de la página, sea cual sea su tamaño;
    // la leyenda se encoge si el nombre la alargaría más allá del ~85%.
    const diagonal = Math.hypot(ancho, alto);
    const tam = (diagonal * 0.6) / fuente.widthOfTextAtSize(MARCA, 1);
    const tamLeyenda = Math.min(tam * 0.28, (diagonal * 0.85) / fuente.widthOfTextAtSize(leyenda, 1));

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
