/**
 * Constantes y tipos del módulo de mejoramiento (Fase 15). Los valores son los de los `CHECK` de la migración 0018.
 * Sin importaciones que arrastren el cliente de la BD: los componentes de cliente importan de aquí.
 */
import { ErrorTramite } from "@/db/consultas/flujo/contrato";

/** Error de negocio del módulo: su mensaje se le muestra a la persona. */
export class ErrorMejora extends ErrorTramite {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ErrorMejora";
  }
}

export const CLASES = ["no_conformidad", "observacion", "oportunidad"] as const;
export type Clase = (typeof CLASES)[number];

export const CRITICIDADES = ["alta", "media", "baja"] as const;
export type Criticidad = (typeof CRITICIDADES)[number];

export const ORIGENES_HALLAZGO = [
  "auditoria_interna", "control_interno", "revision_direccion", "pamec", "autoevaluacion", "indicador",
  "pqrsf", "evento_adverso", "riesgo_materializado", "satisfaccion_usuario", "control_documental", "otro",
  "auditoria_externa", "ente_control",
] as const;
export type Origen = (typeof ORIGENES_HALLAZGO)[number];

export const ESTADOS_HALLAZGO = [
  "por_aceptar", "rechazo", "arbitraje", "por_corregir", "por_decidir", "por_validar", "por_formular",
  "en_revision", "en_aprobacion", "en_ejecucion", "por_verificar", "en_espera", "por_cerrar",
  "cerrado", "rechazado", "anulado",
] as const;
export type EstadoHallazgo = (typeof ESTADOS_HALLAZGO)[number];

export const TERMINALES: readonly EstadoHallazgo[] = ["cerrado", "rechazado", "anulado"];

export const RESULTADOS_CIERRE = ["eficaz", "con_correccion", "sin_accion"] as const;
export type ResultadoCierre = (typeof RESULTADOS_CIERRE)[number];

export const TIPOS_ACCION = ["correctiva", "preventiva", "mejora"] as const;
export type TipoAccion = (typeof TIPOS_ACCION)[number];

export const CRITERIOS_EFICACIA = ["no_recurrencia", "mejora_indicador", "reduccion_pqrs", "otro"] as const;
export type CriterioEficacia = (typeof CRITERIOS_EFICACIA)[number];

export const METODOS_ANALISIS = ["cinco_porques", "ishikawa", "pareto", "otro"] as const;
export type MetodoAnalisis = (typeof METODOS_ANALISIS)[number];

export const ESTADOS_ACTIVIDAD = ["abierta", "en_proceso", "terminada", "cancelada"] as const;
export type EstadoActividad = (typeof ESTADOS_ACTIVIDAD)[number];

export const ACCIONES_HALLAZGO = [
  "registrar", "aceptar", "rechazar", "retirar", "sostener", "confirmar_hallazgo", "confirmar_rechazo", "corregir",
  "decidir_si", "decidir_no", "validar_correccion", "devolver_correccion", "enviar_plan", "devolver_plan",
  "revisar_plan", "aprobar_plan", "completar", "verificar_implementacion", "evaluar_eficaz", "evaluar_no_eficaz",
  "cerrar", "anular", "cargar", "reclasificar", "ajustar",
] as const;
export type AccionHallazgo = (typeof ACCIONES_HALLAZGO)[number];

export type HallazgoBase = {
  id: number;
  codigo: string;
  clase: Clase;
  criticidad: Criticidad | null;
  origen: Origen;
  estado: EstadoHallazgo;
  ronda: number;
  procesoId: number;
  reincidenteDe: number | null;
  correccionRequerida: boolean | null;
  accionRequerida: boolean | null;
  resultadoCierre: ResultadoCierre | null;
  registradoPor: number;
};
