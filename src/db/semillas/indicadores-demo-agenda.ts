/**
 * La historia de los indicadores de la demo (spec 14 §22) como datos: el calendario contado desde el reloj de la siembra
 * (`calendarioDeIndicadores`) y cada hecho con la hora en que ocurrió, en orden (`agendaDeIndicadores`). Es pura: sin base
 * y sin sesiones. `indicadores-demo.ts` la corre por las funciones del dominio y los tests la leen para saber, cualquier
 * día que se siembre, qué periodos quedan reportados, cuál vencido y cuál sin dato.
 *
 * La regla de los periodos: lo que terminó hace más que su plazo de reporte (`PLAZO_DE_REPORTE`) ya se reportó; lo que
 * terminó hace menos, queda por reportar, sin vencer. Las dos excepciones son a propósito, en urgencias: un mes vencido
 * (`meses[2]`) y uno que nadie reportó y que el cierre deja sin dato (`meses[4]`). Lo que calcula el sistema (anexo 14B,
 * §11: `SGC-IND-03` desde su versión 2 y las fichas `SGC-ID-001` y `SGC-ID-002`) no lo reporta nadie: lo fotografía la
 * pasada (`fotos`) o, al final de la siembra, `tomarFotos`.
 *
 * La 14C (anexo §10) añade su historia (`de14C`) con el plan de su dato compartido (`planDe14C`): un mes pendiente, uno
 * corregido que cierra el cierre del mes, uno con soporte (lo sube el final de la siembra) y un trimestre completo.
 */
import { periodoDe, type Periodo } from "../../lib/indicadores-documentales/periodo";
import { anterior, clavesFinas, fechaLimiteDeReporte, periodoQueContiene, periodosTerminados } from "../../lib/indicadores/periodos";
import type { Periodicidad, Semaforo } from "../../lib/indicadores/tipos";
import { fechaEnZona } from "../../lib/tramites/plazos";
import { zonaHoraria } from "../../lib/zona-horaria";
import { minutosDespues, momentoHace } from "./distribucion-demo";
import {
  AIN_01,
  CEX_01,
  CEX_AGENDA,
  CEX_CONSULTAS_TRIMESTRE,
  CEX_HIPERTENSION,
  CNT_01,
  DATO_CONSULTAS,
  DEL_SGC,
  FUENTE_PRECISADA,
  GRF_01,
  GTH_01,
  GTH_02,
  MOTIVO_SGC_03_AUTOMATICA,
  PLAZO_DE_REPORTE,
  SEDE,
  SGC_03,
  SGC_03_AUTOMATICA,
  SGC_04,
  SGC_05,
  SGC_CONFORMIDAD,
  SGC_INDICE,
  SGC_INDICE_RESTRINGIDO,
  SGC_REPORTES,
  type DatoDemo,
  type FichaDemo,
  type FichaDemo14C,
} from "./indicadores-demo-fichas";

const MS_HORA = 3_600_000;
const MS_DIA = 24 * MS_HORA;

// ── Calendario ──────────────────────────────────────────────────────────────────────────────────────────────────────

/** El periodo de la clave, que siempre es válida aquí. */
const periodo = (clave: string, zona: string): Periodo => periodoDe(clave, zona)!;
const elAnterior = (p: Periodo, zona: string): Periodo => periodo(anterior(p.clave), zona);
const elQueContiene = (p: Periodicidad, instante: Date, zona: string): Periodo => periodoQueContiene(p, instante, zona);

/** A las `hora` del día `dias` contado desde el comienzo del periodo (el día 0 es el primero). */
const enDia = (p: Periodo, dias: number, hora: number): Date => new Date(p.desde.getTime() + dias * MS_DIA + hora * MS_HORA);

export type CalendarioDeIndicadores = {
  /**
   * Del más antiguo al más reciente: los dos primeros son históricos del SGC; el último es el último trimestre que terminó
   * hace más que el plazo de reporte, el primero que se reporta. Sembrando en noviembre de 2026, los tres primeros de 2026.
   */
  trimestres: [Periodo, Periodo, Periodo];
  /** El que sigue al último sembrado (en curso, o terminado y en plazo): desde él rige el cambio mayor de `SGC-IND-05`. */
  trimestreSiguiente: Periodo;
  /** Los históricos de `SGC-IND-03` y `SGC-IND-04`: el último semestre y el último año que terminaron antes de la aprobación. */
  semestreHistorico: Periodo;
  anioHistorico: Periodo;
  /**
   * `meses[1]` es el último mes que terminó hace más que el plazo de reporte y `meses[k]`, el de `k - 1` meses antes;
   * `meses[0]` es el siguiente a `meses[1]`: el de la siembra o, en sus primeros días, el anterior, aún en plazo.
   */
  meses: Periodo[];
  /** El mes y el trimestre de la siembra: desde ellos se miden las fichas que aún no se aprueban. */
  mesEnCurso: Periodo;
  trimestreEnCurso: Periodo;
  /** La aprobación en bloque de las fichas del SGC, en la tercera semana del último trimestre sembrado. */
  aprobacionSgc: Date;
  /** La aprobación de los dos mensuales (urgencias y consulta externa), en `meses[6]`: desde ella `CEX-IND-01` se reporta al ente. */
  aprobacionMensuales: Date;
  /** El cierre de `meses[3]`, a mediados de `meses[2]`. */
  cierre: Date;
  /** El mes anterior al de la siembra: en él se aprueba `SGC-ID-002` (conformidad) y es el mes que ya fotografió. */
  mesAnterior: Periodo;
  /** Cuatro meses antes del de la siembra: en él se aprueba y empieza `SGC-ID-001` («Reportes a tiempo» del SGC). */
  mesDeReportes: Periodo;
  /**
   * Desde dónde rige la versión 2 de `SGC-IND-03`, la automática: el último semestre que terminó hace más que el plazo de
   * reporte. Si el semestre de la aprobación del SGC aún no había terminado, es el histórico (`semestreHistorico`) y su
   * cambio se hace después del cierre (que lo cerraría ya fotografiado: «Volver a calcular» no vale sobre una cerrada); si
   * ya terminó, es ese, ordinario, y su cambio se hace al día siguiente de terminar, antes de que un cierre lo deje sin dato.
   */
  semestreAutomatico: Periodo;
  /**
   * El cambio mayor de `SGC-IND-03`: lo abre y lo envía la coordinadora en `cambio`, Gerencia lo aprueba en `aprobacion` y la
   * pasada de `foto` lo calcula (`null` si esa hora no ha llegado: lo calcula `tomarFotos` al final de la siembra), con el
   * color `esperado`. `analisis`: cuándo analiza la coordinadora el «Crítico» del semestre ordinario, si llegó su foto.
   */
  sgc03: { cambio: Date; aprobacion: Date; foto: Date | null; esperado: Semaforo; analisis: Date | null };
};

export function calendarioDeIndicadores(ahora: Date, zona: string = zonaHoraria()): CalendarioDeIndicadores {
  // Lo que terminó antes de este momento ya pasó su plazo de reporte.
  const limite = momentoHace(PLAZO_DE_REPORTE, ahora);
  const siguiente = elQueContiene("trimestral", limite, zona);
  const ultimo = elAnterior(siguiente, zona);
  const medio = elAnterior(ultimo, zona);
  const primero = elAnterior(medio, zona);
  const aprobacionSgc = enDia(ultimo, 14, 10);
  const meses = [elQueContiene("mensual", limite, zona)];
  for (let k = 1; k <= 6; k++) meses.push(elAnterior(meses[k - 1], zona));
  const mesEnCurso = elQueContiene("mensual", ahora, zona);
  const semestreHistorico = elAnterior(elQueContiene("semestral", aprobacionSgc, zona), zona);
  const semestreAutomatico = elAnterior(elQueContiene("semestral", limite, zona), zona);
  let mesDeReportes = mesEnCurso;
  for (let k = 0; k < 4; k++) mesDeReportes = elAnterior(mesDeReportes, zona);
  return {
    trimestres: [primero, medio, ultimo],
    trimestreSiguiente: siguiente,
    semestreHistorico,
    anioHistorico: elAnterior(elQueContiene("anual", aprobacionSgc, zona), zona),
    meses,
    mesEnCurso,
    trimestreEnCurso: elQueContiene("trimestral", ahora, zona),
    aprobacionSgc,
    aprobacionMensuales: enDia(meses[6], 2, 10),
    cierre: enDia(meses[2], 14, 17),
    mesAnterior: elAnterior(mesEnCurso, zona),
    mesDeReportes,
    semestreAutomatico,
    sgc03: cambioDeSgc03(semestreAutomatico.clave === semestreHistorico.clave, siguiente, ahora),
  };
}

/**
 * Las horas del cambio mayor de `SGC-IND-03` (ver `semestreAutomatico`). Con el semestre histórico: hace nueve días, después
 * del cierre; lo aprueba Gerencia al día siguiente y la pasada lo calcula una hora después, sin esperar (un histórico de un
 * cálculo que se llena hacia atrás). Sale en «Atención»: de los tres objetivos de calidad cumplen dos (de la última medición
 * histórica del semestre, auditorías 5 de 6 no alcanza el 90; documentos 46 de 50, riesgos 7 de 9 y capacitación 4 de 4,
 * sí), 66,7 % frente a 80. Con el semestre ordinario: el día siguiente a terminar, después de los reportes de la
 * coordinadora; la pasada lo calcula cuando vence su plazo de reporte (el día 11, a las 7:12 a. m.) y sale en «Crítico»: de
 * los tres objetivos cumple uno (auditorías en Crítico y capacitación en Bien sin alcanzar su meta programada de 90 no
 * cumplen; documentos y riesgos, sí), 33,3 %. Ese «Crítico» lo analiza la coordinadora al día siguiente.
 */
function cambioDeSgc03(historico: boolean, siguiente: Periodo, ahora: Date): CalendarioDeIndicadores["sgc03"] {
  if (historico) {
    const aprobacion = momentoHace(8, ahora);
    return { cambio: momentoHace(9, ahora), aprobacion, foto: minutosDespues(aprobacion, 60), esperado: "atencion", analisis: null };
  }
  const foto = enDia(siguiente, 10, 7.2);
  const analisis = enDia(siguiente, 11, 10);
  const llego = foto.getTime() < ahora.getTime();
  return {
    cambio: enDia(siguiente, 1, 15),
    aprobacion: enDia(siguiente, 2, 9),
    foto: llego ? foto : null,
    esperado: "critico",
    analisis: llego && analisis.getTime() < ahora.getTime() ? analisis : null,
  };
}

/** Lo que la demo deja de las constancias de envío de `CEX-IND-01` (anexo 14B, §8). */
export type PlanDeConstancias = {
  /** Las que nacen a la hora de la siembra, de la más antigua a la más reciente: los trimestres que terminaron desde que se reporta. */
  periodos: { clave: string; vence: Date }[];
  /** La que registra `lider.cex`, con su soporte, la fecha en que dice que la envió y su radicado. */
  registrada: string;
  fechaEnvio: string;
  radicado: string;
};

/**
 * Las constancias de `CEX-IND-01` a la hora de la siembra: una por trimestre que terminó después de su aprobación (con
 * ella empezó a reportarse al ente, `ente_desde`), cada una con su fecha límite de 30 días. Desde `meses[6]` siempre han
 * terminado al menos dos trimestres y al menos uno ya venció. Se registra la más antigua si quedan otras vencidas; si solo
 * venció la más antigua, se registra la siguiente (enviada antes de vencer) y la vencida queda para el recorrido. La fecha
 * de envío es veinte días después del fin del trimestre, o ayer si ese día no ha llegado.
 */
export function constanciasDeLaDemo(ahora: Date, zona: string = zonaHoraria()): PlanDeConstancias {
  const { aprobacionMensuales: desde } = calendarioDeIndicadores(ahora, zona);
  const externa = CEX_01.periodicidadExterna!;
  const periodos = periodosTerminados(externa, periodoQueContiene(externa, desde, zona).clave, ahora, zona)
    .filter((p) => p.hasta.getTime() > desde.getTime())
    .map((p) => ({ periodo: p, vence: fechaLimiteDeReporte(p, CEX_01.plazoExternoDias!, zona) }));
  if (periodos.length < 2) throw new Error(`La demo esperaba al menos dos trimestres de CEX-IND-01 terminados y hay ${periodos.length}`);
  const vencidas = periodos.filter((c) => c.vence.getTime() < ahora.getTime()).length;
  if (vencidas === 0) throw new Error("La demo esperaba al menos una constancia de CEX-IND-01 vencida");
  const registrada = periodos[vencidas >= 2 ? 0 : 1].periodo;
  const enviada = new Date(Math.max(registrada.hasta.getTime(), Math.min(registrada.hasta.getTime() + 20 * MS_DIA, momentoHace(1, ahora).getTime())));
  const fechaEnvio = fechaEnZona(enviada, zona);
  return {
    periodos: periodos.map((c) => ({ clave: c.periodo.clave, vence: c.vence })),
    registrada: registrada.clave,
    fechaEnvio,
    radicado: `MSPS-${fechaEnvio.slice(0, 4)}-018734`,
  };
}

// ── Los hechos ──────────────────────────────────────────────────────────────────────────────────────────────────────

/** Las personas de la demo que actúan en la historia. */
export type Quien = "coordinadora" | "gerente" | "controlInterno" | "liderGth" | "liderCex" | "jefeUrgencias" | "consulta";

/** Una fila histórica: periodo, A, B y el color que debe dejar. */
export type FilaHistorica = [string, string, string, Semaforo];

/** Una fila de la rejilla de un desagregado (anexo 14C, §5.4): la categoría por su nombre, con A y B o con su «No aplica». */
export type FilaDeRejilla = { categoria: string; valores: [string, string] } | { categoria: string; noAplica: string };

export type Hecho =
  /** La coordinadora crea la ficha; `responsable` mide (si la ficha tiene variables propias) y analiza. */
  | { tipo: "crear"; ficha: FichaDemo | FichaDemo14C; inicio: string; responsable: Quien | null }
  /** La coordinadora la envía a aprobación con su firma «Elaboró». */
  | { tipo: "enviar"; codigo: string }
  /** Firma «Aprobó» en bloque la versión más reciente de cada código. */
  | { tipo: "aprobar"; quien: Quien; codigos: string[] }
  | { tipo: "seguimiento"; codigo: string; quien: Quien }
  | { tipo: "historicos"; codigo: string; filas: FilaHistorica[] }
  | { tipo: "meta"; codigo: string; periodo: string; meta: string }
  /**
   * Quien mide reporta A y B o, en un mixto, solo lo suyo (`valores` por letra). `esperado` es el color que deja o, si aún
   * falta lo ajeno, «Falta un dato» (`falta_dato`).
   */
  | {
      tipo: "reportar";
      quien: Quien;
      codigo: string;
      periodo: string;
      valores: [string, string] | Record<string, string>;
      esperado: Semaforo | "falta_dato";
    }
  /** Quien mide reporta un desagregado por su rejilla: el total queda en `esperado` y en Crítico quedan `enCritico`. */
  | { tipo: "rejilla"; quien: Quien; codigo: string; periodo: string; filas: FilaDeRejilla[]; esperado: Semaforo; enCritico: string[] }
  /** La coordinadora crea la dimensión con sus categorías, todas con la hora del paso: desde ella las piden los periodos. */
  | { tipo: "dimension"; nombre: string; categorias: string[] }
  /** La coordinadora crea el dato compartido y designa a quienes responden por él (anexo 14C, §4.1). */
  | { tipo: "dato"; dato: DatoDemo; responsables: Quien[] }
  /** Quien responde por el dato reporta un periodo o, si ya estaba reportado, lo corrige (anexo 14C, §4.4). */
  | { tipo: "reportarDato"; quien: Quien; dato: string; periodo: string; valor: string }
  | { tipo: "noAplica"; quien: Quien; codigo: string; periodo: string; motivo: string }
  | { tipo: "analizar"; quien: Quien; codigo: string; periodo: string; textos: { analisis?: string; causa?: string; accionPropuesta?: string } }
  | { tipo: "observar"; quien: Quien; codigo: string; periodo: string; texto: string }
  | { tipo: "retirar"; codigo: string; motivo: string }
  | { tipo: "cerrarMes"; mes: string }
  | { tipo: "reabrir"; codigo: string; periodo: string; justificacion: string }
  | { tipo: "cerrarDeNuevo"; codigo: string; periodo: string }
  /**
   * Un cambio sobre la ficha vigente: abre la versión siguiente, la guarda y la envía (el sistema decide si es mayor); un
   * cambio mayor rige desde `rigeDesde` o, sin él, desde el periodo por omisión.
   */
  | { tipo: "cambiar"; codigo: string; ficha: FichaDemo; motivo: string; rigeDesde?: string }
  /** La pasada de esa hora toma las fotos que tocan (`tomarFotos`); cada medición de `esperado` debe quedar con ese color. */
  | { tipo: "fotos"; esperado: { codigo: string; periodo: string; semaforo: Semaforo }[] };

export type Paso = { momento: Date; hecho: Hecho };

/** La historia de los indicadores de la demo, en el orden de su hora (el cierre del mes alcanza solo lo que ya pasó). */
export function agendaDeIndicadores(ahora: Date, zona: string = zonaHoraria()): Paso[] {
  const cal = calendarioDeIndicadores(ahora, zona);
  const agenda: Paso[] = [];
  const en = (momento: Date, hecho: Hecho) => agenda.push({ momento, hecho });
  urgenciasYConsultaExterna(cal, en);
  sgcYTalentoHumano(cal, zona, en);
  contabilidad(cal, en);
  en(cal.cierre, { tipo: "cerrarMes", mes: cal.meses[3].clave });
  fichasRecientes(cal, ahora, en);
  automaticosDelSgc(cal, en);
  de14C(cal, ahora, zona, en);
  return agenda
    .map((p, i) => ({ p, i }))
    .sort((x, y) => x.p.momento.getTime() - y.p.momento.getTime() || x.i - y.i)
    .map(({ p }) => p);
}

type En = (momento: Date, hecho: Hecho) => void;

/** Crear y, cinco minutos después, enviar. */
function crearYEnviar(en: En, momento: Date, ficha: FichaDemo | FichaDemo14C, inicio: string, responsable: Quien): void {
  en(momento, { tipo: "crear", ficha, inicio, responsable });
  en(minutosDespues(momento, 5), { tipo: "enviar", codigo: ficha.codigo });
}

/**
 * Los dos mensuales, aprobados juntos por Gerencia en `meses[6]` y medidos desde él. Urgencias, por la enfermera jefe:
 * dos meses en Bien, `meses[4]` sin reportar (el cierre lo deja sin dato), `meses[3]` en Atención con su análisis,
 * `meses[2]` vencido a propósito y `meses[1]` en Bien. Consulta externa, por su líder: todos reportados; `meses[4]` salió
 * en Atención, se cerró, se reabrió porque el dato estaba mal, se corrigió a Bien y se cerró de nuevo. `meses[0]`, si ya
 * terminó, queda por reportar en los dos.
 */
function urgenciasYConsultaExterna(cal: CalendarioDeIndicadores, en: En): void {
  const m = cal.meses;
  crearYEnviar(en, enDia(m[6], 0, 9), AIN_01, m[6].clave, "jefeUrgencias");
  crearYEnviar(en, enDia(m[6], 0, 11), CEX_01, m[6].clave, "liderCex");
  en(cal.aprobacionMensuales, { tipo: "aprobar", quien: "gerente", codigos: [AIN_01.codigo, CEX_01.codigo] });

  const urgencias = (k: number, valores: [string, string], esperado: Semaforo) =>
    en(enDia(m[k - 1], 2, 9), { tipo: "reportar", quien: "jefeUrgencias", codigo: AIN_01.codigo, periodo: m[k].clave, valores, esperado });
  urgencias(6, ["1160", "40"], "bien");
  urgencias(5, ["1092", "42"], "bien");
  urgencias(3, ["1520", "40"], "atencion");
  en(enDia(m[2], 3, 10), {
    tipo: "analizar",
    quien: "jefeUrgencias",
    codigo: AIN_01.codigo,
    periodo: m[3].clave,
    textos: {
      analisis:
        "La consulta por enfermedad respiratoria aumentó en la segunda quincena y el servicio trabajó dos fines de semana con un médico menos.",
    },
  });
  urgencias(1, ["1080", "40"], "bien");

  const consulta = (k: number, valores: [string, string], esperado: Semaforo) =>
    en(enDia(m[k - 1], 3, 9), { tipo: "reportar", quien: "liderCex", codigo: CEX_01.codigo, periodo: m[k].clave, valores, esperado });
  consulta(6, ["1302", "620"], "bien");
  consulta(5, ["1488", "600"], "bien");
  consulta(4, ["2108", "620"], "atencion");
  en(enDia(m[3], 4, 10), {
    tipo: "analizar",
    quien: "liderCex",
    codigo: CEX_01.codigo,
    periodo: m[4].clave,
    textos: { analisis: "Un médico general salió a vacaciones sin reemplazo y las citas de primera vez se asignaron con más días de espera." },
  });
  consulta(3, ["1612", "620"], "bien");
  consulta(2, ["1736", "620"], "bien");
  consulta(1, ["1674", "620"], "bien");

  // Después del cierre (a mediados de `meses[2]`): la reapertura de `meses[4]`, su corrección y el nuevo cierre.
  en(enDia(m[2], 16, 9), {
    tipo: "reabrir",
    codigo: CEX_01.codigo,
    periodo: m[4].clave,
    justificacion: "El sistema de agendamiento contó dos veces las citas reprogramadas de la jornada extramural; el líder envió el dato corregido.",
  });
  en(enDia(m[2], 16, 15), { tipo: "reportar", quien: "liderCex", codigo: CEX_01.codigo, periodo: m[4].clave, valores: ["1798", "620"], esperado: "bien" });
  en(enDia(m[2], 17, 9), { tipo: "cerrarDeNuevo", codigo: CEX_01.codigo, periodo: m[4].clave });
}

/**
 * `CNT-ID-001` (la de los rangos por estado), mensual: la crea y la envía la coordinadora y Gerencia la aprueba antes de
 * que empiece `meses[2]`, el primer mes que mide. Reporta `meses[2]` en 95, «Bien» que no alcanza la meta de 100 (con su
 * análisis), y `meses[1]` en 100.
 */
function contabilidad(cal: CalendarioDeIndicadores, en: En): void {
  const m = cal.meses;
  crearYEnviar(en, enDia(m[3], 20, 9), CNT_01, m[2].clave, "coordinadora");
  en(enDia(m[3], 22, 10), { tipo: "aprobar", quien: "gerente", codigos: [CNT_01.codigo] });
  en(enDia(m[1], 3, 11), { tipo: "reportar", quien: "coordinadora", codigo: CNT_01.codigo, periodo: m[2].clave, valores: ["95", "100"], esperado: "bien" });
  en(enDia(m[1], 4, 10), {
    tipo: "analizar",
    quien: "coordinadora",
    codigo: CNT_01.codigo,
    periodo: m[2].clave,
    textos: {
      analisis:
        "El cierre quedó en 95 %: la conciliación de las cuentas por pagar llegó dos días tarde porque el proveedor del software demoró el reporte de cartera.",
    },
  });
  en(enDia(m[0], 3, 13), { tipo: "reportar", quien: "coordinadora", codigo: CNT_01.codigo, periodo: m[1].clave, valores: ["100", "100"], esperado: "bien" });
}

/**
 * Los históricos de cada ficha del SGC: los dos trimestres (o el semestre o el año) que terminaron antes de aprobarse. El
 * semestre de `SGC-IND-03` no se registra si es el que después calcula el sistema (`semestreAutomatico`): su versión 2 no
 * podría regir desde un periodo con datos.
 */
function historicosDelSgc(cal: CalendarioDeIndicadores): Record<string, FilaHistorica[]> {
  const [t1, t2] = cal.trimestres.map((t) => t.clave);
  const semestre = cal.semestreHistorico.clave;
  const objetivos: Record<string, FilaHistorica[]> = semestre === cal.semestreAutomatico.clave ? {} : { "SGC-IND-03": [[semestre, "4", "5", "bien"]] };
  return {
    "SGC-IND-01": [[t1, "5", "5", "bien"], [t2, "5", "6", "atencion"]],
    "SGC-IND-02": [[t1, "4", "5", "bien"], [t2, "3", "4", "atencion"]],
    ...objetivos,
    "SGC-IND-04": [[cal.anioHistorico.clave, "1", "1", "bien"]],
    "SGC-IND-05": [[t1, "44", "50", "bien"], [t2, "46", "50", "bien"]],
    "SGC-IND-06": [[t1, "3", "4", "atencion"], [t2, "4", "4", "bien"]],
    "SGC-IND-07": [[t1, "5", "8", "atencion"], [t2, "7", "9", "bien"]],
    "SGC-IND-08": [[t1, "3", "4", "bien"], [t2, "2", "3", "atencion"]],
    "SGC-IND-09": [[t1, "9", "10", "atencion"], [t2, "12", "12", "bien"]],
  };
}

/**
 * Las fichas del SGC se crean en la segunda semana del último trimestre sembrado y Gerencia las aprueba en bloque en la
 * tercera: los dos trimestres anteriores (el semestre o el año, en `SGC-IND-03` y `SGC-IND-04`) quedan históricos y la
 * coordinadora los registra desde el Excel. La de rotación de personal la aprueba `lider.gth` el mismo día. El día
 * siguiente al fin del trimestre se reportan: `SGC-IND-01` en Crítico, con causa, acción y la observación de Control
 * Interno; `SGC-IND-02` en Atención con su análisis; `SGC-IND-06` en Bien sin alcanzar la meta que se le programó (90),
 * con su análisis; `SGC-IND-08` «no
 * aplica»; y el año de `SGC-IND-04` si terminó con el trimestre. `SGC-IND-09` se retira.
 */
function sgcYTalentoHumano(cal: CalendarioDeIndicadores, zona: string, en: En): void {
  const ultimo = cal.trimestres[2];
  const siguiente = cal.trimestreSiguiente;
  const inicioDe = (f: FichaDemo) =>
    f.periodicidad === "semestral" ? cal.semestreHistorico.clave : f.periodicidad === "anual" ? cal.anioHistorico.clave : cal.trimestres[0].clave;

  DEL_SGC.forEach((f, i) => crearYEnviar(en, minutosDespues(enDia(ultimo, 7, 9), i * 10), f, inicioDe(f), "coordinadora"));
  crearYEnviar(en, enDia(ultimo, 7, 15), GTH_01, ultimo.clave, "liderGth");
  en(cal.aprobacionSgc, { tipo: "aprobar", quien: "gerente", codigos: DEL_SGC.map((f) => f.codigo) });
  en(enDia(ultimo, 14, 15), { tipo: "aprobar", quien: "liderGth", codigos: [GTH_01.codigo] });
  // Gerencia hace seguimiento de las auditorías: recibe la alerta del Crítico (spec §10.3).
  en(enDia(ultimo, 15, 9), { tipo: "seguimiento", codigo: "SGC-IND-01", quien: "gerente" });

  Object.entries(historicosDelSgc(cal)).forEach(([codigo, filas], i) =>
    en(minutosDespues(enDia(ultimo, 21, 9), i * 10), { tipo: "historicos", codigo, filas }),
  );
  // Una meta programada distinta de la de la ficha (80), dentro de Bien, antes de que el periodo termine: sin justificación
  // ni marca. El resultado (85 %) queda en Bien sin alcanzar esa meta: un «Bien que no cumple».
  en(enDia(ultimo, 24, 11), { tipo: "meta", codigo: "SGC-IND-06", periodo: ultimo.clave, meta: "90" });

  const reportes: [string, string, [string, string], Semaforo][] = [
    ["SGC-IND-01", ultimo.clave, ["3", "5"], "critico"],
    ["SGC-IND-02", ultimo.clave, ["6", "8"], "atencion"],
    ["SGC-IND-05", ultimo.clave, ["47", "50"], "bien"],
    ["SGC-IND-06", ultimo.clave, ["17", "20"], "bien"],
    ["SGC-IND-07", ultimo.clave, ["8", "10"], "bien"],
  ];
  // El año de la aprobación, si terminó con el último trimestre sembrado (ya pasó su plazo). El semestre de `SGC-IND-03`, en
  // ese caso, ya no lo reporta nadie: es el que calcula el sistema desde su versión 2 (`semestreAutomatico`).
  const anio = elQueContiene("anual", cal.aprobacionSgc, zona);
  if (anio.hasta.getTime() === ultimo.hasta.getTime()) reportes.push([SGC_04.codigo, anio.clave, ["1", "1"], "bien"]);
  reportes.forEach(([codigo, clave, valores, esperado], i) =>
    en(minutosDespues(enDia(siguiente, 1, 9), i * 15), { tipo: "reportar", quien: "coordinadora", codigo, periodo: clave, valores, esperado }),
  );
  en(enDia(siguiente, 1, 11), {
    tipo: "noAplica",
    quien: "coordinadora",
    codigo: "SGC-IND-08",
    periodo: ultimo.clave,
    motivo: "En el trimestre no se cerró ninguna no conformidad ni venció el plazo de ninguna: no hubo casos que medir.",
  });
  en(enDia(siguiente, 1, 14), { tipo: "reportar", quien: "liderGth", codigo: GTH_01.codigo, periodo: ultimo.clave, valores: ["2", "64"], esperado: "bien" });

  en(enDia(siguiente, 2, 10), {
    tipo: "analizar",
    quien: "coordinadora",
    codigo: "SGC-IND-01",
    periodo: ultimo.clave,
    textos: {
      causa:
        "Dos de las cinco auditorías programadas no se ejecutaron: el único auditor interno de los procesos asistenciales estuvo incapacitado y no había un auditor de respaldo formado.",
      accionPropuesta: "Formar dos auditores internos más y reprogramar en el trimestre siguiente las auditorías de Atención Inmediata e Internación.",
    },
  });
  en(enDia(siguiente, 2, 11), {
    tipo: "analizar",
    quien: "coordinadora",
    codigo: "SGC-IND-02",
    periodo: ultimo.clave,
    textos: {
      analisis:
        "Dos de las ocho acciones correctivas evaluadas no eliminaron la causa: el hallazgo de almacenamiento de Gestión de Bienes y Servicios se repitió y se rehízo su análisis de causa con el proceso.",
    },
  });
  // El «Bien que no cumple» pide análisis: sin él quedaría abierta y vencida.
  en(enDia(siguiente, 2, 12), {
    tipo: "analizar",
    quien: "coordinadora",
    codigo: "SGC-IND-06",
    periodo: ultimo.clave,
    textos: {
      analisis:
        "Se ejecutaron 17 de las 20 capacitaciones programadas (85 %): tres sesiones de inducción en calidad se aplazaron por la jornada de vacunación y se reprogramaron para el trimestre siguiente, así que no se alcanzó la meta de 90 % fijada para el trimestre.",
    },
  });
  en(enDia(siguiente, 3, 11), {
    tipo: "retirar",
    codigo: "SGC-IND-09",
    motivo: "La oportunidad de publicación ya se mide sola en los indicadores documentales de Vigencia: no hace falta digitarla aquí.",
  });
  en(enDia(siguiente, 4, 15), {
    tipo: "observar",
    quien: "controlInterno",
    codigo: "SGC-IND-01",
    periodo: ultimo.clave,
    texto: "¿Las dos auditorías reprogramadas quedan dentro del programa anual aprobado? Adjunten el acta del comité que aprobó la reprogramación.",
  });
}

/**
 * En la última semana: el cambio mayor de `SGC-IND-05` (la meta sube a 90: versión 2, aprobada por Gerencia y vigente
 * desde el trimestre siguiente al reportado) y su cambio menor (versión 3: se precisa la fuente de una variable, sin
 * aprobador); la ficha de capacitación institucional, enviada a `lider.gth`; y la de cartera, en borrador.
 */
function fichasRecientes(cal: CalendarioDeIndicadores, ahora: Date, en: En): void {
  const conMetaNueva: FichaDemo = { ...SGC_05, meta: "90" };
  en(momentoHace(7, ahora), {
    tipo: "cambiar",
    codigo: SGC_05.codigo,
    ficha: conMetaNueva,
    motivo: "La revisión por la dirección subió la meta a 90 %: el indicador superó el 85 % en los tres últimos trimestres.",
  });
  en(momentoHace(6, ahora), { tipo: "aprobar", quien: "gerente", codigos: [SGC_05.codigo] });
  en(momentoHace(5, ahora), {
    tipo: "cambiar",
    codigo: SGC_05.codigo,
    ficha: { ...conMetaNueva, b: { ...conMetaNueva.b, fuente: FUENTE_PRECISADA } },
    motivo: "Se precisa la fuente de los documentos revisados: el muestreo trimestral que hace la coordinación de calidad.",
  });
  crearYEnviar(en, momentoHace(3, ahora), GTH_02, cal.trimestreEnCurso.clave, "liderGth");
  en(momentoHace(2, ahora), { tipo: "crear", ficha: GRF_01, inicio: cal.mesEnCurso.clave, responsable: null });
}

/**
 * Lo que calcula el sistema en el SGC (anexo 14B, §11). `SGC-ID-001` («Reportes de indicadores a tiempo» del proceso,
 * mensual, 31 días de plazo) se crea y se aprueba en `mesDeReportes`, desde el que mide. `SGC-ID-002` («Conformidad en
 * puntos de uso, a la fecha», de toda la entidad, meta 90) se aprueba en `mesAnterior`: es el periodo en curso al aprobarse
 * y el que fotografía la siembra. `SGC-IND-03` pasa a «Objetivos cumplidos» de calidad con un cambio mayor que rige desde
 * `semestreAutomatico` (ver `cambioDeSgc03`); la coordinadora analiza su «Crítico» si el semestre es ordinario. El mes de
 * conformidad lo fotografía y lo analiza el final de la siembra (`indicadores-demo.ts`).
 */
function automaticosDelSgc(cal: CalendarioDeIndicadores, en: En): void {
  crearYEnviar(en, enDia(cal.mesDeReportes, 1, 9), SGC_REPORTES, cal.mesDeReportes.clave, "coordinadora");
  en(enDia(cal.mesDeReportes, 2, 10), { tipo: "aprobar", quien: "gerente", codigos: [SGC_REPORTES.codigo] });
  crearYEnviar(en, enDia(cal.mesAnterior, 1, 9), SGC_CONFORMIDAD, cal.mesAnterior.clave, "coordinadora");
  en(enDia(cal.mesAnterior, 2, 10), { tipo: "aprobar", quien: "gerente", codigos: [SGC_CONFORMIDAD.codigo] });

  const { cambio, aprobacion, foto, esperado, analisis } = cal.sgc03;
  const semestre = cal.semestreAutomatico.clave;
  en(cambio, { tipo: "cambiar", codigo: SGC_03.codigo, ficha: SGC_03_AUTOMATICA, motivo: MOTIVO_SGC_03_AUTOMATICA, rigeDesde: semestre });
  en(aprobacion, { tipo: "aprobar", quien: "gerente", codigos: [SGC_03.codigo] });
  if (foto) en(foto, { tipo: "fotos", esperado: [{ codigo: SGC_03.codigo, periodo: semestre, semaforo: esperado }] });
  if (analisis) {
    en(analisis, {
      tipo: "analizar",
      quien: "coordinadora",
      codigo: SGC_03.codigo,
      periodo: semestre,
      textos: {
        causa:
          "De los tres objetivos de calidad solo se cumplió el de información documentada: las auditorías internas quedaron en Crítico y la capacitación en calidad no alcanzó la meta programada del trimestre.",
        accionPropuesta:
          "Llevar a la revisión por la dirección el plan de auditorías con los dos auditores nuevos y la reprogramación de las capacitaciones aplazadas.",
      },
    });
  }
}

// ── La 14C: el dato compartido, la desagregación y los compuestos (anexo 14C, §10) ─────────────────────────────────────

/** Las consultas de medicina general de cada mes (de enero a diciembre): el dato compartido de la demo. */
const CONSULTAS_POR_MES = [1712, 1688, 1745, 1726, 1694, 1758, 1703, 1679, 1737, 1749, 1716, 1731];
/** Las que se ofertaron en la agenda: el uso de la agenda queda en Bien (de 93 % a 96 %) cada mes. */
const OFERTADAS_POR_MES = [1840, 1800, 1830, 1820, 1790, 1840, 1810, 1780, 1820, 1830, 1800, 1810];
/** Lo que faltaba en el primer reporte del mes corregido: el RIPS de un puesto de salud, que llegó tarde. */
export const FALTABA_EN_EL_CORREGIDO = 168;

const numeroDeMes = (p: Periodo) => Number(p.clave.slice(5, 7));
/** Las consultas del mes (el valor bueno, también el del mes corregido). */
export const consultasDe = (p: Periodo): number => CONSULTAS_POR_MES[numeroDeMes(p) - 1];
/** Las consultas ofertadas en la agenda del mes: lo que digita quien mide el uso de la agenda. */
export const ofertadasDe = (p: Periodo): number => OFERTADAS_POR_MES[numeroDeMes(p) - 1];
const elSiguienteMes = (p: Periodo, zona: string): Periodo => elQueContiene("mensual", new Date(p.hasta.getTime() + MS_HORA), zona);
const cierraTrimestre = (p: Periodo) => numeroDeMes(p) % 3 === 0;

/** Lo que la demo deja del dato compartido (anexo 14C, §4), cualquier día que se siembre. */
export type PlanDe14C = {
  /** Los meses del dato que se piden, del más antiguo al más reciente: del primero de `trimestreCompleto` al último terminado. */
  meses: Periodo[];
  /**
   * El que queda pendiente: el último mes terminado después del mes cerrado que cierra un trimestre (al reportarlo quedan
   * calculadas las dos fichas que usan el dato); si no hay ninguno, el último mes terminado.
   */
  pendiente: Periodo;
  /** El mes cerrado (`meses[3]`): su dato llega bajo, lo corrige `lider.cex` antes del cierre y lo cierra el cierre del mes. */
  corregido: Periodo;
  /** Los meses posteriores al pendiente: se reportan ayer. Así el pendiente empieza a pedirse ayer y no nace vencido. */
  tardios: Periodo[];
  /** El más reciente de los reportados después del mes cerrado: lleva el soporte (lo sube el final de la siembra). */
  conSoporte: Periodo;
  /** El trimestre de las consultas del trimestre con sus tres meses antes del cierre (su inicio de medición): cerrado y calculado. */
  trimestreCompleto: Periodo;
  /** El trimestre que espera al pendiente, si ya terminó; `null` si el pendiente no cierra un trimestre. */
  trimestreQueEspera: Periodo | null;
};

export function planDe14C(ahora: Date, zona: string = zonaHoraria()): PlanDe14C {
  const cal = calendarioDeIndicadores(ahora, zona);
  const corregido = cal.meses[3];
  const despues = periodosTerminados("mensual", cal.meses[2].clave, ahora, zona);
  const pendiente = despues.filter(cierraTrimestre).at(-1) ?? despues.at(-1)!;
  const delPendiente = elQueContiene("trimestral", pendiente.desde, zona);
  const trimestreCompleto = elAnterior(delPendiente, zona);
  const meses = periodosTerminados("mensual", clavesFinas(trimestreCompleto.clave, "mensual")[0], ahora, zona);
  return {
    meses,
    pendiente,
    corregido,
    tardios: meses.filter((m) => m.desde.getTime() > pendiente.desde.getTime()),
    conSoporte: despues.filter((m) => m.clave !== pendiente.clave).at(-1)!,
    trimestreCompleto,
    trimestreQueEspera: cierraTrimestre(pendiente) ? delPendiente : null,
  };
}

/** El motivo del «No aplica» de una sede en la segunda rejilla. */
export const MOTIVO_SEDE_CERRADA = "El puesto de salud estuvo cerrado todo el mes por el arreglo de la planta física: no hubo consulta.";

/** Las filas de la rejilla de `CEX-ID-003` en `meses[2]` y `meses[1]`, con lo que deja cada una. */
export const REJILLAS: { filas: FilaDeRejilla[]; esperado: Semaforo; enCritico: string[] }[] = [
  {
    // 94 de 110 (85,5 %): el total en Bien y el Puesto de salud Oriente en Crítico (55 %), con su aviso.
    filas: [
      { categoria: SEDE.categorias[0], valores: ["46", "50"] },
      { categoria: SEDE.categorias[1], valores: ["18", "20"] },
      { categoria: SEDE.categorias[2], valores: ["19", "20"] },
      { categoria: SEDE.categorias[3], valores: ["11", "20"] },
    ],
    esperado: "bien",
    enCritico: [SEDE.categorias[3]],
  },
  {
    // El Norte sin pacientes auditados («Sin casos», lo pone el sistema) y el Sur cerrado («No aplica»): 57 de 64 (89,1 %).
    filas: [
      { categoria: SEDE.categorias[0], valores: ["41", "46"] },
      { categoria: SEDE.categorias[1], valores: ["0", "0"] },
      { categoria: SEDE.categorias[2], noAplica: MOTIVO_SEDE_CERRADA },
      { categoria: SEDE.categorias[3], valores: ["16", "18"] },
    ],
    esperado: "bien",
    enCritico: [],
  },
];

/**
 * La historia de la 14C. En `meses[6]` la coordinadora crea la dimensión «Sede» y el dato compartido, del que responden
 * `consulta` y `lider.cex`, y las dos fichas que lo usan, que aprueba `lider.cex`: el uso de la agenda (mensual, mixto,
 * desde el mes cerrado) y las consultas del trimestre (trimestral, sin variables propias, desde `trimestreCompleto`).
 * `consulta` reporta cada mes del dato el día 4 del siguiente, salvo el pendiente y los tardíos (ayer); el del mes cerrado
 * llega bajo y `lider.cex` lo corrige antes del cierre, con lo que el uso de la agenda pasa de Atención a Bien. `lider.cex`
 * reporta lo suyo del uso de la agenda el día 5. La desagregada por sede se aprueba en `meses[3]`, se mide desde
 * `meses[2]` (`REJILLAS`) y la coordinadora le hace seguimiento. Los dos compuestos del SGC los aprueba Gerencia en el
 * último trimestre sembrado, después de sus componentes y antes de que termine; `lider.cex` hace seguimiento del
 * restringido.
 */
function de14C(cal: CalendarioDeIndicadores, ahora: Date, zona: string, en: En): void {
  const plan = planDe14C(ahora, zona);
  const m = cal.meses;
  const inicio = enDia(m[6], 0, 8);
  en(inicio, { tipo: "dimension", nombre: SEDE.nombre, categorias: SEDE.categorias });
  en(minutosDespues(inicio, 20), { tipo: "dato", dato: DATO_CONSULTAS, responsables: ["consulta", "liderCex"] });
  crearYEnviar(en, enDia(m[6], 1, 9), CEX_AGENDA, plan.corregido.clave, "liderCex");
  crearYEnviar(en, enDia(m[6], 1, 10), CEX_CONSULTAS_TRIMESTRE, plan.trimestreCompleto.clave, "liderCex");
  en(enDia(m[6], 2, 15), { tipo: "aprobar", quien: "liderCex", codigos: [CEX_AGENDA.codigo, CEX_CONSULTAS_TRIMESTRE.codigo] });

  const tardios = plan.tardios.map((p) => p.clave);
  // Ayer o, si el mes terminó después (una siembra en las primeras horas de un mes), entre su fin y la siembra.
  const ayer = (mes: Periodo, i: number) =>
    new Date(Math.max(minutosDespues(momentoHace(1, ahora), 10 * i).getTime(), mes.hasta.getTime() + Math.min(MS_HORA, (ahora.getTime() - mes.hasta.getTime()) / 2)));
  const dato = DATO_CONSULTAS.nombre;
  for (const mes of plan.meses) {
    if (mes.clave === plan.pendiente.clave) continue;
    const valor = String(consultasDe(mes) - (mes.clave === plan.corregido.clave ? FALTABA_EN_EL_CORREGIDO : 0));
    const i = tardios.indexOf(mes.clave);
    const cuando = i >= 0 ? ayer(mes, i) : enDia(elSiguienteMes(mes, zona), 3, 9);
    en(cuando, { tipo: "reportarDato", quien: "consulta", dato, periodo: mes.clave, valor });
  }
  en(enDia(m[2], 7, 10), { tipo: "reportarDato", quien: "liderCex", dato, periodo: plan.corregido.clave, valor: String(consultasDe(plan.corregido)) });
  for (const k of [3, 2, 1]) {
    const mes = m[k];
    const antesDelPendiente = mes.desde.getTime() < plan.pendiente.desde.getTime();
    const esperado = mes.clave === plan.corregido.clave ? "atencion" : antesDelPendiente ? "bien" : "falta_dato";
    const valores = { B: String(ofertadasDe(mes)) };
    en(enDia(m[k - 1], 4, 10), { tipo: "reportar", quien: "liderCex", codigo: CEX_AGENDA.codigo, periodo: mes.clave, valores, esperado });
  }

  crearYEnviar(en, enDia(m[3], 19, 9), CEX_HIPERTENSION, m[2].clave, "liderCex");
  en(enDia(m[3], 20, 10), { tipo: "aprobar", quien: "liderCex", codigos: [CEX_HIPERTENSION.codigo] });
  // La coordinadora hace seguimiento: le llega el aviso de la sede en Crítico con el total en Bien (quien reporta no lo recibe).
  en(enDia(m[3], 20, 11), { tipo: "seguimiento", codigo: CEX_HIPERTENSION.codigo, quien: "coordinadora" });
  [m[2], m[1]].forEach((mes, i) =>
    en(enDia(elSiguienteMes(mes, zona), 3, 11), { tipo: "rejilla", quien: "liderCex", codigo: CEX_HIPERTENSION.codigo, periodo: mes.clave, ...REJILLAS[i] }),
  );

  const ultimo = cal.trimestres[2];
  crearYEnviar(en, enDia(ultimo, 25, 9), SGC_INDICE, ultimo.clave, "coordinadora");
  crearYEnviar(en, enDia(ultimo, 25, 10), SGC_INDICE_RESTRINGIDO, ultimo.clave, "coordinadora");
  en(enDia(ultimo, 26, 10), { tipo: "aprobar", quien: "gerente", codigos: [SGC_INDICE.codigo, SGC_INDICE_RESTRINGIDO.codigo] });
  en(enDia(ultimo, 26, 11), { tipo: "seguimiento", codigo: SGC_INDICE_RESTRINGIDO.codigo, quien: "liderCex" });
}
