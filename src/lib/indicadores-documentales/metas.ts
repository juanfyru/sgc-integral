import type { ConfigDocumental } from "@/db/consultas/config-documental";

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
