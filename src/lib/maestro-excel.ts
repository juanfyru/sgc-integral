import ExcelJS from "exceljs";
import type { FilaMaestro } from "@/db/consultas/maestro";
import { neutralizarFormula } from "@/lib/celdas";
import { APROBACION_EN_LISTADO } from "@/lib/tramites/tipos";

export type MetaMaestro = {
  hospital: string;
  generadoEn: string;
  alcance: string;
  total: number;
};

const COLUMNAS: Array<{
  cab: string;
  ancho: number;
  valor: (f: FilaMaestro) => string | number | null;
}> = [
  { cab: "Código", ancho: 16, valor: (f) => f.codigo },
  { cab: "Título", ancho: 42, valor: (f) => f.titulo },
  { cab: "Tipo", ancho: 18, valor: (f) => f.tipo },
  { cab: "Versión", ancho: 9, valor: (f) => f.version },
  { cab: "Estado", ancho: 12, valor: (f) => `${f.estado.charAt(0).toUpperCase()}${f.estado.slice(1)}` },
  { cab: "Elaboración", ancho: 14, valor: (f) => f.fechaElaboracion },
  { cab: "Revisión", ancho: 14, valor: (f) => f.fechaRevision },
  { cab: "Fecha de aprobación", ancho: 19, valor: (f) => f.fechaAprobacion },
  { cab: "Elaboró", ancho: 20, valor: (f) => f.elaboro },
  { cab: "Revisó", ancho: 20, valor: (f) => f.reviso },
  { cab: "Aprobó", ancho: 20, valor: (f) => f.aprobo },
  { cab: "Aprobación", ancho: 22, valor: (f) => (f.origenAprobacion ? APROBACION_EN_LISTADO[f.origenAprobacion] : null) },
  { cab: "Proceso propietario", ancho: 32, valor: (f) => f.propietario },
];

/**
 * Neutraliza la inyección de fórmulas: si una celda de texto empieza por un
 * carácter que Excel/LibreOffice interpretan como fórmula, se antepone un
 * apóstrofo para forzar que se trate como texto. Los títulos, códigos y
 * responsables son texto libre del admin: sin esto, un valor como "=HYPERLINK(...)"
 * se ejecutaría al abrir el archivo en el Excel del hospital.
 */
function sanearCelda(v: string | number | null): string | number | null {
  if (typeof v === "string") return neutralizarFormula(v);
  return v;
}

/**
 * Construye el workbook del Listado Maestro. Función pura: recibe filas y
 * metadatos (incluida la fecha ya formateada) y devuelve el Buffer del xlsx.
 * Sin acceso a BD ni al reloj: determinista y testeable.
 */
export async function construirExcelMaestro(
  filas: FilaMaestro[],
  meta: MetaMaestro,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const hoja = wb.addWorksheet("Listado Maestro");
  const ultima = COLUMNAS.length;

  hoja.columns = COLUMNAS.map((c) => ({ width: c.ancho }));

  // El nombre viene de la BD (Entidad y marca): pasa por el mismo saneo que las filas (D54).
  const tituloFila = hoja.addRow([sanearCelda(meta.hospital)]);
  tituloFila.font = { bold: true, size: 14 };
  hoja.mergeCells(1, 1, 1, ultima);
  const sub = hoja.addRow(["Listado Maestro de Documentos"]);
  sub.font = { bold: true, size: 12 };
  hoja.mergeCells(2, 1, 2, ultima);
  hoja.addRow([`Generado: ${meta.generadoEn}`]);
  hoja.mergeCells(3, 1, 3, ultima);
  hoja.addRow([`Alcance: ${meta.alcance} — Total: ${meta.total}`]);
  hoja.mergeCells(4, 1, 4, ultima);
  hoja.addRow([]);

  const cabecera = hoja.addRow(COLUMNAS.map((c) => c.cab));
  cabecera.eachCell((celda) => {
    celda.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1B4E8E" } };
    celda.font = { bold: true, color: { argb: "FFFFFFFF" } };
  });
  hoja.autoFilter = {
    from: { row: cabecera.number, column: 1 },
    to: { row: cabecera.number, column: ultima },
  };

  for (const f of filas) hoja.addRow(COLUMNAS.map((c) => sanearCelda(c.valor(f))));

  const ab = await wb.xlsx.writeBuffer();
  return Buffer.from(ab as ArrayBuffer);
}
