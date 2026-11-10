/**
 * Lo que comparten los PDF que la aplicación genera sobre el formato de la entidad (el acta y el informe de la
 * revisión anual): la hoja carta, el membrete bajo cada página respetando el espacio de su encabezado y de su pie, el
 * corte de líneas, las fechas y el pie de página. Solo fuentes estándar de `pdf-lib`: nada sale del servidor.
 */
import { StandardFonts, rgb, type PDFDocument, type PDFEmbeddedPage, type PDFFont, type PDFPage } from "pdf-lib";
import { motivoMembreteNoUtilizable } from "@/lib/membrete-acta";
import { textoParaFuente } from "@/lib/texto-pdf";

/** El formato de la entidad sobre el que se dibuja el acta, con el espacio que su encabezado y su pie ocupan. */
export type FormatoActa = {
  archivoId: number;
  hash: string;
  codigo: string;
  version: number;
  margenSuperiorCm: number;
  margenInferiorCm: number;
};

export const cm = (x: number) => (x * 72) / 2.54;

/** Dónde empieza y termina el cuerpo de cada página, y el fondo que se dibuja bajo él. */
export type Geometria = { arriba: number; abajo: number; fondo: PDFEmbeddedPage | null; ejemplo: boolean };

export const ANCHO = 612;
export const ALTO = 792;
export const MARGEN = 48;
export const LIMITE_INFERIOR = 64;
export const ANCHO_UTIL = ANCHO - 2 * MARGEN;
export const ANCHO_ETIQUETA = 104;
export const TEXTO = rgb(0.1, 0.1, 0.1);
export const SUAVE = rgb(0.38, 0.38, 0.38);
export const LINEA = rgb(0.78, 0.78, 0.78);

export function partes(fecha: Date, zona: string): Record<"day" | "month" | "year" | "hour" | "minute", string> {
  const p = new Intl.DateTimeFormat("es-CO", {
    timeZone: zona, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(fecha);
  const de = (t: Intl.DateTimeFormatPartTypes) => p.find((x) => x.type === t)?.value ?? "";
  return { day: de("day"), month: de("month"), year: de("year"), hour: de("hour"), minute: de("minute") };
}

export function dia(fecha: Date, zona: string): string {
  const p = partes(fecha, zona);
  return `${p.day}/${p.month}/${p.year}`;
}

export function diaYHora(fecha: Date, zona: string): string {
  const p = partes(fecha, zona);
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
}

/** Todos los textos de los datos, a cualquier profundidad: lo que escribió alguien está en ellos. */
export function textosDe(valor: unknown): string[] {
  if (typeof valor === "string") return [valor];
  return typeof valor === "object" && valor !== null ? Object.values(valor).flatMap(textosDe) : [];
}

export type Fuentes = { normal: PDFFont; negrita: PDFFont; mono: PDFFont };

/**
 * Parte el texto en líneas que caben en `ancho`. Respeta los saltos de línea; una palabra más larga
 * que la línea se corta por letras. Lo que la fuente no codifica ya sale como «?».
 */
export function lineas(texto: string, fuente: PDFFont, tamano: number, ancho: number): string[] {
  const medida = (t: string) => fuente.widthOfTextAtSize(t, tamano);
  const salida: string[] = [];
  for (const parrafo of texto.split(/\r?\n/)) {
    let actual = "";
    for (const palabra of textoParaFuente(parrafo.replace(/\t/g, " "), fuente).split(/ +/).filter(Boolean)) {
      if (!actual && medida(palabra) <= ancho) {
        actual = palabra;
      } else if (actual && medida(`${actual} ${palabra}`) <= ancho) {
        actual = `${actual} ${palabra}`;
      } else {
        if (actual) salida.push(actual);
        let resto = palabra;
        while (medida(resto) > ancho) {
          const letras = Array.from(resto);
          let n = letras.length - 1;
          while (n > 1 && medida(letras.slice(0, n).join("")) > ancho) n -= 1;
          salida.push(letras.slice(0, n).join(""));
          resto = letras.slice(n).join("");
        }
        actual = resto;
      }
    }
    salida.push(actual);
  }
  return salida;
}

export class Hoja {
  pagina!: PDFPage;
  y = 0;

  constructor(
    protected doc: PDFDocument,
    protected f: Fuentes,
    protected g: Geometria,
  ) {
    this.nueva();
  }

  nueva() {
    this.pagina = this.doc.addPage([ANCHO, ALTO]);
    if (this.g.fondo) this.pagina.drawPage(this.g.fondo, { x: 0, y: 0, width: ANCHO, height: ALTO });
    this.y = this.g.arriba;
    if (this.g.ejemplo) {
      this.texto("EJEMPLO, SIN VALOR", MARGEN, this.f.negrita, 10);
      this.y -= 18;
    }
  }

  /** Garantiza `alto` puntos libres; si no caben, sigue en otra página. */
  espacio(alto: number) {
    if (this.y - alto < this.g.abajo) this.nueva();
  }

  texto(t: string, x: number, fuente: PDFFont, tamano: number, color = TEXTO, abajo = 0) {
    this.pagina.drawText(textoParaFuente(t, fuente), { x, y: this.y - tamano - abajo, size: tamano, font: fuente, color });
  }

  regla() {
    this.pagina.drawLine({ start: { x: MARGEN, y: this.y }, end: { x: ANCHO - MARGEN, y: this.y }, thickness: 0.5, color: LINEA });
  }

  /** Lo que `fila` exige libre antes de empezar. */
  altoDeFila(valor: string): number {
    return 13 * Math.min(lineas(valor, this.f.normal, 9.5, ANCHO_UTIL - ANCHO_ETIQUETA).length, 2);
  }

  /** Una fila «etiqueta: valor»; el valor puede seguir en la página siguiente. */
  fila(etiqueta: string, valor: string) {
    const tamano = 9.5;
    const paso = 13;
    const ls = lineas(valor, this.f.normal, tamano, ANCHO_UTIL - ANCHO_ETIQUETA);
    this.espacio(paso * Math.min(ls.length, 2));
    ls.forEach((l, i) => {
      this.espacio(paso);
      if (i === 0) this.texto(etiqueta, MARGEN, this.f.negrita, tamano, SUAVE);
      this.texto(l, MARGEN + ANCHO_ETIQUETA, this.f.normal, tamano);
      this.y -= paso;
    });
    this.y -= 4;
  }

  /** Un párrafo a todo el ancho, en letra menor. */
  nota(t: string) {
    const tamano = 8.5;
    const paso = 11;
    const ls = lineas(t, this.f.normal, tamano, ANCHO_UTIL);
    this.espacio(paso * ls.length + 8);
    this.y -= 8;
    for (const l of ls) {
      this.texto(l, MARGEN, this.f.normal, tamano, SUAVE);
      this.y -= paso;
    }
  }

  titulo(t: string) {
    this.espacio(50);
    this.y -= 8;
    this.texto(t, MARGEN, this.f.negrita, 11);
    this.y -= 15;
    this.regla();
    this.y -= 6;
  }
}

/**
 * Lo que la hoja necesita antes de dibujar: el formato, si se puede usar, la geometría que deja su encabezado y su pie
 * (con su única página incrustada como fondo) y las tres fuentes. Un formato que falta o no sirve nunca impide el PDF:
 * sale con el diseño básico, y `quien` («Acta GTH-PR-02») dice en el registro de cuál se trata.
 */
export async function prepararHoja(
  doc: PDFDocument,
  d: { formato?: FormatoActa | null; membrete?: Uint8Array | null; ejemplo: boolean; quien: string },
): Promise<{ formato: FormatoActa | null; geometria: Geometria; fuentes: Fuentes }> {
  let utilizable = false;
  if (d.formato) {
    const motivo = d.membrete ? await motivoMembreteNoUtilizable(d.membrete) : "no se recibió el archivo";
    utilizable = motivo === null;
    if (!utilizable) console.error(`${d.quien}: el formato ${d.formato.codigo} no se usa (${motivo}).`);
  }
  const formato = utilizable && d.formato ? d.formato : null;
  const geometria: Geometria = formato
    ? {
        arriba: ALTO - cm(formato.margenSuperiorCm),
        abajo: cm(formato.margenInferiorCm) + 40,
        fondo: (await doc.embedPdf(d.membrete as Uint8Array, [0]))[0],
        ejemplo: d.ejemplo,
      }
    : { arriba: ALTO - MARGEN, abajo: LIMITE_INFERIOR, fondo: null, ejemplo: d.ejemplo };
  const fuentes: Fuentes = {
    normal: await doc.embedFont(StandardFonts.Helvetica),
    negrita: await doc.embedFont(StandardFonts.HelveticaBold),
    mono: await doc.embedFont(StandardFonts.Courier),
  };
  return { formato, geometria, fuentes };
}

/**
 * El pie de cada página: una línea y, bajo ella, la leyenda y el número de página, y debajo cuándo se generó. Con
 * formato va sobre el espacio de su pie; sin él, a 48 puntos del borde.
 */
export function dibujarPies(doc: PDFDocument, f: Fuentes, formato: FormatoActa | null, leyenda: string, generado: string) {
  const paginas = doc.getPages();
  paginas.forEach((pagina, i) => {
    const pie = (t: string, x: number, y: number) =>
      pagina.drawText(textoParaFuente(t, f.normal), { x, y, size: 8, font: f.normal, color: SUAVE });
    // La línea del pie va a 48 puntos del borde (con formato, 24 sobre su margen inferior); el texto, 12 y 23 bajo ella.
    const base = formato ? cm(formato.margenInferiorCm) + 24 : 48;
    const b12 = base - 12;
    const b1 = base - 23;
    pagina.drawLine({ start: { x: MARGEN, y: base }, end: { x: ANCHO - MARGEN, y: base }, thickness: 0.5, color: LINEA });
    pie(leyenda, MARGEN, b12);
    const numero = `Página ${i + 1} de ${paginas.length}`;
    pie(numero, ANCHO - MARGEN - f.normal.widthOfTextAtSize(numero, 8), b12);
    pie(generado, MARGEN, b1);
  });
}
