/**
 * Lee la hoja «Indicadores» de la plantilla llena (spec fase 14A §5.3). Solo servidor (exceljs). Devuelve el texto
 * recortado de cada celda; las filas vacías se saltan y el número de fila es el de la hoja.
 */
import ExcelJS from "exceljs";
import { normalizar } from "@/lib/lote-usuarios";
import { COLUMNAS, MAXIMO_FILAS_IMPORTACION, type ClaveColumna } from "./columnas";

export type FilaLeida = { numero: number; celdas: Partial<Record<ClaveColumna, string>> };
export type LecturaDePlantilla = { ok: true; filas: FilaLeida[] } | { ok: false; error: string };

function textoDeCelda(valor: ExcelJS.CellValue, clave: ClaveColumna): string {
  if (valor === null || valor === undefined) return "";
  if (typeof valor === "string") return valor.trim();
  if (typeof valor === "number" || typeof valor === "boolean") return String(valor);
  if (valor instanceof Date) {
    const fecha = valor.toISOString().slice(0, 10);
    return clave === "inicioMedicion" ? fecha.slice(0, 7) : fecha;
  }
  if ("richText" in valor) return valor.richText.map((t) => t.text).join("").trim();
  if ("result" in valor) return valor.result === undefined ? "" : textoDeCelda(valor.result as ExcelJS.CellValue, clave);
  if ("text" in valor) return String(valor.text).trim();
  return "";
}

export async function leerPlantilla(bytes: Buffer): Promise<LecturaDePlantilla> {
  const libro = new ExcelJS.Workbook();
  try {
    await libro.xlsx.load(bytes as unknown as ArrayBuffer);
  } catch {
    return { ok: false, error: "El archivo no se pudo leer como un libro de Excel" };
  }
  const hoja = libro.getWorksheet("Indicadores");
  if (!hoja) return { ok: false, error: "El archivo no tiene la hoja «Indicadores»" };

  const columnaDe = new Map<ClaveColumna, number>();
  const encabezados = hoja.getRow(1);
  for (let i = 1; i <= Math.max(encabezados.cellCount, COLUMNAS.length); i++) {
    const texto = normalizar(textoDeCelda(encabezados.getCell(i).value, "codigo"));
    const columna = COLUMNAS.find((c) => normalizar(c.encabezado) === texto);
    if (columna && !columnaDe.has(columna.clave)) columnaDe.set(columna.clave, i);
  }
  for (const c of COLUMNAS) {
    if (!columnaDe.has(c.clave)) return { ok: false, error: `La hoja «Indicadores» no tiene la columna «${c.encabezado}»` };
  }

  const filas: FilaLeida[] = [];
  hoja.eachRow({ includeEmpty: false }, (fila, numero) => {
    if (numero === 1) return;
    const celdas: Partial<Record<ClaveColumna, string>> = {};
    for (const [clave, columna] of columnaDe) {
      const t = textoDeCelda(fila.getCell(columna).value, clave);
      if (t !== "") celdas[clave] = t;
    }
    if (Object.keys(celdas).length > 0) filas.push({ numero, celdas });
  });

  if (filas.length === 0) return { ok: false, error: "La plantilla no tiene filas" };
  if (filas.length > MAXIMO_FILAS_IMPORTACION) return { ok: false, error: `La plantilla tiene más de ${MAXIMO_FILAS_IMPORTACION} filas` };
  return { ok: true, filas };
}
