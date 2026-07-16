/**
 * Generadores de archivos placeholder MÍNIMOS pero VÁLIDOS (PDF/DOCX/XLSX)
 * para los documentos ficticios del seed. Solo se usan en desarrollo (los
 * importa únicamente semilla.ts); jszip es devDependency y no viaja en la
 * imagen del NAS. El contenido deja explícito que el archivo es ficticio.
 */
import JSZip from "jszip";

export type ExtPlaceholder = "pdf" | "docx" | "xlsx";

export type DatosPlaceholder = {
  codigo: string;
  titulo: string;
  numeroVersion: number;
  ext: ExtPlaceholder;
};

const AVISO =
  "Archivo placeholder de desarrollo — contenido ficticio, no es un documento real.";
const ENTIDAD = "ESE Hospital Nuestra Señora de Fátima de Suaza";

function lineas(datos: DatosPlaceholder): string[] {
  return [
    datos.codigo,
    datos.titulo,
    `Versión ${datos.numeroVersion}`,
    ENTIDAD,
    AVISO,
  ];
}

export async function generarPlaceholder(
  datos: DatosPlaceholder,
): Promise<Buffer> {
  switch (datos.ext) {
    case "pdf":
      return generarPdf(datos);
    case "docx":
      return generarDocx(datos);
    case "xlsx":
      return generarXlsx(datos);
  }
}

// ── PDF ──────────────────────────────────────────────────────────────────────
// PDF 1.4 escrito a mano: una página carta con texto Helvetica. Los strings
// PDF llevan escape de \, ( y ); el texto se reduce a WinAnsi básico quitando
// diacríticos (suficiente para un placeholder).
function textoPdf(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\x20-\x7e]/g, "?")
    .replace(/([\\()])/g, "\\$1");
}

function generarPdf(datos: DatosPlaceholder): Buffer {
  const [codigo, titulo, version, entidad, aviso] = lineas(datos);
  const contenido = [
    "BT",
    "/F1 22 Tf 72 700 Td",
    `(${textoPdf(codigo)}) Tj`,
    "/F1 14 Tf 0 -30 Td",
    `(${textoPdf(titulo)}) Tj`,
    "/F1 12 Tf 0 -24 Td",
    `(${textoPdf(version)}) Tj`,
    "0 -40 Td",
    `(${textoPdf(entidad)}) Tj`,
    "/F1 9 Tf 0 -24 Td",
    `(${textoPdf(aviso)}) Tj`,
    "ET",
  ].join("\n");

  const objetos = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(contenido)} >>\nstream\n${contenido}\nendstream`,
  ];

  let cuerpo = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (const [i, obj] of objetos.entries()) {
    offsets.push(Buffer.byteLength(cuerpo));
    cuerpo += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  }

  const inicioXref = Buffer.byteLength(cuerpo);
  const xref = [
    "xref",
    `0 ${objetos.length + 1}`,
    "0000000000 65535 f ",
    ...offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n `),
    "trailer",
    `<< /Size ${objetos.length + 1} /Root 1 0 R >>`,
    "startxref",
    String(inicioXref),
    "%%EOF",
  ].join("\n");

  return Buffer.from(cuerpo + xref, "latin1");
}

// ── OOXML (DOCX / XLSX) ──────────────────────────────────────────────────────
// Paquetes OPC mínimos. [Content_Types].xml va como PRIMER entry del zip:
// así lo exige la detección por magic bytes de file-type.
function xmlEscape(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const XML_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

async function generarDocx(datos: DatosPlaceholder): Promise<Buffer> {
  const parrafos = lineas(datos)
    .map(
      (linea) =>
        `<w:p><w:r><w:t xml:space="preserve">${xmlEscape(linea)}</w:t></w:r></w:p>`,
    )
    .join("");

  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `${XML_DECL}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
  );
  zip.file(
    "_rels/.rels",
    `${XML_DECL}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
  );
  zip.file(
    "word/document.xml",
    `${XML_DECL}<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${parrafos}</w:body></w:document>`,
  );
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

async function generarXlsx(datos: DatosPlaceholder): Promise<Buffer> {
  const filas = lineas(datos)
    .map(
      (linea, i) =>
        `<row r="${i + 1}"><c r="A${i + 1}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(linea)}</t></is></c></row>`,
    )
    .join("");

  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `${XML_DECL}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`,
  );
  zip.file(
    "_rels/.rels",
    `${XML_DECL}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
  );
  zip.file(
    "xl/workbook.xml",
    `${XML_DECL}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Documento" sheetId="1" r:id="rId1"/></sheets></workbook>`,
  );
  zip.file(
    "xl/_rels/workbook.xml.rels",
    `${XML_DECL}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
  );
  zip.file(
    "xl/worksheets/sheet1.xml",
    `${XML_DECL}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${filas}</sheetData></worksheet>`,
  );
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
