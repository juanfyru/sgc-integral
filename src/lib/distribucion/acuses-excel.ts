import type { FilaAcuses } from "@/db/consultas/distribucion/acuses";
import { fechaHoraLocal } from "@/lib/zona-horaria";
import { construirHoja, type Columna } from "./hoja-excel";

export type MetaAcuses = { hospital: string; generadoEn: string; periodo: string; total: number };

const COLUMNAS: Array<Columna<FilaAcuses>> = [
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

/** El cumplimiento de lectura por versión. Función pura: filas y metadatos ya formateados, sin BD ni reloj. */
export function construirExcelAcuses(filas: FilaAcuses[], meta: MetaAcuses): Promise<Buffer> {
  return construirHoja("Acuses de lectura", "Acuses de lectura de documentos", COLUMNAS, filas, {
    hospital: meta.hospital,
    generadoEn: meta.generadoEn,
    detalle: `Periodo: ${meta.periodo} — Total: ${meta.total}`,
  });
}
