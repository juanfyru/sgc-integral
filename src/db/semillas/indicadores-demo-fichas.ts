/**
 * Las fichas de los indicadores de la demo (spec 14 §22) y los objetivos que miden: los ocho del Excel del usuario
 * (`SGC-IND-01` a `SGC-IND-08`, con su nombre, su objetivo, su fórmula, sus variables con su fuente, su meta y su
 * periodicidad), uno más del SGC que se retira y los ficticios de urgencias, talento humano, consulta externa y cartera.
 * Los textos son del dominio, no de la entidad. `indicadores-demo.ts` las crea y las mueve por las funciones del dominio.
 */
import type { DatosFicha } from "../../lib/esquemas/indicadores";
import type { Consolidacion, Periodicidad } from "../../lib/indicadores/tipos";

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
  ente?: string;
  periodicidadExterna?: Periodicidad;
  /**
   * La línea base, donde la hay (valor y periodo); sin ella, la ficha dice «Sin línea base: <año> es el año de referencia»,
   * como la propone el formulario (spec §7.2: una de las dos formas es obligatoria).
   */
  lineaBase?: { valor: string; periodo: string };
};

/** Los ids de lo que la ficha cita, que salen de la base sembrada. */
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

/** El formulario de la ficha, como lo dejaría la persona: el semáforo relativo con el umbral de la configuración (70 %). */
export function datosDeFicha(cat: Catalogo, f: FichaDemo, op: OperacionDemo): DatosFicha {
  const cargo = cat.cargo(f.cargo);
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
    variables: [variable("A", f.a), variable("B", f.b)],
    unidadId: cat.unidad(f.unidad),
    decimales: f.decimales,
    periodicidad: f.periodicidad,
    tendencia: f.tendencia,
    meta: f.meta,
    semaforoModo: "relativo",
    umbralAtencionPct: 70,
    cargosMedir: [cargo],
    cargosAnalizar: [cargo],
    normaIds: f.norma ? [cat.norma(f.norma)] : [],
    ...(f.ente ? { ente: f.ente } : {}),
    ...(f.periodicidadExterna ? { periodicidadExterna: f.periodicidadExterna } : {}),
    ...(op.motivoCambio ? { motivoCambio: op.motivoCambio } : {}),
    ...(f.prueba ? { prueba: { valores: { A: f.prueba[0], B: f.prueba[1] } } } : {}),
    ...(f.lineaBase
      ? { lineaBaseValor: f.lineaBase.valor, lineaBasePeriodo: f.lineaBase.periodo }
      : { lineaBaseNota: `Sin línea base: ${op.inicio.slice(0, 4)} es el año de referencia` }),
    plazoReporteDias: PLAZO_DE_REPORTE,
    inicioMedicion: op.inicio,
    soporteObligatorio: false,
    nivelAcceso: f.nivelAcceso ?? "general",
    mide: op.mide,
    analiza: op.analiza,
  };
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

/** Regulatorio: cita la Resolución 256 de 2016, que ya está en el normograma de la demo (spec §22). */
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
  periodicidadExterna: "semestral",
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
