/**
 * Constantes y tipos compartidos del módulo de indicadores (Fase 14). Los valores son los de los `CHECK` de la
 * migración 0011. Sin importaciones que arrastren el cliente de la BD: los componentes de cliente importan de aquí.
 */
import { ErrorTramite } from "@/db/consultas/flujo/contrato";
import type { AlcanceDeCalculo, ClaveDeCalculo, VariableDeCalculo } from "./calculos/registro";

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

export const MODOS_SEMAFORO = ["relativo", "fijo", "rangos"] as const;
export type ModoSemaforo = (typeof MODOS_SEMAFORO)[number];

export const CONSOLIDACIONES = ["suma", "ultimo", "promedio"] as const;
export type Consolidacion = (typeof CONSOLIDACIONES)[number];

/** De dónde sale el dato de una ficha: lo digita una persona o lo calcula el sistema (anexo 14B, §5.3). */
export const ORIGENES_DATO = ["manual", "automatico"] as const;
export type OrigenDato = (typeof ORIGENES_DATO)[number];

/**
 * Los datos de operación de un indicador automático (anexo 14B, §5.3): nadie mide y, en un cálculo de flujo, el plazo de
 * reporte son los días que el sistema espera tras el fin del periodo para calcularlo. Los dicen el formulario y la ficha.
 */
export const NADIE_MIDE = "Nadie: lo calcula el sistema";
export const ESPERA_ANTES_DE_CALCULAR = "Días de espera antes de calcular";

/** Quién mide una ficha manual sin variables propias (anexo 14C, §3.1): sus datos llegan de otros datos e indicadores. */
export const NADIE_MIDE_AJENO = "Nadie: sus datos llegan de otras fuentes";
/** «Cómo se obtiene el dato» de esa misma ficha: nadie lo digita, aunque tampoco lo calcule el sistema. */
export const ORIGEN_AJENO = "Llega de datos compartidos o de otros indicadores";

/** Lo que el formulario advierte al desagregar (anexo 14C, §5.2). */
export const AVISO_DESAGREGACION =
  "El total se calcula sumando cada variable entre las categorías. Desagregue solo indicadores cuyas variables sean cantidades que se suman (casos, pacientes, pesos)";

/** La advertencia al elaborar y al aprobar un compuesto que toma un indicador restringido (anexo 14C, §6.1). */
export const avisoDeDeduccion = (nombre: string) =>
  `Quien vea este indicador podrá deducir el resultado de «${nombre}» si es el único componente que no puede ver`;

/** El detalle de una tarea que el Admin SGC tiene de respaldo (spec 14 §6.1): sin designado ni líder en la función. */
export const SIN_RESPONSABLE = "Sin responsable: designe a alguien";

/**
 * Un periodo de un dato con dimensión que nació sin categorías (ninguna existía cuando terminó; anexo 14C, §5.7): no se
 * reporta vacío. Lo dicen el servidor y la pantalla de reportar.
 */
export const PERIODO_SIN_CATEGORIAS = "Este periodo no tiene categorías: pida al Administrador del SGC que las actualice";

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

/** «Bien» que no alcanza la meta (rangos propios, spec 14A §3.1): verde con letras, nunca verde a secas. */
export const NO_ALCANZA_LA_META = "no alcanza la meta";
export const sinAlcanzarLaMeta = (semaforo: Semaforo | null, cumple: boolean | null | undefined) => semaforo === "bien" && cumple === false;
/** El nombre del estado de un resultado con su salvedad: «Bien, no alcanza la meta» (nombres accesibles y tablas). */
export const nombreDeEstado = (semaforo: Semaforo, cumple: boolean | null | undefined) =>
  sinAlcanzarLaMeta(semaforo, cumple) ? `${ETIQUETA_SEMAFORO[semaforo]}, ${NO_ALCANZA_LA_META}` : ETIQUETA_SEMAFORO[semaforo];

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
  subprocesos: { id: number; procesoId: number; nombre: string; sigla: string | null }[];
  /** El código que se propone en cada proceso y en cada subproceso con sigla (`SIGLA-ID-NNN`). */
  codigosPropuestos: { procesos: Record<number, string>; subprocesos: Record<number, string> };
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
  /** Los cálculos que el sistema hace (el registro de `src/lib/indicadores/calculos/registro.ts`), con sus alcances. */
  calculos: {
    clave: ClaveDeCalculo;
    nombre: string;
    clase: "estado" | "flujo";
    forma: string;
    tendencia: string;
    reconstruible: boolean;
    exigeMeta: boolean;
    unidadSugerida: string;
    alcances: { clave: AlcanceDeCalculo; etiqueta: string }[];
    variables: VariableDeCalculo[];
  }[];
  /**
   * Los cálculos y alcances que ya tienen una ficha activa, sin la del indicador que se edita: el formulario avisa antes de
   * enviar (anexo 14B, §5.3). `procesoId` solo cuenta con alcance «proceso».
   */
  calculosActivos: { calculo: ClaveDeCalculo; alcance: AlcanceDeCalculo; procesoId: number }[];
  /**
   * Los datos compartidos activos (anexo 14C, §4.2): de ellos el servidor copia lo que la variable firma. Al editar, también
   * los que la versión ya cita aunque se hayan desactivado, con `inactivo` (una cita vieja sigue valiendo).
   */
  datos: {
    id: number;
    nombre: string;
    proceso: string;
    periodicidad: Periodicidad;
    consolidacion: Consolidacion;
    unidad: string | null;
    dimensionId: number | null;
    dimension: string | null;
    inactivo?: true;
  }[];
  /**
   * Los indicadores activos con ficha vigente que una variable puede tomar (anexo 14C, §6.1), sin el que se edita. Al editar,
   * también los que la versión ya cita aunque se hayan retirado, con `retirado`.
   */
  tomables: { id: number; codigo: string; nombre: string; periodicidad: Periodicidad; conMeta: boolean; restringido: boolean; retirado?: true }[];
  /** Las dimensiones activas por las que se puede desagregar (anexo 14C, §5.2) y, al editar, la ya citada, con `inactiva`. */
  dimensiones: { id: number; nombre: string; inactiva?: true }[];
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
  /** Bien que no alcanza la meta: el nombre lo dice entero y la impresión lo abrevia con «*». */
  sinAlcanzar?: boolean;
  /** Lo que la columna impresa escribe en vez de `nombreEstado` cuando es largo: «Bien*». */
  nombreImpreso?: string;
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
  "foto",
  "propagacion",
  "categorias",
] as const;
export type TipoEvento = (typeof TIPOS_EVENTO)[number];

/** Qué toma una variable de un indicador de origen: su valor o su porcentaje de cumplimiento (anexo 14C). */
export const TOMAS = ["valor", "cumplimiento"] as const;
export type Toma = (typeof TOMAS)[number];

/** Los motivos con que el sistema deja en «No aplica» una medición o una categoría (anexo 14C). */
export const MOTIVO_COMPONENTE_NO_APLICA = "Un componente no aplicó en el periodo";
export const MOTIVO_NADA_QUE_MEDIR = "No hubo nada que medir en el periodo";
export const MOTIVO_DATO_SIN_CATEGORIA = "El dato no trae esta categoría";
export const MOTIVO_TODAS_NO_APLICAN = "Ninguna categoría aplicó en el periodo";
/**
 * Los cuatro, reservados: una persona no los escribe como su motivo (`motivoValido`), porque el sistema reconoce por su
 * motivo el «No aplica» que puso y lo quita cuando deja de ser cierto.
 */
export const MOTIVOS_DEL_SISTEMA: readonly string[] = [
  MOTIVO_COMPONENTE_NO_APLICA,
  MOTIVO_NADA_QUE_MEDIR,
  MOTIVO_DATO_SIN_CATEGORIA,
  MOTIVO_TODAS_NO_APLICAN,
];

/** Lo que ve quien no puede ver un indicador restringido del que otro depende. */
export const COMPONENTE_OCULTO = "Indicador restringido";
export const VALOR_OCULTO = "No disponible";
export const RESULTADO_OCULTO = "Resultado de un indicador restringido";

/**
 * El motivo del contagio (`MOTIVO_COMPONENTE_NO_APLICA`) para quien lee (anexo 14C, §6.3, F14C-DC29): con el componente que
 * no aplicó («CEX-ID-002 Oportunidad de la cita»), a quien lo ve; sin él, el motivo tal cual se guardó. Cualquier otro
 * motivo sale igual.
 */
export function motivoParaQuienLee(motivo: string | null, componente: string | null): string | null {
  return motivo === MOTIVO_COMPONENTE_NO_APLICA && componente ? `${componente} no aplicó en el periodo` : motivo;
}

/** Cuántos niveles de indicadores que toman de otros se admiten. */
export const MAXIMO_NIVELES = 5;
