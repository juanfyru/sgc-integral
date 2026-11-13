/**
 * La plantilla de importación (spec fase 14A §5.2): hojas «Indicadores», «Instrucciones» y «Listas» (oculta). Solo
 * servidor (exceljs). Toda celda escrita pasa por `neutralizarFormula`.
 */
import ExcelJS from "exceljs";
import { neutralizarFormula } from "@/lib/celdas";
import {
  COLUMNAS,
  MAXIMO_FILAS_IMPORTACION,
  VALORES_ESTADO,
  VALORES_FACTOR,
  VALORES_FORMA,
  VALORES_JUNTA,
  VALORES_PERIODICIDAD,
  VALORES_SENTIDO,
  SEGUN_LA_FORMA,
  type ListaDeColumna,
} from "./columnas";

export type ListasDePlantilla = {
  procesos: string[];
  subprocesos: string[];
  tipos: string[];
  clasificaciones: string[];
  unidades: string[];
};

const NOTAS = [
  "Una fila por indicador. Copie sus filas a la hoja «Indicadores» sin cambiar la fila de encabezados ni el orden de las columnas.",
  "Separe lo que hoy viene junto: la fórmula va en Variable A y Variable B, y la forma y el factor salen de la unidad.",
  "La meta se escribe en la unidad del indicador: 95, no 0,95, si la unidad es porcentaje.",
  "Hasta 500 filas por archivo. Los nombres que no coincidan con la app se resuelven en la vista previa.",
];

const DINAMICAS: readonly ListaDeColumna[] = ["procesos", "subprocesos", "tipos", "clasificaciones", "unidades"];

export async function plantillaDeImportacion(listas: ListasDePlantilla): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const indicadores = wb.addWorksheet("Indicadores");
  const instrucciones = wb.addWorksheet("Instrucciones");
  const hojaListas = wb.addWorksheet("Listas", { state: "hidden" });

  const valores: Record<ListaDeColumna, readonly string[]> = {
    procesos: listas.procesos,
    subprocesos: listas.subprocesos,
    tipos: listas.tipos,
    clasificaciones: listas.clasificaciones,
    unidades: listas.unidades,
    formas: VALORES_FORMA,
    factores: VALORES_FACTOR,
    juntas: VALORES_JUNTA,
    sentidos: VALORES_SENTIDO,
    periodicidades: VALORES_PERIODICIDAD,
    estados: VALORES_ESTADO,
  };
  const columnaDeLista = new Map<ListaDeColumna, number>();
  (Object.keys(valores) as ListaDeColumna[]).forEach((nombre, i) => {
    columnaDeLista.set(nombre, i + 1);
    hojaListas.getCell(1, i + 1).value = neutralizarFormula(nombre);
    valores[nombre].forEach((v, k) => {
      hojaListas.getCell(k + 2, i + 1).value = neutralizarFormula(v);
    });
  });

  COLUMNAS.forEach((c, i) => {
    const columna = i + 1;
    const encabezado = indicadores.getCell(1, columna);
    encabezado.value = neutralizarFormula(c.encabezado);
    encabezado.font = { bold: true };
    encabezado.alignment = { vertical: "middle", wrapText: true };
    indicadores.getColumn(columna).width = Math.max(16, c.encabezado.length + 4);
    // Texto: ningún Excel convierte «1000» o «100.000» según el idioma del equipo.
    if (c.clave === "factor") indicadores.getColumn(columna).numFmt = "@";
    if (c.lista === null) return;
    const letra = hojaListas.getColumn(columnaDeLista.get(c.lista)!).letter;
    const formula = `Listas!$${letra}$2:$${letra}$${Math.max(valores[c.lista].length, 1) + 1}`;
    const dinamica = DINAMICAS.includes(c.lista);
    const rango = `${indicadores.getColumn(columna).letter}2:${indicadores.getColumn(columna).letter}${MAXIMO_FILAS_IMPORTACION + 1}`;
    // Una validación por columna (exceljs la escribe como un rango); su tipado no expone `dataValidations`.
    (indicadores as unknown as { dataValidations: { add(rango: string, v: ExcelJS.DataValidation): void } }).dataValidations.add(rango, {
      type: "list",
      allowBlank: true,
      formulae: [formula],
      showErrorMessage: true,
      // Un nombre de un catálogo que no coincide se resuelve en la vista previa: solo se advierte.
      errorStyle: dinamica ? "warning" : "stop",
      errorTitle: c.encabezado,
      error: dinamica ? "El valor no está en la lista; la vista previa le pedirá elegir su correspondencia." : "Elija un valor de la lista.",
    });
  });
  indicadores.views = [{ state: "frozen", ySplit: 1 }];

  instrucciones.columns = [{ width: 30 }, { width: 14 }, { width: 110 }];
  ["Columna", "Obligatoria", "Qué escribir"].forEach((t, i) => {
    const celda = instrucciones.getCell(1, i + 1);
    celda.value = neutralizarFormula(t);
    celda.font = { bold: true };
  });
  COLUMNAS.forEach((c, i) => {
    instrucciones.getCell(i + 2, 1).value = neutralizarFormula(c.encabezado);
    instrucciones.getCell(i + 2, 2).value = neutralizarFormula(SEGUN_LA_FORMA.includes(c.clave) ? "Según la forma" : c.obligatoria ? "Sí" : "No");
    const ayuda = instrucciones.getCell(i + 2, 3);
    ayuda.value = neutralizarFormula(c.ayuda);
    ayuda.alignment = { wrapText: true, vertical: "top" };
  });
  NOTAS.forEach((n, i) => {
    instrucciones.getCell(COLUMNAS.length + 3 + i, 1).value = neutralizarFormula(n);
  });

  return Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer);
}
