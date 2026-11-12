/**
 * Constantes y tipos compartidos del módulo de indicadores (Fase 14). Los valores son los de los `CHECK` de la
 * migración 0011. Sin importaciones que arrastren el cliente de la BD: los componentes de cliente importan de aquí.
 */
import { ErrorTramite } from "@/db/consultas/flujo/contrato";

/** Error de negocio del módulo: su mensaje se le muestra a la persona. */
export class ErrorIndicador extends ErrorTramite {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ErrorIndicador";
  }
}

/** El tope de cada parte del análisis, de una observación y de una respuesta (spec §8.4 y §8.6). */
export const MAXIMO_TEXTO_MEDICION = 2000;

/** Los periodos que caben en un lote de históricos (spec §8.8): los meses de cinco años. */
export const MAXIMO_HISTORICOS = 60;

/** Tope de una aprobación de fichas en bloque (spec §7.6.4): el de la lista que «Por aprobar» puede mostrar. */
export const MAXIMO_EN_BLOQUE = 200;

export const ESTADOS_INDICADOR = ["borrador", "activo", "retirado", "descartado"] as const;
export type EstadoIndicador = (typeof ESTADOS_INDICADOR)[number];

export const ESTADOS_VERSION = ["borrador", "por_aprobar", "aprobada", "descartada"] as const;
export type EstadoVersion = (typeof ESTADOS_VERSION)[number];

export const TIPOS_CAMBIO = ["inicial", "mayor", "menor"] as const;
export type TipoCambio = (typeof TIPOS_CAMBIO)[number];

export const FORMAS = ["porcentaje", "tasa", "razon", "conteo", "libre"] as const;
export type Forma = (typeof FORMAS)[number];

export const PERIODICIDADES = ["mensual", "bimestral", "trimestral", "semestral", "anual"] as const;
export type Periodicidad = (typeof PERIODICIDADES)[number];

export const ETIQUETA_PERIODICIDAD: Record<Periodicidad, string> = {
  mensual: "Mensual",
  bimestral: "Bimestral",
  trimestral: "Trimestral",
  semestral: "Semestral",
  anual: "Anual",
};

export const TENDENCIAS = ["ascendente", "descendente", "constante"] as const;
export type Tendencia = (typeof TENDENCIAS)[number];

export const MODOS_SEMAFORO = ["relativo", "fijo"] as const;
export type ModoSemaforo = (typeof MODOS_SEMAFORO)[number];

export const CONSOLIDACIONES = ["suma", "ultimo", "promedio"] as const;
export type Consolidacion = (typeof CONSOLIDACIONES)[number];

export const ORIGENES_VARIABLE = ["propia", "compartida", "automatica", "indicador"] as const;
export type OrigenVariable = (typeof ORIGENES_VARIABLE)[number];

/** Quién tiene la función de una medición: medir, analizar o seguirla. */
export const FUNCIONES_DESIGNADO = ["mide", "analiza", "seguimiento"] as const;
export type FuncionDesignado = (typeof FUNCIONES_DESIGNADO)[number];

/** El comienzo del aviso `indicadores.designacion` de cada función: «Ahora mide SGC-IND-01». */
export const AVISO_DESIGNACION: Record<FuncionDesignado, string> = {
  mide: "Ahora mide",
  analiza: "Ahora analiza",
  seguimiento: "Ahora hace seguimiento de",
};

/** Las funciones de un cargo en la ficha (quién mide y quién analiza). */
export const FUNCIONES_CARGO = ["medir", "analizar"] as const;
export type FuncionCargo = (typeof FUNCIONES_CARGO)[number];

export const SEMAFOROS = ["bien", "atencion", "critico"] as const;
export type Semaforo = (typeof SEMAFOROS)[number];

export const ETIQUETA_SEMAFORO: Record<Semaforo, string> = {
  bien: "Bien",
  atencion: "Atención",
  critico: "Crítico",
};

export const NIVELES_ACCESO = ["general", "restringido"] as const;
export type NivelAcceso = (typeof NIVELES_ACCESO)[number];

/** Los datos de operación del indicador (spec §7.3): viven en `indicadores`, no se versionan ni se firman. */
export type DatosOperacion = {
  plazoReporteDias: number;
  inicioMedicion: string;
  soporteObligatorio: boolean;
  nivelAcceso: NivelAcceso;
};

/** Lo que el formulario de la ficha ofrece para elegir; lo arma el servidor (`opcionesDeFicha`). */
export type OpcionesFicha = {
  procesos: { id: number; sigla: string; nombre: string }[];
  subprocesos: { id: number; procesoId: number; nombre: string }[];
  /** El código que se propone en cada proceso (`SIGLA-IND-NN`). */
  codigosPropuestos: Record<number, string>;
  tipos: { id: number; nombre: string }[];
  clasificaciones: { id: number; nombre: string; exigeNorma: boolean }[];
  unidades: { id: number; nombre: string; sufijo: string; decimales: number }[];
  objetivos: { id: number; nombre: string }[];
  cargos: { id: number; nombre: string }[];
  normas: { id: number; nombre: string; estado: string }[];
  usuarios: { id: number; nombre: string; cargoId: number | null }[];
  /** Quien llena el formulario, si es un usuario activo. No se designa solo: «Quién mide» nace sin persona (F14-DC10). */
  usuarioActual: number | null;
  /**
   * Los cargos de los líderes activos de cada proceso (la definición de `src/lib/alcance.ts`): los responsables de medir y
   * de analizar por omisión cuando no hay persona designada (spec §12.4).
   */
  cargosDeLideres: Record<number, number[]>;
  /** Los documentos vigentes que pueden ser el procedimiento, con los procesos a los que pertenecen. */
  documentos: { id: number; codigo: string; titulo: string; procesoIds: number[] }[];
  /** Los entes a los que ya se reporta algún indicador: sugerencias, no un catálogo (spec §17.1). */
  entes: string[];
  umbralAtencionPct: number;
  plazoReporteDias: number;
  /** El año en curso: el de referencia de «sin línea base». */
  anio: number;
  /** Los periodos que se ofrecen como inicio de medición, en cada periodicidad. */
  periodos: Record<Periodicidad, { clave: string; etiqueta: string }[]>;
  periodoEnCurso: Record<Periodicidad, string>;
};

/** El estado de un periodo en las gráficas (spec §11): el del semáforo, o por qué no tiene uno. */
export type EstadoDePunto = "bien" | "atencion" | "critico" | "sin-meta" | "sin-dato" | "no-aplica" | "futuro";

/** Un periodo de una gráfica: lo arman las lecturas (`resultadosDelAnio`) y lo dibujan los componentes de tubos. */
export type PuntoDeSerie = {
  clave: string;
  /** El periodo en palabras («marzo», «tercer trimestre de 2026»): lo leen la tabla, el foco y la tarjeta. */
  etiqueta: string;
  valor: number | null;
  /** El valor tal como se muestra, con su unidad («86 %»). */
  texto: string;
  estado: EstadoDePunto;
  nombreEstado: string;
};

/**
 * El límite de crítico de una gráfica: uno para todo el rango o, si cambia con la meta de cada periodo, uno por periodo
 * (la punteada se escalona como la meta). `texto` es la frase del último («Crítico por encima de 42,85 min») y `textos`,
 * la de cada periodo: las arma `textoDelLimite`, con el mismo número que «Así quedará el semáforo».
 */
export type LimiteDeGrafica = { valor: number; texto: string } | { porPeriodo: (number | null)[]; textos: (string | null)[]; texto: string };

export const ESTADOS_MEDICION = ["abierta", "reportada", "cerrada"] as const;
export type EstadoMedicion = (typeof ESTADOS_MEDICION)[number];

export const TIPOS_EVENTO = [
  "reporte",
  "correccion",
  "analisis",
  "no_aplica",
  "meta",
  "soporte",
  "cierre",
  "reapertura",
  "recalculo",
  "historico",
] as const;
export type TipoEvento = (typeof TIPOS_EVENTO)[number];
