/**
 * El Excel para el ente (anexo 15B §4): una hoja, una tabla plana de trece columnas (la fila de títulos y los datos debajo) para
 * que el ente pueda copiarla a su propio formato. Puro: las filas llegan leídas (`filasDePlanDeAccion`). Toda celda de texto pasa
 * por `neutralizarFormula`, una sola vez, al escribir el libro (`construirExcelDelEnte`).
 */
import ExcelJS from "exceljs";
import type { FilaDePlanDeAccion } from "@/db/consultas/mejoramiento/filas-de-plan";
import { neutralizarFormula } from "@/lib/celdas";
import { plazoEnTexto } from "./planes";

export const COLUMNAS_DEL_ENTE: readonly string[] = [
  "Auditoría o evento",
  "Vigencia",
  "Hallazgo",
  "Acción de mejora",
  "Plazo",
  "Fecha de inicio",
  "Fecha de terminación",
  "Avance (%)",
  "Observaciones",
  "Responsable",
  "Código",
  "Causa raíz",
  "Estado",
];

const ANCHOS = [34, 9, 60, 55, 12, 14, 14, 10, 50, 30, 16, 50, 14];

const ESTADO: Record<string, string> = { abierta: "Abierta", en_proceso: "En proceso", terminada: "Terminada", cancelada: "Cancelada" };

/** El estado de una actividad para el ente: el suyo, o «Vencida» si lo está. */
export function estadoDeActividadEnTexto(a: { estado: string; vencida: boolean }): string {
  return a.vencida ? "Vencida" : (ESTADO[a.estado] ?? a.estado);
}

/** `2026-11-02` como `2026/11/02`. */
const fecha = (dia: string) => dia.replaceAll("-", "/");

type Celda = string | number;

/** Una fila por cada una de `filas`, con las trece celdas en el orden de `COLUMNAS_DEL_ENTE`. */
export function filasDelEnte(plan: { nombre: string; vigencia: number }, filas: FilaDePlanDeAccion[]): Array<Array<Celda>> {
  return filas.map((f) => {
    const hallazgo = `${f.hallazgo.titulo} — ${f.hallazgo.descripcion}`;
    const a = f.actividad;
    if (!a || !f.accion) {
      return [plan.nombre, plan.vigencia, hallazgo, "", "", "", "", "", f.enQueVa ?? "", "", f.hallazgo.codigo, "", ""];
    }
    return [
      plan.nombre,
      plan.vigencia,
      hallazgo,
      `${f.accion.descripcion} · Actividad: ${a.descripcion}`,
      plazoEnTexto(a.inicio, a.fin),
      fecha(a.inicio),
      fecha(a.fin),
      a.avance,
      a.ultimoSeguimiento?.realizado ?? "",
      a.cargo ?? a.responsable,
      f.hallazgo.codigo,
      [f.accion.causas, f.accion.metodo ? `Método: ${f.accion.metodo}` : ""].filter(Boolean).join(" · "),
      estadoDeActividadEnTexto(a),
    ];
  });
}

export async function construirExcelDelEnte(plan: { nombre: string; vigencia: number }, filas: FilaDePlanDeAccion[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const hoja = wb.addWorksheet("Plan de mejoramiento");
  hoja.columns = ANCHOS.map((width) => ({ width }));
  const cabecera = hoja.addRow([...COLUMNAS_DEL_ENTE]);
  cabecera.font = { bold: true };
  hoja.views = [{ state: "frozen", ySplit: 1 }];
  hoja.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COLUMNAS_DEL_ENTE.length } };
  for (const f of filasDelEnte(plan, filas)) hoja.addRow(f.map((v) => (typeof v === "string" ? neutralizarFormula(v) : v)));
  return Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer);
}
