/**
 * Las fichas de los indicadores de la demo (spec 14 §22) y los objetivos que miden: los ocho del Excel del usuario
 * (`SGC-IND-01` a `SGC-IND-08`, con su nombre, su objetivo, su fórmula, sus variables con su fuente, su meta y su
 * periodicidad), uno más del SGC que se retira y los ficticios de urgencias, talento humano, consulta externa y cartera.
 * Desde la 14B (anexo §11), también las que calcula el sistema: la versión 2 de `SGC-IND-03` («Objetivos cumplidos», de
 * calidad) y dos fichas nuevas del SGC, la de «Reportes de indicadores a tiempo» del proceso y la de «Conformidad en
 * puntos de uso, a la fecha» de toda la entidad. Desde la 14C (anexo §10), el dato compartido, la dimensión «Sede» y las
 * fichas que los usan (`FichaDemo14C`): las dos que toman el dato, la desagregada por sede y los dos compuestos.
 * Los textos son del dominio, no de la entidad. `indicadores-demo.ts` las crea y las mueve por las funciones del dominio.
 */
import type { DatosFicha } from "../../lib/esquemas/indicadores";
import { CALCULOS, type AlcanceDeCalculo, type ClaveDeCalculo } from "../../lib/indicadores/calculos/registro";
import { aDecimal, fraccion } from "../../lib/indicadores/formula/fraccion";
import { rangosATexto, type FilaEnTexto, type RangosEnTexto } from "../../lib/indicadores/rangos";
import { rangosEquivalentes } from "../../lib/indicadores/semaforo";
import type { Consolidacion, Periodicidad, Toma } from "../../lib/indicadores/tipos";

export type ClaveObjetivo = "eficacia" | "informacion" | "competencia" | "oportunidad" | "finanzas";

/** Los tres objetivos de calidad y los dos institucionales, ficticios (spec §16 y §22). */
export const OBJETIVOS: { clave: ClaveObjetivo; clase: "calidad" | "institucional"; enunciado: string }[] = [
  {
    clave: "eficacia",
    clase: "calidad",
    enunciado: "Mantener la eficacia del sistema de gestión de calidad con auditorías internas, acciones correctivas eficaces y la revisión por la dirección.",
  },
  {
    clave: "informacion",
    clase: "calidad",
    enunciado: "Asegurar el control de la información documentada y la gestión de los riesgos del sistema de gestión.",
  },
  {
    clave: "competencia",
    clase: "calidad",
    enunciado: "Fortalecer la competencia del personal en calidad y en seguridad del paciente.",
  },
  { clave: "oportunidad", clase: "institucional", enunciado: "Garantizar el acceso oportuno de los usuarios a los servicios de salud." },
  { clave: "finanzas", clase: "institucional", enunciado: "Asegurar la sostenibilidad financiera de la institución." },
];

export type VariableDemo = { nombre: string; descripcion: string; fuente: string; unidad?: string; consolidacion?: Consolidacion };

export type FichaDemo = {
  codigo: string;
  proceso: string;
  /** El slug del subproceso, dentro del proceso. */
  subproceso?: string;
  nombre: string;
  proposito: string;
  requisito?: string;
  puntoControl?: string;
  tipo: "Eficacia" | "Eficiencia" | "Efectividad";
  clasificacion: "Estratégico" | "Operativo" | "Regulatorio";
  objetivo?: ClaveObjetivo;
  /** «Porcentaje» (`A / B * 100`) o «Promedio o razón» (`A / B`). */
  forma: "porcentaje" | "razon";
  unidad: "Porcentaje" | "Minutos" | "Días";
  decimales: number;
  periodicidad: Periodicidad;
  tendencia: "ascendente" | "descendente";
  meta: string;
  a: VariableDemo;
  b: VariableDemo;
  /** Los valores de ejemplo de A y B con que se probó la fórmula; sin ellos, la ficha no se puede enviar. */
  prueba?: [string, string];
  /** El cargo responsable de medir y de analizar. */
  cargo: string;
  nivelAcceso?: "general" | "restringido";
  /** La norma que cita (`Resolución 256 de 2016`). */
  norma?: string;
  /** El código del documento del proceso que es su procedimiento. */
  procedimiento?: string;
  /** «Se reporta a un ente» es un estado completo (anexo 14B, §8): con el ente van su periodicidad y su plazo en días. */
  ente?: string;
  periodicidadExterna?: Periodicidad;
  plazoExternoDias?: number;
  /**
   * La línea base, donde la hay (valor y periodo); sin ella, la ficha dice «Sin línea base: <año> es el año de referencia»,
   * como la propone el formulario (spec §7.2: una de las dos formas es obligatoria).
   */
  lineaBase?: { valor: string; periodo: string };
  /** Los rangos escritos a mano; sin ellos, los equivalentes al umbral de la configuración (`rangosDeLaFicha`). */
  rangos?: RangosEnTexto;
  /**
   * «Lo calcula el sistema» (anexo 14B, §5.3): el cálculo y su alcance. La forma, las variables y la tendencia las pone el
   * registro (`automatica`); nadie la mide ni la prueba con valores.
   */
  calculo?: { clave: ClaveDeCalculo; alcance: AlcanceDeCalculo };
  /** El plazo de reporte, si no es el de todas (`PLAZO_DE_REPORTE`): en un cálculo de flujo, cuánto espera el sistema. */
  plazoReporte?: number;
};

/**
 * De dónde sale cada variable de una ficha de la 14C (anexo 14C, §3.1): propia, el dato compartido (por su nombre: el
 * servidor copia del catálogo lo demás) o el resultado de otro indicador (por su código, con qué se toma).
 */
export type VariableDemo14C =
  | ({ letra: string; origen: "propia" } & VariableDemo)
  | { letra: string; origen: "compartida"; dato: string }
  | { letra: string; origen: "indicador"; nombre: string; codigo: string; toma: Toma };

/**
 * Una ficha de la 14C: sus variables con su origen, la fórmula (con forma «libre») y la desagregación (el nombre de la
 * dimensión). La prueba lleva un valor por variable, también las ajenas; una ficha sin variables propias no la lleva.
 */
export type FichaDemo14C = Omit<FichaDemo, "forma" | "unidad" | "a" | "b" | "prueba" | "calculo"> & {
  forma: "porcentaje" | "conteo" | "libre";
  unidad: "Porcentaje" | "Número";
  formula?: string;
  variables: VariableDemo14C[];
  dimension?: string;
  prueba?: Record<string, string>;
  calculo?: undefined;
};

/** Una ficha de la 14C que nadie mide (anexo 14C, §3.1): sin variables propias, como un automático. */
export const nadieLaMide = (f: FichaDemo | FichaDemo14C): boolean => "variables" in f && f.variables.every((v) => v.origen !== "propia");

/** Los ids de lo que la ficha cita, que salen de la base sembrada (los de la 14C, de lo que la historia ya creó). */
export type Catalogo = {
  proceso: (sigla: string) => number;
  subproceso: (sigla: string, slug: string) => number;
  tipo: (nombre: string) => number;
  clasificacion: (nombre: string) => number;
  unidad: (nombre: string) => number;
  cargo: (nombre: string) => number;
  norma: (nombre: string) => number;
  documento: (codigo: string) => number;
  objetivo: (clave: ClaveObjetivo) => number;
  dato: (nombre: string) => number;
  dimension: (nombre: string) => number;
  indicador: (codigo: string) => number;
};

/** Lo de operación de la ficha (spec §7.3): desde cuándo se mide y quién mide y analiza. */
export type OperacionDemo = { inicio: string; mide: number[]; analiza: number[]; motivoCambio?: string };

/**
 * El plazo de reporte de todas las fichas sembradas, el de la configuración por omisión (spec §10.4). Decide también qué
 * periodo terminado ya se reportó en la demo: el que terminó hace más que su plazo (`calendarioDeIndicadores`).
 */
export const PLAZO_DE_REPORTE = 10;

const variable = (letra: "A" | "B", v: VariableDemo) => ({
  letra,
  nombre: v.nombre,
  descripcion: v.descripcion,
  fuente: v.fuente,
  ...(v.unidad ? { unidad: v.unidad } : {}),
  consolidacion: v.consolidacion ?? "suma",
  admiteNegativos: false,
});

/** Una variable de la 14C como la manda el formulario. */
function variable14C(cat: Catalogo, v: VariableDemo14C) {
  if (v.origen === "propia") return { ...variable(v.letra as "A" | "B", v), letra: v.letra, origen: "propia" as const };
  if (v.origen === "compartida") {
    return { letra: v.letra, nombre: v.dato, consolidacion: "suma" as const, admiteNegativos: false, origen: "compartida" as const, datoId: cat.dato(v.dato) };
  }
  return {
    letra: v.letra,
    nombre: v.nombre,
    consolidacion: "ultimo" as const,
    admiteNegativos: false,
    origen: "indicador" as const,
    indicadorOrigenId: cat.indicador(v.codigo),
    toma: v.toma,
  };
}

/** Los rangos que dan los colores del umbral de la configuración (70 %): lo que la persona escribiría en los tres estados. */
function rangosDeLaFicha(f: Pick<FichaDemo, "codigo" | "rangos" | "tendencia" | "meta" | "decimales">): string {
  if (f.rangos) return JSON.stringify(f.rangos);
  const equivalentes = rangosEquivalentes({
    tendencia: f.tendencia,
    meta: fraccion(f.meta),
    metaMax: null,
    modo: "relativo",
    umbralPct: 70,
    limite: null,
    tolerancia: null,
  });
  if (equivalentes === null) throw new Error(`La ficha ${f.codigo} de la demo no tiene unos rangos equivalentes`);
  // Como los escribiría una persona: lo que no termina en cuatro decimales se redondea a los decimales de la ficha.
  const redondeado = (t: string): string => {
    if ((t.split(".")[1] ?? "").length <= 4) return t;
    const r = aDecimal(fraccion(t)!, f.decimales, "redondear");
    return r.includes(".") ? r.replace(/0+$/, "").replace(/\.$/, "") : r;
  };
  const fila = (x: FilaEnTexto): FilaEnTexto => (x.hasta === undefined ? { ...x, valor: redondeado(x.valor) } : { ...x, valor: redondeado(x.valor), hasta: redondeado(x.hasta) });
  const t = rangosATexto(equivalentes);
  return JSON.stringify({ bien: t.bien.map(fila), atencion: t.atencion.map(fila), critico: t.critico.map(fila) });
}

/**
 * El formulario de la ficha, como lo dejaría la persona: los rangos del semáforo, con el umbral de la configuración (70 %).
 * Una automática manda el cálculo y su alcance, sin cargo que mida, sin personas que midan y sin prueba; una de la 14C que
 * nadie mide, tampoco cargo que mida.
 */
export function datosDeFicha(cat: Catalogo, f: FichaDemo | FichaDemo14C, op: OperacionDemo): DatosFicha {
  const cargo = cat.cargo(f.cargo);
  const de14C = "variables" in f;
  const prueba = de14C ? f.prueba : f.prueba && { A: f.prueba[0], B: f.prueba[1] };
  const deDondeSale = f.calculo
    ? { origenDato: "automatico" as const, calculo: f.calculo.clave, calculoAlcance: f.calculo.alcance }
    : prueba
      ? { prueba: { valores: prueba } }
      : {};
  const nadieMide = f.calculo !== undefined || nadieLaMide(f);
  return {
    procesoId: cat.proceso(f.proceso),
    ...(f.subproceso ? { subprocesoId: cat.subproceso(f.proceso, f.subproceso) } : {}),
    codigo: f.codigo,
    nombre: f.nombre,
    proposito: f.proposito,
    ...(f.requisito ? { requisito: f.requisito } : {}),
    tipoId: cat.tipo(f.tipo),
    clasificacionId: cat.clasificacion(f.clasificacion),
    ...(f.objetivo ? { objetivoId: cat.objetivo(f.objetivo) } : {}),
    ...(f.procedimiento ? { procedimientoDocumentoId: cat.documento(f.procedimiento) } : {}),
    ...(f.puntoControl ? { puntoControl: f.puntoControl } : {}),
    forma: f.forma,
    ...(de14C && f.formula ? { formula: f.formula } : {}),
    variables: de14C ? f.variables.map((v) => variable14C(cat, v)) : [variable("A", f.a), variable("B", f.b)],
    ...(de14C && f.dimension ? { dimensionId: cat.dimension(f.dimension) } : {}),
    unidadId: cat.unidad(f.unidad),
    decimales: f.decimales,
    periodicidad: f.periodicidad,
    tendencia: f.tendencia,
    meta: f.meta,
    semaforoModo: "rangos",
    rangos: rangosDeLaFicha(f),
    cargosMedir: nadieMide ? [] : [cargo],
    cargosAnalizar: [cargo],
    normaIds: f.norma ? [cat.norma(f.norma)] : [],
    ...(f.ente ? { ente: f.ente } : {}),
    ...(f.periodicidadExterna ? { periodicidadExterna: f.periodicidadExterna } : {}),
    ...(f.plazoExternoDias !== undefined ? { plazoExternoDias: f.plazoExternoDias } : {}),
    ...(op.motivoCambio ? { motivoCambio: op.motivoCambio } : {}),
    ...deDondeSale,
    ...(f.lineaBase
      ? { lineaBaseValor: f.lineaBase.valor, lineaBasePeriodo: f.lineaBase.periodo }
      : { lineaBaseNota: `Sin línea base: ${op.inicio.slice(0, 4)} es el año de referencia` }),
    plazoReporteDias: f.plazoReporte ?? PLAZO_DE_REPORTE,
    inicioMedicion: op.inicio,
    soporteObligatorio: false,
    nivelAcceso: f.nivelAcceso ?? "general",
    mide: nadieMide ? [] : op.mide,
    analiza: op.analiza,
  };
}

/**
 * Lo que el registro de cálculos fija en una ficha automática (anexo 14B, §5.3): la forma, la tendencia y las variables con
 * su nombre y su descripción. La consulta las vuelve a poner del registro; aquí van para que la ficha de la demo diga lo
 * mismo que quedará firmado.
 */
function automatica(f: Omit<FichaDemo, "forma" | "tendencia" | "a" | "b" | "prueba"> & { calculo: NonNullable<FichaDemo["calculo"]> }): FichaDemo {
  const def = CALCULOS[f.calculo.clave];
  if (def.forma !== "porcentaje") throw new Error(`La demo solo siembra cálculos de porcentaje: ${def.clave} no lo es`);
  const [a, b] = def.variables.map((v) => ({ nombre: v.nombre, descripcion: v.descripcion, fuente: "La calcula el sistema", consolidacion: v.consolidacion }));
  return { ...f, forma: "porcentaje", tendencia: def.tendencia, a, b };
}

// ── Sistema de Gestión de Calidad ───────────────────────────────────────────────────────────────────────────────────

/** Lo común de los del SGC: estratégicos (aprueba Gerencia), porcentaje ascendente, medidos por el Líder de Calidad. */
const delSgc = (
  f: Pick<FichaDemo, "codigo" | "nombre" | "proposito" | "requisito" | "puntoControl" | "tipo" | "objetivo" | "periodicidad" | "meta" | "a" | "b" | "prueba" | "procedimiento">,
): FichaDemo => ({
  ...f,
  proceso: "SGC",
  clasificacion: "Estratégico",
  forma: "porcentaje",
  unidad: "Porcentaje",
  decimales: 1,
  tendencia: "ascendente",
  cargo: "Líder de Calidad",
});

export const SGC_01 = delSgc({
  codigo: "SGC-IND-01",
  nombre: "Cumplimiento del Programa de Auditorías Internas",
  proposito:
    "Medir el grado de cumplimiento del Programa de Auditorías Internas del SGC, asegurando la cobertura de todos los procesos y requisitos planificados.",
  requisito: "NTC ISO 9001:2015 - Numeral 9.2",
  puntoControl: "PC-13",
  tipo: "Eficacia",
  objetivo: "eficacia",
  periodicidad: "trimestral",
  meta: "90",
  a: {
    nombre: "Auditorías internas ejecutadas",
    descripcion: "Número de auditorías internas ejecutadas en el periodo",
    fuente: "Programa de Auditorías Internas, informes de auditoría y actas de cierre",
    unidad: "auditorías",
  },
  b: {
    nombre: "Auditorías internas programadas",
    descripcion: "Número de auditorías internas programadas en el periodo",
    fuente: "Programa de Auditorías Internas",
    unidad: "auditorías",
  },
  prueba: ["5", "6"],
});

export const SGC_02 = delSgc({
  codigo: "SGC-IND-02",
  nombre: "Eficacia de Acciones Correctivas",
  proposito:
    "Evaluar la eficacia de las acciones correctivas implementadas, verificando la eliminación de las causas raíz de las no conformidades detectadas.",
  requisito: "NTC ISO 9001:2015 - Numerales 10.1 y 10.2",
  puntoControl: "PC-16",
  tipo: "Eficacia",
  objetivo: "eficacia",
  periodicidad: "trimestral",
  meta: "80",
  a: {
    nombre: "Acciones correctivas eficaces",
    descripcion: "Número de acciones correctivas evaluadas como eficaces en el periodo",
    fuente: "Plan de acciones correctivas, registros de seguimiento y evaluación de eficacia",
  },
  b: {
    nombre: "Acciones correctivas evaluadas",
    descripcion: "Número total de acciones correctivas evaluadas en el periodo",
    fuente: "Plan de acciones correctivas, registros de seguimiento y evaluación de eficacia",
  },
  prueba: ["4", "5"],
});

export const SGC_03 = delSgc({
  codigo: "SGC-IND-03",
  nombre: "Cumplimiento de Objetivos de Calidad",
  proposito: "Medir el grado de cumplimiento de los objetivos de calidad institucionales definidos en la planificación del SGC.",
  requisito: "NTC ISO 9001:2015 - Numeral 6.2",
  puntoControl: "PC-04",
  tipo: "Eficacia",
  periodicidad: "semestral",
  meta: "80",
  a: {
    nombre: "Objetivos de calidad cumplidos",
    descripcion: "Número de objetivos de calidad que alcanzan la meta en el periodo",
    fuente: "Matriz de objetivos de calidad, informes de seguimiento y revisión por la dirección",
  },
  b: {
    nombre: "Objetivos de calidad definidos",
    descripcion: "Número total de objetivos de calidad definidos para el periodo",
    fuente: "Matriz de objetivos de calidad",
  },
  prueba: ["3", "4"],
});

export const SGC_04 = delSgc({
  codigo: "SGC-IND-04",
  nombre: "Cumplimiento de la Revisión por la Dirección",
  proposito:
    "Verificar que la revisión por la dirección se realice con la periodicidad establecida e incluya todos los elementos de entrada requeridos por la NTC ISO 9001:2015.",
  requisito: "NTC ISO 9001:2015 - Numeral 9.3",
  puntoControl: "PC-14",
  tipo: "Eficacia",
  objetivo: "eficacia",
  periodicidad: "anual",
  meta: "100",
  a: {
    nombre: "Revisiones realizadas",
    descripcion: "Número de revisiones por la dirección realizadas con todos los elementos de entrada del numeral 9.3",
    fuente: "Acta de revisión por la dirección, agenda y evidencias de los elementos de entrada",
  },
  b: {
    nombre: "Revisiones programadas",
    descripcion: "Número de revisiones por la dirección programadas en el periodo",
    fuente: "Programa anual del sistema de gestión de calidad",
  },
  prueba: ["1", "1"],
});

/**
 * La versión 2 de `SGC-IND-03` (anexo 14B, §11): un cambio mayor que la pasa a «Lo calcula el sistema» con «Objetivos
 * cumplidos» de los objetivos de calidad. Conserva el nombre, la meta, la periodicidad y el cargo que analiza.
 */
export const SGC_03_AUTOMATICA: FichaDemo = automatica({
  ...SGC_03,
  calculo: { clave: "objetivos_cumplidos", alcance: "calidad" },
});

/** El motivo del cambio mayor de `SGC-IND-03`. */
export const MOTIVO_SGC_03_AUTOMATICA =
  "El sistema ya calcula los objetivos de calidad cumplidos con las mediciones de sus indicadores: deja de contarse a mano en la matriz de objetivos.";

/**
 * «Reportes de indicadores a tiempo» del proceso SGC (anexo 14B, §5.2), mensual. Los indicadores del SGC son trimestrales,
 * semestrales y anuales: en los meses sin fechas límite el sistema la marca «No aplica». Su plazo de reporte es de 31 días:
 * el sistema espera un mes después de cada mes para calcularla, y el mes anterior a la siembra siempre está en «Falta un
 * dato».
 */
export const SGC_REPORTES: FichaDemo = automatica({
  codigo: "SGC-ID-001",
  proceso: "SGC",
  nombre: "Oportunidad en el reporte de los indicadores del SGC",
  proposito: "Medir qué parte de las mediciones de los indicadores del proceso se reportan dentro de su fecha límite.",
  requisito: "NTC ISO 9001:2015 - Numeral 9.1.1",
  tipo: "Eficiencia",
  clasificacion: "Estratégico",
  calculo: { clave: "reportes_a_tiempo", alcance: "proceso" },
  unidad: "Porcentaje",
  decimales: 1,
  periodicidad: "mensual",
  meta: "90",
  cargo: "Líder de Calidad",
  plazoReporte: 31,
});

/**
 * «Conformidad en puntos de uso, a la fecha» de toda la entidad (anexo 14B, §6), mensual y con meta 90: desde que se
 * aprueba, su meta es el umbral con que Distribución y Vigencia juzgan la conformidad (`metaDeConformidad`), en vez del 95
 * de Configuración documental.
 */
export const SGC_CONFORMIDAD: FichaDemo = automatica({
  codigo: "SGC-ID-002",
  proceso: "SGC",
  nombre: "Conformidad en puntos de uso",
  proposito: "Medir qué parte de los puntos de uso verificados estaba conforme en su última verificación: solo la versión vigente en circulación.",
  requisito: "NTC ISO 9001:2015 - Numeral 7.5.3",
  tipo: "Eficacia",
  clasificacion: "Estratégico",
  calculo: { clave: "conformidad_fecha", alcance: "entidad" },
  unidad: "Porcentaje",
  decimales: 1,
  periodicidad: "mensual",
  meta: "90",
  cargo: "Líder de Calidad",
});

/** Nace con meta 85; el cambio mayor de la versión 2 la sube a la del Excel (90). */
export const SGC_05 = delSgc({
  codigo: "SGC-IND-05",
  nombre: "Control de Información Documentada",
  proposito:
    "Medir el grado de control de la información documentada del SGC, verificando vigencia, accesibilidad y conformidad con el formato institucional.",
  requisito: "NTC ISO 9001:2015 - Numeral 7.5",
  puntoControl: "PC-08",
  tipo: "Eficiencia",
  objetivo: "informacion",
  periodicidad: "trimestral",
  meta: "85",
  a: {
    nombre: "Documentos conformes",
    descripcion: "Número de documentos del SGC que cumplen los criterios de control (formato, vigencia y acceso)",
    fuente: "Listado Maestro de Documentos",
  },
  b: {
    nombre: "Documentos revisados",
    descripcion: "Número total de documentos del SGC revisados en el muestreo",
    fuente: "Listado Maestro de Documentos",
  },
  prueba: ["45", "50"],
  procedimiento: "SGC-PR-01",
});

/** La fuente que precisa el cambio menor de la versión 3 de `SGC-IND-05`. */
export const FUENTE_PRECISADA = "Muestreo trimestral de la coordinación de calidad sobre el Listado Maestro de Documentos";

export const SGC_06 = delSgc({
  codigo: "SGC-IND-06",
  nombre: "Cumplimiento del Plan de Capacitación en Calidad",
  proposito:
    "Medir el nivel de ejecución del plan de capacitación y sensibilización en calidad para el fortalecimiento de competencias del personal en el SGC.",
  requisito: "NTC ISO 9001:2015 - Numerales 7.2 y 7.3",
  puntoControl: "PC-09",
  tipo: "Eficacia",
  objetivo: "competencia",
  periodicidad: "trimestral",
  meta: "80",
  a: {
    nombre: "Capacitaciones ejecutadas",
    descripcion: "Número de actividades de capacitación en calidad ejecutadas en el periodo",
    fuente: "Plan de capacitación, registros de asistencia y evaluaciones",
  },
  b: {
    nombre: "Capacitaciones programadas",
    descripcion: "Número de actividades de capacitación en calidad programadas en el periodo",
    fuente: "Plan de capacitación en calidad",
  },
  prueba: ["3", "4"],
});

export const SGC_07 = delSgc({
  codigo: "SGC-IND-07",
  nombre: "Gestión de Riesgos y Oportunidades",
  proposito:
    "Evaluar el nivel de implementación de las acciones planificadas para el tratamiento de riesgos y el aprovechamiento de oportunidades del SGC.",
  requisito: "NTC ISO 9001:2015 - Numeral 6.1",
  puntoControl: "PC-05, PC-11",
  tipo: "Eficacia",
  objetivo: "informacion",
  periodicidad: "trimestral",
  meta: "70",
  a: {
    nombre: "Acciones de riesgo implementadas",
    descripcion: "Número de acciones de tratamiento de riesgos implementadas en el periodo",
    fuente: "Matriz de riesgos y oportunidades del SGC y soportes de implementación",
  },
  b: {
    nombre: "Acciones de riesgo planificadas",
    descripcion: "Número total de acciones de tratamiento de riesgos planificadas en el periodo",
    fuente: "Matriz de riesgos y oportunidades del SGC",
  },
  prueba: ["7", "10"],
});

export const SGC_08 = delSgc({
  codigo: "SGC-IND-08",
  nombre: "Oportunidad de Cierre de No Conformidades",
  proposito: "Medir la oportunidad en el cierre de las no conformidades detectadas dentro de los plazos establecidos en el plan de acción.",
  requisito: "NTC ISO 9001:2015 - Numeral 10.2",
  puntoControl: "PC-15, PC-16",
  tipo: "Efectividad",
  objetivo: "eficacia",
  periodicidad: "trimestral",
  meta: "75",
  a: {
    nombre: "No conformidades cerradas a tiempo",
    descripcion: "Número de no conformidades cerradas dentro del plazo establecido en el periodo",
    fuente: "Plan de acciones correctivas, informes de auditoría y registros de cierre",
  },
  b: {
    nombre: "No conformidades con plazo vencido o cerradas",
    descripcion: "Número total de no conformidades con plazo vencido o cerradas en el periodo",
    fuente: "Plan de acciones correctivas e informes de auditoría",
  },
  prueba: ["3", "4"],
});

/** El que se retira: su medición pasó a los indicadores documentales de Vigencia. */
export const SGC_09 = delSgc({
  codigo: "SGC-IND-09",
  nombre: "Oportunidad en la publicación de documentos aprobados",
  proposito: "Medir si los documentos aprobados se publican a tiempo, para que nadie trabaje con una versión que ya se reemplazó.",
  requisito: "NTC ISO 9001:2015 - Numeral 7.5.3",
  tipo: "Eficiencia",
  objetivo: "informacion",
  periodicidad: "trimestral",
  meta: "95",
  a: {
    nombre: "Documentos publicados a tiempo",
    descripcion: "Documentos publicados dentro de los dos días hábiles siguientes a su aprobación",
    fuente: "Listado Maestro de Documentos",
  },
  b: {
    nombre: "Documentos aprobados",
    descripcion: "Documentos aprobados en el periodo",
    fuente: "Listado Maestro de Documentos",
  },
  prueba: ["9", "10"],
});

/** Los nueve del SGC, en el orden de su código. */
export const DEL_SGC: FichaDemo[] = [SGC_01, SGC_02, SGC_03, SGC_04, SGC_05, SGC_06, SGC_07, SGC_08, SGC_09];

// ── Otros procesos ──────────────────────────────────────────────────────────────────────────────────────────────────

/** Urgencias: lo mide la enfermera jefe, de rol Consulta (spec §22). AIN no tiene líder: lo operativo lo aprueba Gerencia. */
export const AIN_01: FichaDemo = {
  codigo: "AIN-IND-01",
  lineaBase: { valor: "34", periodo: "2025" },
  proceso: "AIN",
  subproceso: "urgencias",
  nombre: "Tiempo de espera en triage II",
  proposito:
    "Medir el tiempo promedio que espera un paciente clasificado en triage II desde la clasificación hasta la atención médica en urgencias.",
  requisito: "Resolución 5596 de 2015 (triage en urgencias)",
  tipo: "Eficiencia",
  clasificacion: "Operativo",
  objetivo: "oportunidad",
  forma: "razon",
  unidad: "Minutos",
  decimales: 0,
  periodicidad: "mensual",
  tendencia: "descendente",
  meta: "30",
  a: {
    nombre: "Minutos de espera en triage II",
    descripcion: "Suma de los minutos entre la clasificación y la atención médica de cada paciente en triage II",
    fuente: "Registro de triage del servicio de urgencias",
    unidad: "minutos",
  },
  b: {
    nombre: "Pacientes en triage II",
    descripcion: "Pacientes clasificados en triage II y atendidos en el mes",
    fuente: "Registro de triage del servicio de urgencias",
    unidad: "pacientes",
  },
  prueba: ["1160", "40"],
  cargo: "Enfermera Jefe",
};

/**
 * Regulatorio: cita la Resolución 256 de 2016, que ya está en el normograma de la demo (spec §22). Se reporta al ente cada
 * trimestre, con 30 días de plazo (anexo 14B, §8): desde su aprobación han terminado al menos dos trimestres, y la demo
 * deja uno registrado y otro vencido (`constanciasDeLaDemo`).
 */
export const CEX_01: FichaDemo = {
  codigo: "CEX-IND-01",
  lineaBase: { valor: "3.4", periodo: "2025" },
  proceso: "CEX",
  subproceso: "medicina-general",
  nombre: "Oportunidad en la asignación de cita de medicina general",
  proposito:
    "Medir los días que pasan entre la solicitud de una cita de medicina general y la fecha para la que se asigna, como lo pide el reporte de los indicadores de calidad en salud.",
  requisito: "Resolución 256 de 2016: oportunidad de la cita de medicina general",
  tipo: "Eficiencia",
  clasificacion: "Regulatorio",
  objetivo: "oportunidad",
  forma: "razon",
  unidad: "Días",
  decimales: 1,
  periodicidad: "mensual",
  tendencia: "descendente",
  meta: "3",
  a: {
    nombre: "Días entre la solicitud y la cita",
    descripcion: "Suma de los días calendario entre la solicitud de cada cita de medicina general de primera vez y la fecha asignada",
    fuente: "Sistema de agendamiento de citas",
    unidad: "días",
  },
  b: {
    nombre: "Citas de medicina general asignadas",
    descripcion: "Número de citas de medicina general de primera vez asignadas en el mes",
    fuente: "Sistema de agendamiento de citas",
    unidad: "citas",
  },
  prueba: ["1302", "620"],
  cargo: "Médico Coordinador",
  norma: "Resolución 256 de 2016",
  ente: "Ministerio de Salud y Protección Social",
  periodicidadExterna: "trimestral",
  plazoExternoDias: 30,
};

/** Restringido: solo lo ven Admin SGC, Gerencia, Control Interno, los asignados a GTH y sus designados (spec §6.4). */
export const GTH_01: FichaDemo = {
  codigo: "GTH-IND-01",
  proceso: "GTH",
  nombre: "Rotación de personal",
  proposito: "Medir la proporción de trabajadores de planta que se retiran en el trimestre, para anticipar la vinculación y la inducción.",
  tipo: "Efectividad",
  clasificacion: "Operativo",
  forma: "porcentaje",
  unidad: "Porcentaje",
  decimales: 1,
  periodicidad: "trimestral",
  tendencia: "descendente",
  meta: "5",
  a: {
    nombre: "Retiros de personal de planta",
    descripcion: "Trabajadores de planta que se retiraron en el trimestre, por cualquier causa",
    fuente: "Novedades de nómina",
    unidad: "personas",
  },
  b: {
    nombre: "Promedio de trabajadores de planta",
    descripcion: "Promedio de los trabajadores de planta al comienzo y al final del trimestre",
    fuente: "Planta de personal",
    unidad: "personas",
    consolidacion: "promedio",
  },
  prueba: ["2", "64"],
  cargo: "Coordinadora de Talento Humano",
  nivelAcceso: "restringido",
};

/** Por aprobar: lo operativo de GTH lo aprueba su líder. */
export const GTH_02: FichaDemo = {
  codigo: "GTH-IND-02",
  proceso: "GTH",
  nombre: "Cumplimiento del plan de capacitación institucional",
  proposito: "Medir la ejecución del plan institucional de capacitación: la inducción, la reinducción y las capacitaciones asistenciales.",
  tipo: "Eficacia",
  clasificacion: "Operativo",
  objetivo: "competencia",
  forma: "porcentaje",
  unidad: "Porcentaje",
  decimales: 1,
  periodicidad: "trimestral",
  tendencia: "ascendente",
  meta: "90",
  a: {
    nombre: "Capacitaciones institucionales ejecutadas",
    descripcion: "Actividades del plan institucional de capacitación ejecutadas en el trimestre",
    fuente: "Plan institucional de capacitación y registros de asistencia",
  },
  b: {
    nombre: "Capacitaciones institucionales programadas",
    descripcion: "Actividades del plan institucional de capacitación programadas para el trimestre",
    fuente: "Plan institucional de capacitación",
  },
  prueba: ["9", "10"],
  cargo: "Coordinadora de Talento Humano",
};

/** En borrador, en el subproceso «Gestión de Cartera»: aún sin quién mida ni prueba de la fórmula. */
export const GRF_01: FichaDemo = {
  codigo: "GRF-IND-01",
  proceso: "GRF",
  subproceso: "gestion-de-cartera",
  nombre: "Recaudo de cartera corriente",
  proposito: "Medir qué parte de la facturación radicada a las entidades responsables de pago se recauda dentro del mes.",
  tipo: "Eficacia",
  clasificacion: "Estratégico",
  objetivo: "finanzas",
  forma: "porcentaje",
  unidad: "Porcentaje",
  decimales: 1,
  periodicidad: "mensual",
  tendencia: "ascendente",
  meta: "85",
  a: {
    nombre: "Recaudo de cartera corriente",
    descripcion: "Valor recaudado en el mes de la facturación radicada hace menos de 60 días",
    fuente: "Estado de cartera de tesorería",
    unidad: "pesos",
  },
  b: {
    nombre: "Cartera corriente radicada",
    descripcion: "Valor de la facturación radicada hace menos de 60 días, al cierre del mes anterior",
    fuente: "Estado de cartera de tesorería",
    unidad: "pesos",
  },
  cargo: "Subgerente Administrativo",
};

/**
 * En el subproceso «Gestión Contable» (sigla `CNT`), con el código de la 14A (`SIGLA-ID-NNN`) y los rangos escritos por
 * estado: Bien desde 91 aunque la meta sea 100. Un resultado de 95 es «Bien» sin alcanzar la meta (spec 14A §3).
 */
export const CNT_01: FichaDemo = {
  codigo: "CNT-ID-001",
  proceso: "GRF",
  subproceso: "gestion-contable",
  nombre: "Oportunidad en el cierre contable",
  proposito: "Medir qué parte de las conciliaciones y los registros contables del mes queda lista dentro del plazo del cierre.",
  tipo: "Eficacia",
  clasificacion: "Estratégico",
  objetivo: "finanzas",
  forma: "porcentaje",
  unidad: "Porcentaje",
  decimales: 1,
  periodicidad: "mensual",
  tendencia: "ascendente",
  meta: "100",
  rangos: {
    bien: [{ signo: ">=", valor: "91" }],
    atencion: [{ signo: "entre", valor: "41", hasta: "90" }],
    critico: [{ signo: "<=", valor: "40" }],
  },
  a: {
    nombre: "Cierres contables entregados a tiempo",
    descripcion: "Conciliaciones y registros del mes entregados dentro del plazo del cierre",
    fuente: "Calendario de cierre y software contable",
  },
  b: {
    nombre: "Cierres contables programados",
    descripcion: "Conciliaciones y registros que el calendario de cierre exige en el mes",
    fuente: "Calendario de cierre contable",
  },
  prueba: ["19", "20"],
  cargo: "Subgerente Administrativo",
};

// ── La 14C: el dato compartido, la dimensión «Sede» y las fichas que los usan (anexo 14C, §10) ─────────────────────────

/** Un dato compartido de la demo (anexo 14C, §4.1), con quienes responden por él. */
export type DatoDemo = {
  proceso: string;
  nombre: string;
  descripcion: string;
  fuente: string;
  unidad: string;
  periodicidad: Periodicidad;
  consolidacion: Consolidacion;
  plazoReporteDias: number;
};

/**
 * Las consultas de medicina general del mes, de todas las sedes: lo reporta una vez quien responde por él y lo toman el uso
 * de la agenda (mensual, mixto) y las consultas del trimestre (trimestral, sin variables propias).
 */
export const DATO_CONSULTAS: DatoDemo = {
  proceso: "CEX",
  nombre: "Consultas de medicina general realizadas",
  descripcion: "Consultas de medicina general atendidas en el mes en todas las sedes, de primera vez y de control; no incluye las de urgencias.",
  fuente: "Registro individual de prestación de servicios (RIPS) de consulta externa",
  unidad: "consultas",
  periodicidad: "mensual",
  consolidacion: "suma",
  plazoReporteDias: PLAZO_DE_REPORTE,
};

/** La dimensión de la desagregación (anexo 14C, §5.1), con cuatro sedes ficticias. */
export const SEDE = { nombre: "Sede", categorias: ["Sede principal", "Puesto de salud Norte", "Puesto de salud Sur", "Puesto de salud Oriente"] };

/** Lo común de las fichas de consulta externa de la 14C: operativas (las aprueba el líder), medidas por el médico coordinador. */
const deConsultaExterna = {
  proceso: "CEX",
  subproceso: "medicina-general",
  clasificacion: "Operativo",
  decimales: 1,
  tendencia: "ascendente",
  cargo: "Médico Coordinador",
} as const;

/** Mixto: A es el dato compartido y B la digita quien mide (anexo 14C, §3.1). */
export const CEX_AGENDA: FichaDemo14C = {
  ...deConsultaExterna,
  codigo: "CEX-ID-001",
  nombre: "Uso de la agenda de medicina general",
  proposito: "Medir qué parte de las consultas de medicina general ofertadas en la agenda se realizó, para ajustar la oferta de cada mes.",
  tipo: "Eficiencia",
  forma: "porcentaje",
  unidad: "Porcentaje",
  periodicidad: "mensual",
  meta: "90",
  variables: [
    { letra: "A", origen: "compartida", dato: DATO_CONSULTAS.nombre },
    {
      letra: "B",
      origen: "propia",
      nombre: "Consultas ofertadas en la agenda",
      descripcion: "Cupos de consulta de medicina general abiertos en la agenda del mes, en todas las sedes",
      fuente: "Sistema de agendamiento de citas",
      unidad: "consultas",
    },
  ],
  prueba: { A: "1712", B: "1840" },
};

/** Sin variables propias: nadie lo mide; se calcula cuando están los tres meses del dato (anexo 14C, §4.5). */
export const CEX_CONSULTAS_TRIMESTRE: FichaDemo14C = {
  ...deConsultaExterna,
  codigo: "CEX-ID-002",
  nombre: "Consultas de medicina general del trimestre",
  proposito: "Seguir cada trimestre la producción de consultas de medicina general frente a la meta pactada con las aseguradoras.",
  tipo: "Eficacia",
  forma: "conteo",
  unidad: "Número",
  decimales: 0,
  periodicidad: "trimestral",
  meta: "5000",
  variables: [{ letra: "A", origen: "compartida", dato: DATO_CONSULTAS.nombre }],
};

/** Desagregado por sede (anexo 14C, §5): cada fila de la rejilla es una sede y el total lo escribe el sistema. */
export const CEX_HIPERTENSION: FichaDemo14C = {
  ...deConsultaExterna,
  codigo: "CEX-ID-003",
  nombre: "Adherencia a la guía de hipertensión arterial",
  proposito: "Medir en cada sede qué parte de los pacientes hipertensos auditados recibió el manejo que pide la guía adoptada.",
  tipo: "Eficacia",
  forma: "porcentaje",
  unidad: "Porcentaje",
  periodicidad: "mensual",
  meta: "85",
  dimension: SEDE.nombre,
  variables: [
    {
      letra: "A",
      origen: "propia",
      nombre: "Pacientes con manejo adherente a la guía",
      descripcion: "Pacientes hipertensos auditados cuya historia cumple los criterios de manejo de la guía",
      fuente: "Auditoría mensual de historias clínicas",
      unidad: "pacientes",
    },
    {
      letra: "B",
      origen: "propia",
      nombre: "Pacientes hipertensos auditados",
      descripcion: "Historias de pacientes hipertensos atendidos en el mes que se auditaron en la sede",
      fuente: "Auditoría mensual de historias clínicas",
      unidad: "pacientes",
    },
  ],
  prueba: { A: "45", B: "50" },
};

/** Lo común de los compuestos del SGC de la 14C: estratégicos (aprueba Gerencia), porcentaje de 0 a 100, sin variables propias. */
const compuestoDelSgc = {
  proceso: "SGC",
  clasificacion: "Estratégico",
  forma: "libre",
  unidad: "Porcentaje",
  decimales: 1,
  periodicidad: "trimestral",
  tendencia: "ascendente",
  meta: "90",
  cargo: "Líder de Calidad",
} as const;

/** Toma el cumplimiento de cinco indicadores trimestrales del SGC (anexo 14C, §6.2); no el de «no conformidades», que no aplicó. */
export const SGC_INDICE: FichaDemo14C = {
  ...compuestoDelSgc,
  codigo: "SGC-ID-003",
  nombre: "Índice de desempeño del SGC",
  proposito: "Seguir en un solo número cuánto se cumplen las metas de los indicadores trimestrales del sistema de gestión de calidad.",
  requisito: "NTC ISO 9001:2015 - Numeral 9.1.3",
  tipo: "Eficacia",
  formula: "(A + B + C + D + E) / 5",
  variables: [
    { letra: "A", origen: "indicador", codigo: SGC_01.codigo, toma: "cumplimiento", nombre: "Cumplimiento de la meta de auditorías internas" },
    { letra: "B", origen: "indicador", codigo: SGC_02.codigo, toma: "cumplimiento", nombre: "Cumplimiento de la meta de acciones correctivas" },
    { letra: "C", origen: "indicador", codigo: SGC_05.codigo, toma: "cumplimiento", nombre: "Cumplimiento de la meta de información documentada" },
    { letra: "D", origen: "indicador", codigo: SGC_06.codigo, toma: "cumplimiento", nombre: "Cumplimiento de la meta de capacitación en calidad" },
    { letra: "E", origen: "indicador", codigo: SGC_07.codigo, toma: "cumplimiento", nombre: "Cumplimiento de la meta de riesgos y oportunidades" },
  ],
};

/**
 * Restringido porque toma uno restringido (anexo 14C, §6.1), y por eso lo aprueba Gerencia. Es del SGC, no de consulta
 * externa: un restringido lo ve quien está asignado a su proceso, y `consulta` lo está a consulta externa. `lider.cex` lo ve
 * porque le hace seguimiento; ve el componente de consulta externa (mensual: en el trimestre, su acumulado) y no el de
 * talento humano.
 */
export const SGC_INDICE_RESTRINGIDO: FichaDemo14C = {
  ...compuestoDelSgc,
  codigo: "SGC-ID-004",
  nombre: "Índice de capacidad de atención",
  proposito: "Seguir en un solo número el cumplimiento de las metas de talento humano y de oportunidad de la cita, para la revisión por la dirección.",
  tipo: "Efectividad",
  formula: "(A + B) / 2",
  nivelAcceso: "restringido",
  variables: [
    { letra: "A", origen: "indicador", codigo: GTH_01.codigo, toma: "cumplimiento", nombre: "Cumplimiento de la meta de talento humano" },
    { letra: "B", origen: "indicador", codigo: CEX_01.codigo, toma: "cumplimiento", nombre: "Cumplimiento de la meta de oportunidad de la cita" },
  ],
};
