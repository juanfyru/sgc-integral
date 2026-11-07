import ExcelJS from "exceljs";
import { neutralizarFormula } from "@/lib/celdas";

export type Celda = string | number | null;
export type Columna<F> = { cab: string; ancho: number; valor: (f: F) => Celda };

export const sanear = (v: Celda): Celda => (typeof v === "string" ? neutralizarFormula(v) : v);

/** Libro de una hoja con encabezado institucional, filtros y una fila por registro. */
export async function construirHoja<F>(
  nombreHoja: string,
  subtitulo: string,
  columnas: Array<Columna<F>>,
  filas: F[],
  meta: { hospital: string; generadoEn: string; detalle: string },
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const hoja = wb.addWorksheet(nombreHoja);
  const ultima = columnas.length;
  hoja.columns = columnas.map((c) => ({ width: c.ancho }));

  const titulo = hoja.addRow([sanear(meta.hospital)]);
  titulo.font = { bold: true, size: 14 };
  hoja.mergeCells(1, 1, 1, ultima);
  const sub = hoja.addRow([subtitulo]);
  sub.font = { bold: true, size: 12 };
  hoja.mergeCells(2, 1, 2, ultima);
  hoja.addRow([`Generado: ${meta.generadoEn}`]);
  hoja.mergeCells(3, 1, 3, ultima);
  hoja.addRow([sanear(meta.detalle)]);
  hoja.mergeCells(4, 1, 4, ultima);
  hoja.addRow([]);

  const cabecera = hoja.addRow(columnas.map((c) => c.cab));
  cabecera.eachCell((celda) => {
    celda.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1B4E8E" } };
    celda.font = { bold: true, color: { argb: "FFFFFFFF" } };
  });
  hoja.autoFilter = { from: { row: cabecera.number, column: 1 }, to: { row: cabecera.number, column: ultima } };

  for (const f of filas) hoja.addRow(columnas.map((c) => sanear(c.valor(f))));
  return Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer);
}
