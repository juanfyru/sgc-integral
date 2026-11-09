import type { VarianteInsignia } from "@/componentes/ui/Insignia";
import { ErrorTramite } from "@/db/consultas/flujo/contrato";

export const ESTADOS_VIGENCIA = ["al_dia", "atencion", "vencida", "en_tramite"] as const;
export type EstadoVigencia = (typeof ESTADOS_VIGENCIA)[number];

export const ETIQUETA_VIGENCIA: Record<EstadoVigencia, string> = {
  al_dia: "Al día",
  atencion: "Atención",
  vencida: "Vencida",
  en_tramite: "En trámite",
};

export const VARIANTE_VIGENCIA: Record<EstadoVigencia, VarianteInsignia> = {
  al_dia: "bien",
  atencion: "atencion",
  vencida: "critico",
  en_tramite: "neutra",
};

export const RESULTADOS_VERIFICACION = ["vigente", "edicion_nueva", "retirado"] as const;
export type ResultadoVerificacion = (typeof RESULTADOS_VERIFICACION)[number];

export const ETIQUETA_RESULTADO: Record<ResultadoVerificacion, string> = {
  vigente: "Sigue vigente",
  edicion_nueva: "Hay una edición nueva",
  retirado: "Fue retirado o derogado",
};

export const DECISIONES = ["ratificar", "actualizar", "eliminar", "reciente", "en_tramite", "sin_revisar"] as const;
export type Decision = (typeof DECISIONES)[number];

export const ETIQUETA_DECISION: Record<Decision, string> = {
  ratificar: "Ratificado",
  actualizar: "Por actualizar",
  eliminar: "Por eliminar",
  reciente: "Revisado recientemente",
  en_tramite: "En trámite",
  sin_revisar: "Sin revisar",
};

/** Error con mensaje visible para la persona; `recibirArchivo` lo trata como 409. */
export class ErrorVigencia extends ErrorTramite {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ErrorVigencia";
  }
}
