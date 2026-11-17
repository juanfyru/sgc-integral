/**
 * Lo que firman «Elaboró», «Revisó» y «Aprobó» (spec 15 §12.1, F15-DC25) y su huella: el SHA-256 de un JSON canónico,
 * como `huellaDeFicha` en los indicadores. Solo servidor: usa `node:crypto` (un componente de cliente importa solo el tipo).
 *
 * Es contenido: la identificación del hallazgo, la corrección, los análisis, las causas, las dos preguntas, las acciones
 * con sus actividades (el responsable por su id y por el nombre con que se firma) y el criterio de eficacia. NO lo es lo
 * que cambian los actos o el reloj: el estado, los vencimientos, el estado del plan, la fecha original de las actividades,
 * su avance, ni los ids propios de las filas. Las listas van en el orden del plan (`orden`); los conjuntos (las causas que
 * ataca una acción, los criterios), ordenados.
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

/** SHA-256 en hexadecimal del plan en JSON canónico. */
export function huellaDePlan(p: PlanFirmado): string {
  return createHash("sha256").update(JSON.stringify(canonico(p))).digest("hex");
}
