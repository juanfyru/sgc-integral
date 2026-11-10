/**
 * Acta de aprobación o de eliminación documental en PDF (spec 13A §11.2 y §11.3). Todo su contenido
 * sale de datos que ya no cambian, y la fecha que imprime es la de la publicación: generarla otra vez
 * da el mismo texto. Solo fuentes estándar de `pdf-lib`: nada sale del servidor ni se descarga. La hoja,
 * el membrete y el pie son los de `pdf-hoja.ts`, que comparte con el informe de la revisión anual.
 */
import { PDFDocument } from "pdf-lib";
import {
  ANCHO_UTIL,
  Hoja,
  MARGEN,
  SUAVE,
  dia,
  diaYHora,
  dibujarPies,
  lineas,
  prepararHoja,
  textosDe,
  type FormatoActa,
} from "@/lib/pdf-hoja";
import { ETIQUETA_FIRMA } from "@/lib/tramites/tipos";
import { pierdeCaracteres, textoParaFuente } from "@/lib/texto-pdf";

export { diaYHora, type FormatoActa } from "@/lib/pdf-hoja";

export type CriterioActa = { texto: string; nota: string };

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

const COLUMNA_NOMBRE = 62;
const COLUMNA_FECHA = 296;
const AVISO_CARACTERES =
  "Algunos caracteres no se pudieron imprimir y se muestran como «?». El texto íntegro consta en el historial del trámite.";

function textoObservaciones({ total, cerradas }: DatosActa["observaciones"]): string {
  if (total === 0) return "Ninguna";
  return `${cerradas} de ${total} ${cerradas === 1 ? "cerrada" : "cerradas"}`;
}

/** La hoja del acta: la común más los criterios que no cumplen y las firmas. */
class HojaActa extends Hoja {
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
  const { formato, geometria, fuentes: f } = await prepararHoja(doc, {
    formato: d.formato,
    membrete,
    ejemplo: d.ejemplo === true,
    quien: `Acta ${d.documento.codigo}`,
  });
  const nombreActa = d.clase === "aprobacion" ? "Acta de aprobación documental" : "Acta de eliminación documental";
  doc.setTitle(textoParaFuente(`${nombreActa} ${d.documento.codigo} versión ${d.version}`, f.normal));
  doc.setCreator("SGC Integral");
  doc.setProducer("SGC Integral");
  doc.setCreationDate(d.publicadoEn);
  doc.setModificationDate(d.publicadoEn);

  const h = new HojaActa(doc, f, geometria);
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

  dibujarPies(doc, f, formato, "Firmas electrónicas con reingreso de clave (Ley 527 de 1999)", `Generada por SGC Integral el ${diaYHora(d.publicadoEn, zona)}`);

  return doc.save();
}
