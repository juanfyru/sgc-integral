/**
 * Lee la hoja «Indicadores» de la plantilla llena (spec fase 14A §5.3). Solo servidor (exceljs). Devuelve el texto
 * recortado de cada celda; las filas vacías se saltan y el número de fila es el de la hoja. Una celda combinada solo
 * vale en su celda maestra: las demás son vacías. Un libro hostil no tumba la lectura: responde con un error.
 */
import ExcelJS from "exceljs";
import { normalizar } from "@/lib/lote-usuarios";
import { COLUMNAS, MAXIMO_FILAS_IMPORTACION, type ClaveColumna, type FilaLeida } from "./columnas";

export type { FilaLeida };
export type LecturaDePlantilla = { ok: true; filas: FilaLeida[] } | { ok: false; error: string };

class FechaIlegible extends Error {}
/** Una celda con error de Excel o con una fórmula que no guardó su resultado. */
class ErrorDeCelda extends Error {}

function textoDeValor(valor: ExcelJS.CellValue | undefined, clave: ClaveColumna, direccion: string): string {
  if (valor === null || valor === undefined) return "";
  if (typeof valor === "string") return valor.trim();
  if (typeof valor === "number" || typeof valor === "boolean") return String(valor);
  if (valor instanceof Date) {
    if (Number.isNaN(valor.getTime())) throw new FechaIlegible(direccion);
    let fecha: string;
    try {
      fecha = valor.toISOString().slice(0, 10);
    } catch {
      throw new FechaIlegible(direccion);
    }
    return clave === "inicioMedicion" ? fecha.slice(0, 7) : fecha;
  }
  if ("richText" in valor) return valor.richText.map((t) => t.text).join("").trim();
  if ("error" in valor) throw new ErrorDeCelda(String(valor.error));
  if ("result" in valor) {
    if (valor.result === undefined || valor.result === null) throw new ErrorDeCelda("fórmula sin resultado");
    return textoDeValor(valor.result as ExcelJS.CellValue, clave, direccion);
  }
  if ("formula" in valor || "sharedFormula" in valor) throw new ErrorDeCelda("fórmula sin resultado");
  if ("text" in valor) return textoDeValor(valor.text as ExcelJS.CellValue, clave, direccion);
  return "";
}

function textoDeCelda(celda: ExcelJS.Cell, clave: ClaveColumna, errores?: Partial<Record<ClaveColumna, string>>): string {
  if (celda.type === ExcelJS.ValueType.Merge) return "";
  try {
    return textoDeValor(celda.value, clave, celda.address);
  } catch (e) {
    if (!(e instanceof ErrorDeCelda)) throw e;
    if (errores) errores[clave] = e.message;
    return "";
  }
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

  try {
    const columnaDe = new Map<ClaveColumna, number>();
    const encabezados = hoja.getRow(1);
    for (let i = 1; i <= Math.max(encabezados.cellCount, COLUMNAS.length); i++) {
      const texto = normalizar(textoDeCelda(encabezados.getCell(i), "codigo"));
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
      const errores: Partial<Record<ClaveColumna, string>> = {};
      for (const [clave, columna] of columnaDe) {
        const t = textoDeCelda(fila.getCell(columna), clave, errores);
        if (t !== "") celdas[clave] = t;
      }
      if (Object.keys(celdas).length > 0 || Object.keys(errores).length > 0) {
        filas.push(Object.keys(errores).length > 0 ? { numero, celdas, errores } : { numero, celdas });
      }
    });

    if (filas.length === 0) return { ok: false, error: "La plantilla no tiene filas" };
    if (filas.length > MAXIMO_FILAS_IMPORTACION) return { ok: false, error: `La plantilla tiene más de ${MAXIMO_FILAS_IMPORTACION} filas` };
    return { ok: true, filas };
  } catch (e) {
    if (e instanceof FechaIlegible) return { ok: false, error: `La celda ${e.message} tiene una fecha que no se puede leer` };
    throw e;
  }
}
