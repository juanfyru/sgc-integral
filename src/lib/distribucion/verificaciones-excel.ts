import type { FilaHistorial } from "@/db/consultas/distribucion/verificaciones-resumen";
import { fechaHoraLocal } from "@/lib/zona-horaria";
import { construirHoja, type Columna } from "./hoja-excel";

export type FilaVerificacionExcel = Pick<
  FilaHistorial,
  "sede" | "cerradaEn" | "verificoNombre" | "conforme" | "itemsConformes" | "itemsTotal" | "hallazgosAbiertos" | "propioPunto"
> & { punto: string };

export type MetaVerificaciones = { hospital: string; generadoEn: string; periodo: string; total: number };

const COLUMNAS: Array<Columna<FilaVerificacionExcel>> = [
  { cab: "Punto", ancho: 30, valor: (f) => f.punto },
  { cab: "Sede", ancho: 20, valor: (f) => f.sede },
  { cab: "Cerrada el", ancho: 18, valor: (f) => fechaHoraLocal(f.cerradaEn) },
  { cab: "Verificó", ancho: 28, valor: (f) => f.verificoNombre },
  { cab: "Resultado", ancho: 14, valor: (f) => (f.conforme ? "Conforme" : "No conforme") },
  { cab: "Ítems conformes", ancho: 16, valor: (f) => f.itemsConformes },
  { cab: "Ítems verificados", ancho: 17, valor: (f) => f.itemsTotal },
  { cab: "Hallazgos abiertos", ancho: 18, valor: (f) => f.hallazgosAbiertos },
  { cab: "Propio punto", ancho: 14, valor: (f) => (f.propioPunto ? "Sí" : "No") },
];

/** Las verificaciones cerradas del periodo. Función pura: filas y metadatos ya formateados, sin BD ni reloj. */
export function construirExcelVerificaciones(filas: FilaVerificacionExcel[], meta: MetaVerificaciones): Promise<Buffer> {
  return construirHoja("Verificaciones", "Verificaciones de puntos de uso", COLUMNAS, filas, {
    hospital: meta.hospital,
    generadoEn: meta.generadoEn,
    detalle: `Periodo: ${meta.periodo} — Total: ${meta.total}`,
  });
}
