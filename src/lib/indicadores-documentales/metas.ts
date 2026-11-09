import type { ConfigDocumental } from "@/db/consultas/config-documental";
import type { Medicion } from "./definiciones";
import type { Periodo } from "./periodo";

export const INDICADORES = ["dentro_plazo", "aprobacion", "vencidos", "acuses", "conformidad", "externos", "etapas"] as const;
export type Indicador = (typeof INDICADORES)[number];

export const NOMBRE_INDICADOR: Record<Indicador, string> = {
  dentro_plazo: "Documentos dentro de su plazo de revisión",
  aprobacion: "Tiempo de aprobación",
  vencidos: "Documentos con revisión vencida",
  acuses: "Acuses de lectura confirmados",
  conformidad: "Conformidad en puntos de uso",
  externos: "Externos verificados al día",
  etapas: "Etapas del trámite cerradas en plazo",
};

export const UNIDAD: Record<Indicador, "pct" | "dias" | "conteo"> = {
  dentro_plazo: "pct",
  aprobacion: "dias",
  vencidos: "conteo",
  acuses: "pct",
  conformidad: "pct",
  externos: "pct",
  etapas: "pct",
};

/** `min`: cumple si el valor alcanza la meta; `max`: cumple si no la supera. */
export const SENTIDO: Record<Indicador, "min" | "max"> = {
  dentro_plazo: "min",
  aprobacion: "max",
  vencidos: "max",
  acuses: "min",
  conformidad: "min",
  externos: "min",
  etapas: "min",
};

export function metaDe(i: Indicador, c: { metas: ConfigDocumental["metas"]; umbralConformidadPct: number }): number {
  switch (i) {
    case "dentro_plazo":
      return c.metas.dentroPlazoPct;
    case "aprobacion":
      return c.metas.aprobacionDias;
    case "vencidos":
      return c.metas.vencidos;
    case "acuses":
      return c.metas.acusesPct;
    case "conformidad":
      return c.umbralConformidadPct;
    case "externos":
      return c.metas.externosPct;
    case "etapas":
      return c.metas.etapasPlazoPct;
  }
}

export function cumple(i: Indicador, valor: number | null, meta: number): boolean | null {
  if (valor === null) return null;
  return SENTIDO[i] === "min" ? valor >= meta : valor <= meta;
}

/**
 * El cumplimiento de un porcentaje con la razón exacta, no con el entero redondeado: 18 de 19 (94,7 %) no alcanza una
 * meta de 95. Sin denominador no hay dato. En enteros, para que 19 de 20 sea 95 exacto.
 */
export function cumplePorcentaje(i: Indicador, m: Pick<Medicion, "numerador" | "denominador">, meta: number): boolean | null {
  if (m.denominador === 0) return null;
  return SENTIDO[i] === "min" ? m.numerador * 100 >= meta * m.denominador : m.numerador * 100 <= meta * m.denominador;
}

/** Lo que devuelve la consulta de los indicadores (`src/db/consultas/vigencia/indicadores.ts`). */
export type IndicadorMedido = {
  clave: Indicador;
  nombre: string;
  unidad: "pct" | "dias" | "conteo";
  valor: number | null;
  numerador: number;
  denominador: number;
  meta: number;
  cumple: boolean | null;
  /** «mediana 21 días · desde la solicitud: 27 días», «3 etapas sin dato»… */
  detalle: string | null;
};

/** Un documento con la revisión vencida que la persona ve; `tramite` es el número del trámite abierto, si lo tiene. */
export type VencidoIndicador = {
  documentoId: number;
  codigo: string;
  titulo: string;
  origen: "interno" | "externo";
  procesoId: number;
  sigla: string;
  proceso: string;
  proximaRevision: Date | null;
  /** Días desde el vencimiento. */
  dias: number | null;
  tramite: string | null;
};

export type ResultadoIndicadores = {
  periodo: Periodo;
  procesoId: number | null;
  indicadores: IndicadorMedido[];
  vencidosPorProceso: { procesoId: number; sigla: string; proceso: string; vencidos: number }[];
  /** `alDia`: dentro del plazo; `sinFecha`: vigentes sin próxima revisión, fuera del porcentaje. */
  dentroPorProceso: {
    procesoId: number;
    sigla: string;
    proceso: string;
    vigentes: number;
    alDia: number;
    valor: number | null;
    cumple: boolean | null;
    sinFecha: number;
  }[];
  vencidos: VencidoIndicador[];
  tramites: { publicados: number; enCurso: number };
};
