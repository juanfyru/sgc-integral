import ExcelJS from "exceljs";
import type { FilaAcuses } from "@/db/consultas/distribucion/acuses";
import { neutralizarFormula } from "@/lib/celdas";
import { fechaHoraLocal } from "@/lib/zona-horaria";

export type MetaAcuses = { hospital: string; generadoEn: string; periodo: string; total: number };

const COLUMNAS: Array<{ cab: string; ancho: number; valor: (f: FilaAcuses) => string | number | null }> = [
  { cab: "Código", ancho: 16, valor: (f) => f.codigo },
  { cab: "Título", ancho: 42, valor: (f) => f.titulo },
  { cab: "Versión", ancho: 9, valor: (f) => f.version },
  { cab: "Proceso", ancho: 32, valor: (f) => f.proceso },
  { cab: "Publicada", ancho: 18, valor: (f) => (f.publicadoEn ? fechaHoraLocal(f.publicadoEn) : null) },
  { cab: "Confirmados", ancho: 13, valor: (f) => f.confirmados },
  { cab: "Pendientes", ancho: 12, valor: (f) => f.pendientes },
  { cab: "Por asistencia", ancho: 15, valor: (f) => f.porAsistencia },
  { cab: "Por firma", ancho: 11, valor: (f) => f.porFirma },
  { cab: "Porcentaje", ancho: 12, valor: (f) => (f.porcentaje === null ? null : `${f.porcentaje} %`) },
];

const sanear = (v: string | number | null) => (typeof v === "string" ? neutralizarFormula(v) : v);

/** El cumplimiento de lectura por versión. Función pura: filas y metadatos ya formateados, sin BD ni reloj. */
export async function construirExcelAcuses(filas: FilaAcuses[], meta: MetaAcuses): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const hoja = wb.addWorksheet("Acuses de lectura");
  const ultima = COLUMNAS.length;
  hoja.columns = COLUMNAS.map((c) => ({ width: c.ancho }));

  const titulo = hoja.addRow([sanear(meta.hospital)]);
  titulo.font = { bold: true, size: 14 };
  hoja.mergeCells(1, 1, 1, ultima);
  const sub = hoja.addRow(["Acuses de lectura de documentos"]);
  sub.font = { bold: true, size: 12 };
  hoja.mergeCells(2, 1, 2, ultima);
  hoja.addRow([`Generado: ${meta.generadoEn}`]);
  hoja.mergeCells(3, 1, 3, ultima);
  hoja.addRow([sanear(`Periodo: ${meta.periodo} — Total: ${meta.total}`)]);
  hoja.mergeCells(4, 1, 4, ultima);
  hoja.addRow([]);

  const cabecera = hoja.addRow(COLUMNAS.map((c) => c.cab));
  cabecera.eachCell((celda) => {
    celda.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1B4E8E" } };
    celda.font = { bold: true, color: { argb: "FFFFFFFF" } };
  });
  hoja.autoFilter = { from: { row: cabecera.number, column: 1 }, to: { row: cabecera.number, column: ultima } };

  for (const f of filas) hoja.addRow(COLUMNAS.map((c) => sanear(c.valor(f))));

  return Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer);
}
