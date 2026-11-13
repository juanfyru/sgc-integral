/**
 * La historia de los indicadores de la demo (spec 14 §22) como datos: el calendario contado desde el reloj de la siembra
 * (`calendarioDeIndicadores`) y cada hecho con la hora en que ocurrió, en orden (`agendaDeIndicadores`). Es pura: sin base
 * y sin sesiones. `indicadores-demo.ts` la corre por las funciones del dominio y los tests la leen para saber, cualquier
 * día que se siembre, qué periodos quedan reportados, cuál vencido y cuál sin dato.
 *
 * La regla de los periodos: lo que terminó hace más que su plazo de reporte (`PLAZO_DE_REPORTE`) ya se reportó; lo que
 * terminó hace menos, queda por reportar, sin vencer. Las dos excepciones son a propósito, en urgencias: un mes vencido
 * (`meses[2]`) y uno que nadie reportó y que el cierre deja sin dato (`meses[4]`).
 */
import { periodoDe, type Periodo } from "../../lib/indicadores-documentales/periodo";
import { anterior, periodoQueContiene } from "../../lib/indicadores/periodos";
import type { Periodicidad, Semaforo } from "../../lib/indicadores/tipos";
import { zonaHoraria } from "../../lib/zona-horaria";
import { minutosDespues, momentoHace } from "./distribucion-demo";
import {
  AIN_01,
  CEX_01,
  DEL_SGC,
  FUENTE_PRECISADA,
  GRF_01,
  GTH_01,
  GTH_02,
  PLAZO_DE_REPORTE,
  SGC_03,
  SGC_04,
  SGC_05,
  type FichaDemo,
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
  /** El cierre de `meses[3]`, a mediados de `meses[2]`. */
  cierre: Date;
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
  return {
    trimestres: [primero, medio, ultimo],
    trimestreSiguiente: siguiente,
    semestreHistorico: elAnterior(elQueContiene("semestral", aprobacionSgc, zona), zona),
    anioHistorico: elAnterior(elQueContiene("anual", aprobacionSgc, zona), zona),
    meses,
    mesEnCurso: elQueContiene("mensual", ahora, zona),
    trimestreEnCurso: elQueContiene("trimestral", ahora, zona),
    aprobacionSgc,
    cierre: enDia(meses[2], 14, 17),
  };
}

// ── Los hechos ──────────────────────────────────────────────────────────────────────────────────────────────────────

/** Las personas de la demo que actúan en la historia. */
export type Quien = "coordinadora" | "gerente" | "controlInterno" | "liderGth" | "liderCex" | "jefeUrgencias";

/** Una fila histórica: periodo, A, B y el color que debe dejar. */
export type FilaHistorica = [string, string, string, Semaforo];

export type Hecho =
  /** La coordinadora crea la ficha; `responsable` mide y analiza. */
  | { tipo: "crear"; ficha: FichaDemo; inicio: string; responsable: Quien | null }
  /** La coordinadora la envía a aprobación con su firma «Elaboró». */
  | { tipo: "enviar"; codigo: string }
  /** Firma «Aprobó» en bloque la versión más reciente de cada código. */
  | { tipo: "aprobar"; quien: Quien; codigos: string[] }
  | { tipo: "seguimiento"; codigo: string; quien: Quien }
  | { tipo: "historicos"; codigo: string; filas: FilaHistorica[] }
  | { tipo: "meta"; codigo: string; periodo: string; meta: string }
  | { tipo: "reportar"; quien: Quien; codigo: string; periodo: string; valores: [string, string]; esperado: Semaforo }
  | { tipo: "noAplica"; quien: Quien; codigo: string; periodo: string; motivo: string }
  | { tipo: "analizar"; quien: Quien; codigo: string; periodo: string; textos: { analisis?: string; causa?: string; accionPropuesta?: string } }
  | { tipo: "observar"; quien: Quien; codigo: string; periodo: string; texto: string }
  | { tipo: "retirar"; codigo: string; motivo: string }
  | { tipo: "cerrarMes"; mes: string }
  | { tipo: "reabrir"; codigo: string; periodo: string; justificacion: string }
  | { tipo: "cerrarDeNuevo"; codigo: string; periodo: string }
  /** Un cambio sobre la ficha vigente: abre la versión siguiente, la guarda y la envía (el sistema decide si es mayor). */
  | { tipo: "cambiar"; codigo: string; ficha: FichaDemo; motivo: string };

export type Paso = { momento: Date; hecho: Hecho };

/** La historia de los indicadores de la demo, en el orden de su hora (el cierre del mes alcanza solo lo que ya pasó). */
export function agendaDeIndicadores(ahora: Date, zona: string = zonaHoraria()): Paso[] {
  const cal = calendarioDeIndicadores(ahora, zona);
  const agenda: Paso[] = [];
  const en = (momento: Date, hecho: Hecho) => agenda.push({ momento, hecho });
  urgenciasYConsultaExterna(cal, en);
  sgcYTalentoHumano(cal, zona, en);
  en(cal.cierre, { tipo: "cerrarMes", mes: cal.meses[3].clave });
  fichasRecientes(cal, ahora, en);
  return agenda
    .map((p, i) => ({ p, i }))
    .sort((x, y) => x.p.momento.getTime() - y.p.momento.getTime() || x.i - y.i)
    .map(({ p }) => p);
}

type En = (momento: Date, hecho: Hecho) => void;

/** Crear y, cinco minutos después, enviar. */
function crearYEnviar(en: En, momento: Date, ficha: FichaDemo, inicio: string, responsable: Quien): void {
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
  en(enDia(m[6], 2, 10), { tipo: "aprobar", quien: "gerente", codigos: [AIN_01.codigo, CEX_01.codigo] });

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

/** Los históricos de cada ficha del SGC: los dos trimestres (o el semestre o el año) que terminaron antes de aprobarse. */
function historicosDelSgc(cal: CalendarioDeIndicadores): Record<string, FilaHistorica[]> {
  const [t1, t2] = cal.trimestres.map((t) => t.clave);
  return {
    "SGC-IND-01": [[t1, "5", "5", "bien"], [t2, "5", "6", "atencion"]],
    "SGC-IND-02": [[t1, "4", "5", "bien"], [t2, "3", "4", "atencion"]],
    "SGC-IND-03": [[cal.semestreHistorico.clave, "4", "5", "bien"]],
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
 * Interno; `SGC-IND-02` en Atención con su análisis; `SGC-IND-06` con la meta que se le programó; `SGC-IND-08` «no
 * aplica»; y el semestre y el año de `SGC-IND-03` y `SGC-IND-04` si terminaron con el trimestre. `SGC-IND-09` se retira.
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
  // El semestre y el año de la aprobación, si terminaron con el último trimestre sembrado (ya pasó su plazo).
  const semestre = elQueContiene("semestral", cal.aprobacionSgc, zona);
  const anio = elQueContiene("anual", cal.aprobacionSgc, zona);
  if (semestre.hasta.getTime() === ultimo.hasta.getTime()) reportes.push([SGC_03.codigo, semestre.clave, ["5", "6"], "bien"]);
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
