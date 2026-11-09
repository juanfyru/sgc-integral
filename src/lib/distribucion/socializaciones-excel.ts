import type { Jornada } from "@/db/consultas/distribucion/jornadas";
import { construirHoja, type Columna } from "./hoja-excel";
import { ETIQUETA_MODALIDAD } from "./tipos";

export type MetaSocializaciones = { hospital: string; generadoEn: string; periodo: string; total: number };

/** Quienes asistieron sin cuenta se escriben en texto libre: uno por renglón, coma o punto y coma. */
export function contarExternos(texto: string | null): number {
  if (!texto) return 0;
  return texto.split(/[\n,;]+/).filter((nombre) => nombre.trim() !== "").length;
}

function documentos(j: Jornada): string {
  const visibles = j.versiones.map((v) => `${v.codigo} v${v.version}`);
  if (j.versionesOcultas > 0) {
    visibles.push(`y ${j.versionesOcultas} ${j.versionesOcultas === 1 ? "documento más" : "documentos más"}`);
  }
  return visibles.join("; ");
}

const COLUMNAS: Array<Columna<Jornada>> = [
  { cab: "Fecha", ancho: 12, valor: (j) => j.fecha },
  { cab: "Modalidad", ancho: 20, valor: (j) => ETIQUETA_MODALIDAD[j.modalidad] },
  { cab: "Facilitador", ancho: 28, valor: (j) => j.facilitador.nombre },
  { cab: "Documentos", ancho: 40, valor: documentos },
  { cab: "Asistentes con cuenta", ancho: 12, valor: (j) => j.asistentesCantidad },
  // La lista es evidencia (spec 13B §6.4): quien no la ve sabe cuántos fueron, nunca quiénes.
  {
    cab: "Nombres de los asistentes",
    ancho: 48,
    valor: (j) => (j.puedeVerEvidencia ? j.asistentes.map((a) => a.nombre).join("; ") || null : "Reservada"),
  },
  { cab: "Asistentes sin cuenta", ancho: 12, valor: (j) => contarExternos(j.asistentesExternos) },
  { cab: "Evidencia adjunta", ancho: 11, valor: (j) => (j.evidenciasCantidad > 0 ? "Sí" : "No") },
  { cab: "Observaciones", ancho: 40, valor: (j) => j.observaciones },
  { cab: "Estado", ancho: 32, valor: (j) => (j.anulada ? `Anulada: ${j.anulada.motivo}` : "Vigente") },
];

/** Las jornadas de socialización del periodo. Función pura: filas y metadatos ya formateados, sin BD ni reloj. */
export function construirExcelSocializaciones(filas: Jornada[], meta: MetaSocializaciones): Promise<Buffer> {
  return construirHoja("Socializaciones", "Jornadas de socialización de documentos", COLUMNAS, filas, {
    hospital: meta.hospital,
    generadoEn: meta.generadoEn,
    detalle: `Periodo: ${meta.periodo} — Total: ${meta.total}`,
  });
}
