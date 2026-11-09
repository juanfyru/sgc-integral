/**
 * El informe de la revisión anual de documentos (spec 13C §9.5, maqueta 6). `DatosInforme` es todo lo que el PDF
 * imprime: se congela al cerrar la revisión en `revisiones_anuales.informe` (jsonb) y de ahí se regenera, años
 * después, sin consultar nada más. La Tarea 11 añade aquí el generador.
 */
import type { FormatoActa } from "@/lib/acta";
import type { Decision } from "@/lib/vigencia/tipos";

export type DatosInforme = {
  entidad: string;
  anio: number;
  abiertaEn: Date;
  prorrogas: { fecha: Date; dias: number; motivo: string; por: string }[];
  cerradaEn: Date;
  cerradaPor: { nombre: string; cargo: string | null };
  metodo: string;
  alcance: { documentos: number; internos: number; externos: number; procesos: number };
  totales: Record<Decision, number>;
  decisiones: {
    codigo: string;
    titulo: string;
    version: number;
    proceso: string;
    decision: Decision;
    responsable: string | null;
    solicitud: { numero: string; venceEn: Date | null; estadoAlCierre: string } | null;
    fecha: Date | null;
    /** Solo en un externo: «Edición adoptada», «Pendiente de adoptar» o «Retirado». */
    estadoExterno?: string;
  }[];
  normograma: {
    cambios: { norma: string; estado: string; fecha: Date; documentos: number; resueltos: number; noAfecta: number }[];
    porProceso: { proceso: string; resultado: string | null; nota: string | null }[];
  };
  otros: { acusesPct: number | null; conformidadPct: number | null; externosAlDia: { alDia: number; total: number } };
  formato: FormatoActa | null;
  zona: string;
  ejemplo?: boolean;
};
