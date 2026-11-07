/**
 * Acta de aprobación o de eliminación documental en PDF (spec 13A §11.2 y §11.3). Todo su contenido
 * sale de datos que ya no cambian, y la fecha que imprime es la de la publicación: generarla otra vez
 * da el mismo texto. Solo fuentes estándar de `pdf-lib`: nada sale del servidor ni se descarga.
 */
import { PDFDocument, StandardFonts, rgb, type PDFEmbeddedPage, type PDFFont, type PDFPage } from "pdf-lib";
import { motivoMembreteNoUtilizable } from "@/lib/membrete-acta";
import { ETIQUETA_FIRMA } from "@/lib/tramites/tipos";
import { pierdeCaracteres, textoParaFuente } from "@/lib/texto-pdf";

export type CriterioActa = { texto: string; nota: string };

/** El formato de la entidad sobre el que se dibuja el acta, con el espacio que su encabezado y su pie ocupan. */
export type FormatoActa = {
  archivoId: number;
  hash: string;
  codigo: string;
  version: number;
  margenSuperiorCm: number;
  margenInferiorCm: number;
};

export type DatosActa = {
  clase: "aprobacion" | "eliminacion";
  entidad: string;
  documento: { codigo: string; titulo: string; tipo: string; proceso: string };
  version: number;
  solicitud: { numero: string; tipo: string; motivo: string; justificacion: string; solicitante: string; fecha: Date };
  vistoBueno: string;
  aceptacion: { quien: string; fecha: Date; duplicidad: string | null };
  controlCambios: string | null;
  firmas: { firma: string; nombre: string; cargo: string | null; fecha: Date; huella: string }[];
  rondas: number;
  observaciones: { total: number; cerradas: number };
  versionObsoleta: number | null;
  publicadoEn: Date;
  zona: string;
  /** Los tres siguientes son opcionales: un `detalle.acta` anterior no los trae. */
  noCumple?: CriterioActa[];
  formato?: FormatoActa | null;
  ejemplo?: boolean;
};

const cm = (x: number) => (x * 72) / 2.54;

/** Dónde empieza y termina el cuerpo de cada página, y el fondo que se dibuja bajo él. */
type Geometria = { arriba: number; abajo: number; fondo: PDFEmbeddedPage | null; ejemplo: boolean };

const ANCHO = 612;
const ALTO = 792;
const MARGEN = 48;
const LIMITE_INFERIOR = 64;
const ANCHO_UTIL = ANCHO - 2 * MARGEN;
const ANCHO_ETIQUETA = 104;
const COLUMNA_NOMBRE = 62;
const COLUMNA_FECHA = 296;
const TEXTO = rgb(0.1, 0.1, 0.1);
const SUAVE = rgb(0.38, 0.38, 0.38);
const LINEA = rgb(0.78, 0.78, 0.78);
const AVISO_CARACTERES =
  "Algunos caracteres no se pudieron imprimir y se muestran como «?». El texto íntegro consta en el historial del trámite.";

function partes(fecha: Date, zona: string): Record<"day" | "month" | "year" | "hour" | "minute", string> {
  const p = new Intl.DateTimeFormat("es-CO", {
    timeZone: zona, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(fecha);
  const de = (t: Intl.DateTimeFormatPartTypes) => p.find((x) => x.type === t)?.value ?? "";
  return { day: de("day"), month: de("month"), year: de("year"), hour: de("hour"), minute: de("minute") };
}

function dia(fecha: Date, zona: string): string {
  const p = partes(fecha, zona);
  return `${p.day}/${p.month}/${p.year}`;
}

export function diaYHora(fecha: Date, zona: string): string {
  const p = partes(fecha, zona);
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
}

function textoObservaciones({ total, cerradas }: DatosActa["observaciones"]): string {
  if (total === 0) return "Ninguna";
  return `${cerradas} de ${total} ${cerradas === 1 ? "cerrada" : "cerradas"}`;
}

/** Todos los textos de los datos, a cualquier profundidad: lo que escribió alguien está en ellos. */
function textosDe(valor: unknown): string[] {
  if (typeof valor === "string") return [valor];
  return typeof valor === "object" && valor !== null ? Object.values(valor).flatMap(textosDe) : [];
}

type Fuentes = { normal: PDFFont; negrita: PDFFont; mono: PDFFont };

/**
 * Parte el texto en líneas que caben en `ancho`. Respeta los saltos de línea; una palabra más larga
 * que la línea se corta por letras. Lo que la fuente no codifica ya sale como «?».
 */
function lineas(texto: string, fuente: PDFFont, tamano: number, ancho: number): string[] {
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

class Hoja {
  pagina!: PDFPage;
  y = 0;

  constructor(
    private doc: PDFDocument,
    private f: Fuentes,
    private g: Geometria,
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

  /** Un criterio que no cumple: su texto en negrita y, bajo él, la nota de quien dio el concepto. */
  criterio(c: CriterioActa, reserva = 0) {
    const paso = 12;
    const sangria = 10;
    const ancho = ANCHO_UTIL - sangria;
    const titulo = lineas(c.texto, this.f.negrita, 9.5, ancho);
    const nota = c.nota.trim() ? lineas(c.nota, this.f.normal, 9, ancho) : [];
    this.espacio(paso * (titulo.length + Math.min(nota.length, 2)) + reserva);
    for (const l of titulo) {
      this.espacio(paso);
      this.texto(l, MARGEN + sangria, this.f.negrita, 9.5);
      this.y -= paso;
    }
    for (const l of nota) {
      this.espacio(paso);
      this.texto(l, MARGEN + sangria, this.f.normal, 9, SUAVE);
      this.y -= paso;
    }
    this.y -= 4;
  }

  firma(d: DatosActa["firmas"][number], zona: string) {
    const nombre = lineas(d.nombre, this.f.negrita, 9.5, COLUMNA_FECHA - COLUMNA_NOMBRE - 8);
    const cargo = d.cargo ? lineas(d.cargo, this.f.normal, 8.5, COLUMNA_FECHA - COLUMNA_NOMBRE - 8) : [];
    this.espacio(nombre.length * 12 + cargo.length * 11 + 28);
    this.texto(d.firma, MARGEN, this.f.negrita, 9.5);
    this.texto(diaYHora(d.fecha, zona), MARGEN + COLUMNA_FECHA, this.f.normal, 9.5);
    for (const l of nombre) {
      this.texto(l, MARGEN + COLUMNA_NOMBRE, this.f.negrita, 9.5);
      this.y -= 12;
    }
    for (const l of cargo) {
      this.texto(l, MARGEN + COLUMNA_NOMBRE, this.f.normal, 8.5, SUAVE);
      this.y -= 11;
    }
    this.y -= 2;
    // La huella completa va en una sola línea; si fuera más larga de lo previsto, la letra se achica.
    const huella = textoParaFuente(`Huella SHA-256: ${d.huella}`, this.f.mono);
    const tamano = Math.min(7.5, (ANCHO_UTIL - COLUMNA_NOMBRE) / this.f.mono.widthOfTextAtSize(huella, 1));
    this.texto(huella, MARGEN + COLUMNA_NOMBRE, this.f.mono, tamano, SUAVE);
    this.y -= 14;
    this.regla();
    this.y -= 5;
  }
}

export async function generarActa(d: DatosActa, membrete?: Uint8Array | null): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  // Un formato que falta o no sirve nunca impide el acta: sale con el diseño básico.
  let utilizable = false;
  if (d.formato) {
    const motivo = membrete ? await motivoMembreteNoUtilizable(membrete) : "no se recibió el archivo";
    utilizable = motivo === null;
    if (!utilizable) console.error(`Acta ${d.documento.codigo}: el formato ${d.formato.codigo} no se usa (${motivo}).`);
  }
  const formato = utilizable ? d.formato : null;
  const geometria: Geometria = formato
    ? {
        arriba: ALTO - cm(formato.margenSuperiorCm),
        abajo: cm(formato.margenInferiorCm) + 40,
        fondo: (await doc.embedPdf(membrete as Uint8Array, [0]))[0],
        ejemplo: d.ejemplo === true,
      }
    : { arriba: ALTO - MARGEN, abajo: LIMITE_INFERIOR, fondo: null, ejemplo: d.ejemplo === true };
  const f: Fuentes = {
    normal: await doc.embedFont(StandardFonts.Helvetica),
    negrita: await doc.embedFont(StandardFonts.HelveticaBold),
    mono: await doc.embedFont(StandardFonts.Courier),
  };
  const nombreActa = d.clase === "aprobacion" ? "Acta de aprobación documental" : "Acta de eliminación documental";
  doc.setTitle(textoParaFuente(`${nombreActa} ${d.documento.codigo} versión ${d.version}`, f.normal));
  doc.setCreator("SGC Integral");
  doc.setProducer("SGC Integral");
  doc.setCreationDate(d.publicadoEn);
  doc.setModificationDate(d.publicadoEn);

  const h = new Hoja(doc, f, geometria);
  const zona = d.zona;
  h.texto(nombreActa, MARGEN, f.negrita, 17);
  h.y -= 24;
  // Con el formato, el nombre de la entidad ya está en su encabezado.
  if (!formato) {
    for (const l of lineas(d.entidad, f.normal, 10.5, ANCHO_UTIL)) {
      h.texto(l, MARGEN, f.normal, 10.5, SUAVE);
      h.y -= 14;
    }
  }

  h.titulo("Documento");
  h.fila("Documento", `${d.documento.codigo} — ${d.documento.titulo}`);
  h.fila("Versión", String(d.version));
  h.fila("Tipo", d.documento.tipo);
  h.fila("Proceso", d.documento.proceso);

  h.titulo("Solicitud");
  h.fila("Solicitud", `${d.solicitud.numero} · ${d.solicitud.tipo}`);
  h.fila("Motivo", d.solicitud.motivo);
  h.fila("Justificación", d.solicitud.justificacion);
  h.fila("Solicitante", `${d.solicitud.solicitante}, ${diaYHora(d.solicitud.fecha, zona)}`);
  h.fila("Visto bueno", d.vistoBueno);
  h.fila("Aceptación", `${d.aceptacion.quien}, ${diaYHora(d.aceptacion.fecha, zona)}`);
  if (d.aceptacion.duplicidad) h.fila("Duplicidad", d.aceptacion.duplicidad);
  if (d.controlCambios) h.fila("Control de cambios", d.controlCambios);

  h.titulo("Firmas");
  for (const firma of d.firmas) h.firma(firma, zona);

  if (d.noCumple && d.noCumple.length > 0) {
    h.titulo("Criterios que no cumplen, con concepto favorable");
    const quien = (firma: string) => d.firmas.find((x) => x.firma === firma)?.nombre;
    const concepto = [
      [ETIQUETA_FIRMA.reviso, quien(ETIQUETA_FIRMA.reviso)],
      [ETIQUETA_FIRMA.aprobo, quien(ETIQUETA_FIRMA.aprobo)],
    ].filter((par): par is [string, string] => par[1] !== undefined);
    const textoConcepto = concepto.map(([e, n]) => `${e} ${n}`).join(" · ");
    // El último criterio reserva el sitio de «Concepto de», para evitar, en la mayoría de los casos, que la fila quede sola en otra hoja.
    const reserva = concepto.length > 0 ? h.altoDeFila(textoConcepto) : 0;
    d.noCumple.forEach((c, i) => h.criterio(c, i === d.noCumple!.length - 1 ? reserva : 0));
    if (concepto.length > 0) h.fila("Concepto de", textoConcepto);
  }

  h.titulo("Recorrido");
  if (d.clase === "aprobacion") {
    h.fila("Rondas", String(d.rondas));
    h.fila("Observaciones", textoObservaciones(d.observaciones));
    h.fila(
      "Versión anterior",
      d.versionObsoleta === null
        ? "No había versión anterior vigente"
        : `${d.versionObsoleta}, obsoleta desde el ${dia(d.publicadoEn, zona)}`,
    );
  } else {
    h.fila("Versión anulada", `${d.version}, anulada el ${dia(d.publicadoEn, zona)}`);
  }

  // Los saltos de línea y las tabulaciones no se pierden: `lineas` los resuelve antes de dibujar.
  if (textosDe(d).some((t) => pierdeCaracteres(t.replace(/\r?\n|\t/g, " "), f.normal))) h.nota(AVISO_CARACTERES);

  const paginas = doc.getPages();
  paginas.forEach((pagina, i) => {
    const pie = (t: string, x: number, y: number) =>
      pagina.drawText(textoParaFuente(t, f.normal), { x, y, size: 8, font: f.normal, color: SUAVE });
    // La línea del pie va a 48 puntos del borde (con formato, 24 sobre su margen inferior); el texto, 12 y 23 bajo ella.
    const base = formato ? cm(formato.margenInferiorCm) + 24 : 48;
    const b12 = base - 12;
    const b1 = base - 23;
    pagina.drawLine({ start: { x: MARGEN, y: base }, end: { x: ANCHO - MARGEN, y: base }, thickness: 0.5, color: LINEA });
    pie("Firmas electrónicas con reingreso de clave (Ley 527 de 1999)", MARGEN, b12);
    const numero = `Página ${i + 1} de ${paginas.length}`;
    pie(numero, ANCHO - MARGEN - f.normal.widthOfTextAtSize(numero, 8), b12);
    pie(`Generada por SGC Integral el ${diaYHora(d.publicadoEn, zona)}`, MARGEN, b1);
  });

  return doc.save();
}
