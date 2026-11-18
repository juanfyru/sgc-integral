/**
 * Lo que firman «Elaboró», «Revisó» y «Aprobó» (spec 15 §12.1, F15-DC25) y su huella: el SHA-256 de un JSON canónico,
 * como `huellaDeFicha` en los indicadores. Solo servidor: usa `node:crypto` (un componente de cliente importa solo el tipo).
 *
 * Es contenido: la identificación del hallazgo, la corrección, los análisis, las causas, las dos preguntas, las acciones
 * con sus actividades (el responsable por su id y por el nombre con que se firma) y el criterio de eficacia. NO lo es lo
 * que cambian los actos o el reloj: el estado, los vencimientos, el estado del plan, la fecha original de las actividades,
 * su avance, ni los ids propios de las filas. Las listas van en el orden del plan (`orden`); los conjuntos (las causas que
 * ataca una acción, los criterios), ordenados.
 *
 * «Verificó» y «Cerró» (Tarea 16) firman la evaluación de la eficacia y el cierre con la misma forma (`huellaDeEvaluacion`,
 * `huellaDeCierre`): cada una encadena la huella de lo anterior (el plan, la evaluación).
 */
import { createHash } from "node:crypto";
import type { Periodicidad } from "@/lib/indicadores/tipos";
import type { Clase, Criticidad, Origen, TipoAccion } from "./tipos";

export type ActividadFirmada = {
  /** «A1.2»: la acción y la actividad, por su orden. */
  numero: string;
  descripcion: string;
  responsableId: number;
  /** El nombre del responsable cuando se firma. */
  responsable: string;
  inicio: string;
  fin: string;
};

export type AccionFirmada = {
  /** «A1»: por su orden en la ronda. */
  numero: string;
  tipo: TipoAccion;
  descripcion: string;
  /** El orden de cada causa de la ronda que ataca, de menor a mayor. */
  causas: number[];
  recursos: string | null;
  indicadorCumplimiento: string | null;
  meta: string | null;
  actividades: ActividadFirmada[];
};

export type PlanFirmado = {
  ronda: number;
  identificacion: {
    codigo: string;
    clase: Clase;
    criticidad: Criticidad | null;
    origen: Origen;
    fuente: string | null;
    referenciaCaso: string | null;
    detectadoEn: string;
    proceso: string;
    subproceso: string | null;
    titulo: string;
    descripcion: string;
    requisitoClausula: string | null;
    requisitoNorma: string | null;
    requisitoDocumento: string | null;
    riesgo: string | null;
    fechaLimiteEnte: string | null;
    /** El código del hallazgo del que es reincidencia. */
    reincidenteDe: string | null;
    /** A qué se refiere (§7.1), por su id y por el nombre con que se firma: código y título del documento. */
    documentoId: number | null;
    documento: string | null;
    /** Código y nombre de la ficha vigente del indicador. */
    indicadorId: number | null;
    indicador: string | null;
    /** El periodo de la medición. */
    medicionId: number | null;
    medicion: string | null;
  };
  correccion: { requerida: boolean | null; descripcion: string | null; responsable: string | null; implementadaEn: string | null };
  analisis: Array<{ orden: number; metodo: string; equipo: string | null; observaciones: string | null; contenido: unknown }>;
  causas: Array<{ orden: number; texto: string; sinAccionPorque: string | null }>;
  preguntas: { similares: boolean | null; similaresDetalle: string | null; cambios: unknown };
  acciones: AccionFirmada[];
  criterio: {
    criterios: string[];
    criterioOtro: string | null;
    indicador: { id: number; codigo: string; nombre: string; periodicidad: Periodicidad } | null;
    fechaEvaluacion: string | null;
  };
};

/** Las claves de todo objeto, ordenadas; las listas, tal cual; `undefined` es `null`. */
function canonico(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(canonico);
  if (valor !== null && typeof valor === "object") {
    const salida: Record<string, unknown> = {};
    for (const clave of Object.keys(valor).sort()) salida[clave] = canonico((valor as Record<string, unknown>)[clave]);
    return salida;
  }
  return valor === undefined ? null : valor;
}

const sha256 = (valor: unknown) => createHash("sha256").update(JSON.stringify(canonico(valor))).digest("hex");

/** SHA-256 en hexadecimal de cualquier valor en JSON canónico: la huella de lo que la pantalla mostró (`huellaDeLoVisto`). */
export function huellaDeContenido(valor: unknown): string {
  return sha256(valor);
}

/** SHA-256 en hexadecimal del plan en JSON canónico. */
export function huellaDePlan(p: PlanFirmado): string {
  return sha256(p);
}

/**
 * Lo que firma «Verificó» (spec §12.1): el resultado, los criterios evaluados (un conjunto: ordenados), el periodo, la
 * justificación y lo que la pantalla mostró (`visto`, spec §11.4), más la huella del plan aprobado de la ronda.
 */
export function huellaDeEvaluacion(e: {
  huellaDelPlan: string;
  resultado: string;
  criterios: string[];
  desde: string;
  hasta: string;
  justificacion: string;
  visto: unknown;
}): string {
  return sha256({ ...e, criterios: [...new Set(e.criterios)].sort() });
}

/** Lo que firma «Cerró» (spec §12.1): las lecciones aprendidas, cómo se atendieron los cambios, el resultado y la huella de la evaluación. */
export function huellaDeCierre(c: { huellaDeLaEvaluacion: string; resultado: string; lecciones: string; cambiosAtendidos: string | null }): string {
  return sha256(c);
}
