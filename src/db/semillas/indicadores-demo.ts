/**
 * Los indicadores de la demo (spec 14 §22, sobre la demo de la 13C): los ocho del SGC del Excel del usuario, elaborados por
 * `coordinadora.sgc` y aprobados en bloque por `gerente`, con dos trimestres históricos y el primero que se reporta; uno
 * más del SGC que se retira; el de urgencias que mide `jefe.urgencias` (rol Consulta), el restringido de talento humano
 * (lo aprueba `lider.gth`), el regulatorio de consulta externa con la Resolución 256 de 2016, uno por aprobar y el de
 * cartera en borrador; los objetivos; y, en las mediciones, «Bien», «Atención» con análisis, «Crítico» con causa, acción
 * y la marca, una sin dato, una vencida, una «no aplica», una meta programada, una observación de `control.interno` sin
 * respuesta, el cierre de un mes anterior y una medición reabierta, corregida y cerrada de nuevo.
 *
 * Todo pasa por las funciones del dominio, con la hora en que ocurrió (`opciones.ahora`, contada desde el reloj de la
 * siembra con el calendario de `calendarioDeIndicadores` o con `momentoHace`) y las firmas con la clave de la demo
 * (`firmaDeLaDemo`): cada versión aprobada tiene sus filas de `firmas`. La bitácora y los avisos llevan la hora de la
 * siembra: `registrarAuditoria` y `avisarA` no reciben otra.
 *
 * Los pasos se agendan por tema y se corren en el orden de su hora (`Paso`): el cierre del mes alcanza solo lo que ya
 * había pasado, sea cual sea el día en que se siembre.
 */
import type { Sql } from "postgres";
import { periodoDe, type Periodo } from "../../lib/indicadores-documentales/periodo";
import { anterior, periodoQueContiene } from "../../lib/indicadores/periodos";
import type { Periodicidad, Semaforo } from "../../lib/indicadores/tipos";
import { zonaHoraria } from "../../lib/zona-horaria";
import type { SesionFlujo } from "../consultas/flujo/contrato";
import { analizar } from "../consultas/indicadores/analisis";
import { aprobarFichas, enviarAAprobacion } from "../consultas/indicadores/aprobacion";
import { cerrarDeNuevo, cerrarMes, reabrirMedicion } from "../consultas/indicadores/cierre";
import { abrirCambio, crearIndicador, guardarBorrador } from "../consultas/indicadores/fichas";
import { registrarHistoricos } from "../consultas/indicadores/historicos";
import { guardarEnMaestro } from "../consultas/indicadores/maestros";
import { asegurarMediciones, marcarNoAplica, reportar } from "../consultas/indicadores/mediciones";
import { programarMeta } from "../consultas/indicadores/metas";
import { observar } from "../consultas/indicadores/observaciones";
import { designar, retirar } from "../consultas/indicadores/operacion";
import { momentoHace, sesionDe, type ContextoDistribucion } from "./distribucion-demo";
import {
  AIN_01,
  CEX_01,
  DEL_SGC,
  datosDeFicha,
  FUENTE_PRECISADA,
  GRF_01,
  GTH_01,
  GTH_02,
  OBJETIVOS,
  SGC_05,
  type Catalogo,
  type ClaveObjetivo,
  type FichaDemo,
  type OperacionDemo,
} from "./indicadores-demo-fichas";
import { FIRMA, firmaDeLaDemo } from "./vigencia-demo";

const MS_MINUTO = 60_000;
const MS_HORA = 60 * MS_MINUTO;
const MS_DIA = 24 * MS_HORA;

// ── Calendario ──────────────────────────────────────────────────────────────────────────────────────────────────────

/** El periodo de la clave, que siempre es válida aquí. */
const periodo = (clave: string, zona: string): Periodo => periodoDe(clave, zona)!;
const elAnterior = (p: Periodo, zona: string): Periodo => periodo(anterior(p.clave), zona);
const elQueContiene = (p: Periodicidad, instante: Date, zona: string): Periodo => periodoQueContiene(p, instante, zona);

/** A las `hora` del día `dias` contado desde el comienzo del periodo (el día 0 es el primero). */
export const enDia = (p: Periodo, dias: number, hora: number): Date => new Date(p.desde.getTime() + dias * MS_DIA + hora * MS_HORA);

const minutosDespues = (instante: Date, minutos: number) => new Date(instante.getTime() + minutos * MS_MINUTO);

/**
 * El calendario de la siembra, contado desde su reloj (también lo leen los tests de la semilla). Los trimestres son los
 * tres últimos que terminaron hace más de 20 días: sembrando entre finales de octubre de 2026 y mediados de enero de 2027,
 * los tres primeros de 2026, los de la maqueta. Los meses, los seis anteriores al de la siembra.
 */
export type CalendarioDeIndicadores = {
  /** Del más antiguo al más reciente: los dos primeros son históricos del SGC; el último, el primero que se reporta. */
  trimestres: [Periodo, Periodo, Periodo];
  /** El que sigue al último sembrado: desde él rige el cambio mayor de `SGC-IND-05`. */
  trimestreSiguiente: Periodo;
  /** Los históricos de `SGC-IND-03` y `SGC-IND-04`: el último semestre y el último año que terminaron antes de la aprobación. */
  semestreHistorico: Periodo;
  anioHistorico: Periodo;
  /** `meses[k]`: el mes de hace `k` meses; `meses[0]` es el de la siembra. */
  meses: Periodo[];
  /** La aprobación en bloque de las fichas del SGC, en la tercera semana del último trimestre sembrado. */
  aprobacionSgc: Date;
  /** El cierre del mes de hace tres meses, a mediados del mes de hace dos. */
  cierre: Date;
};

export function calendarioDeIndicadores(ahora: Date, zona: string = zonaHoraria()): CalendarioDeIndicadores {
  const siguiente = elQueContiene("trimestral", momentoHace(20, ahora), zona);
  const ultimo = elAnterior(siguiente, zona);
  const medio = elAnterior(ultimo, zona);
  const primero = elAnterior(medio, zona);
  const aprobacionSgc = enDia(ultimo, 14, 10);
  const meses = [elQueContiene("mensual", ahora, zona)];
  for (let k = 1; k <= 6; k++) meses.push(elAnterior(meses[k - 1], zona));
  return {
    trimestres: [primero, medio, ultimo],
    trimestreSiguiente: siguiente,
    semestreHistorico: elAnterior(elQueContiene("semestral", aprobacionSgc, zona), zona),
    anioHistorico: elAnterior(elQueContiene("anual", aprobacionSgc, zona), zona),
    meses,
    aprobacionSgc,
    cierre: enDia(meses[2], 14, 17),
  };
}

// ── La siembra ──────────────────────────────────────────────────────────────────────────────────────────────────────

/** Lo que comparten los temas: la conexión, el calendario, las sesiones, los catálogos y lo que se va creando. */
type Siembra = {
  sql: Sql;
  ahora: Date;
  zona: string;
  cal: CalendarioDeIndicadores;
  cat: Catalogo;
  coordinadora: SesionFlujo;
  gerente: SesionFlujo;
  controlInterno: SesionFlujo;
  liderGth: SesionFlujo;
  liderCex: SesionFlujo;
  jefeUrgencias: SesionFlujo;
  /** Cada indicador creado, por su código, con la versión que se le abrió de último y sus datos de operación. */
  creados: Map<string, { indicadorId: number; versionId: number; op: OperacionDemo }>;
};

/** Un hecho de la historia, con la hora en que ocurrió. */
type Paso = { momento: Date; hacer: (momento: Date) => Promise<unknown> };
type Agendar = (momento: Date, hacer: (momento: Date) => Promise<unknown>) => void;

export async function sembrarIndicadores(sql: Sql, c: ContextoDistribucion): Promise<void> {
  console.log("Sembrando indicadores, sus mediciones y el cierre del mes…");
  const zona = zonaHoraria();
  const s = await prepararSiembra(sql, c, zona);

  const agenda: Paso[] = [];
  const en: Agendar = (momento, hacer) => agenda.push({ momento, hacer });
  agendarUrgenciasYConsultaExterna(s, en);
  agendarSgcYTalentoHumano(s, en);
  en(s.cal.cierre, (momento) => cerrarMes(s.coordinadora, s.cal.meses[3].clave, { sql, ahora: momento }));
  agendarFichasRecientes(s, en);

  const enOrden = agenda.map((p, i) => ({ ...p, i })).sort((x, y) => x.momento.getTime() - y.momento.getTime() || x.i - y.i);
  for (const p of enOrden) {
    if (p.momento.getTime() >= c.ahora.getTime()) throw new Error(`Paso de la semilla de indicadores en el futuro: ${p.momento.toISOString()}`);
    await p.hacer(p.momento);
  }
  // Los periodos que terminaron hasta hoy, como los abre la primera lectura (spec §8.1).
  await asegurarMediciones({ sql, ahora: c.ahora });
}

async function prepararSiembra(sql: Sql, c: ContextoDistribucion, zona: string): Promise<Siembra> {
  const coordinadora = await sesionDe(sql, "coordinadora.sgc");
  const porNombre = async (tabla: "tipos_indicador" | "clasificaciones_indicador" | "unidades_indicador" | "cargos") =>
    new Map((await sql.unsafe(`SELECT id, nombre FROM ${tabla}`)).map((f) => [f.nombre as string, Number(f.id)]));
  const [tipos, clasificaciones, unidades, cargos] = await Promise.all([
    porNombre("tipos_indicador"),
    porNombre("clasificaciones_indicador"),
    porNombre("unidades_indicador"),
    porNombre("cargos"),
  ]);
  const subprocesos = new Map(
    (await sql`SELECT s.id, p.sigla, s.slug FROM subprocesos s JOIN procesos p ON p.id = s.proceso_id`).map((f) => [
      `${f.sigla}/${f.slug}`,
      Number(f.id),
    ]),
  );
  const normas = new Map(
    (await sql`SELECT n.id, concat_ws(' ', tn.nombre, n.numero, 'de', n.anio::text) AS nombre FROM normas n
      JOIN tipos_norma tn ON tn.id = n.tipo_norma_id`).map((f) => [f.nombre as string, Number(f.id)]),
  );

  // Los objetivos van antes que las fichas que los citan.
  const objetivos = new Map<ClaveObjetivo, number>();
  for (const o of OBJETIVOS) {
    const { id } = await guardarEnMaestro(coordinadora, "objetivos", { clase: o.clase, enunciado: o.enunciado }, { sql });
    objetivos.set(o.clave, id);
  }

  const exigir = (mapa: ReadonlyMap<string, number>, clave: string, que: string) => {
    const id = mapa.get(clave);
    if (id === undefined) throw new Error(`${que} de la demo no encontrado: ${clave}`);
    return id;
  };
  const procesos = new Map(Object.entries(c.procesoPorSigla));
  const documentos = new Map(Object.entries(c.documentoPorCodigo));
  const cat: Catalogo = {
    proceso: (sigla) => exigir(procesos, sigla, "Proceso"),
    subproceso: (sigla, slug) => exigir(subprocesos, `${sigla}/${slug}`, "Subproceso"),
    tipo: (nombre) => exigir(tipos, nombre, "Tipo de indicador"),
    clasificacion: (nombre) => exigir(clasificaciones, nombre, "Clasificación"),
    unidad: (nombre) => exigir(unidades, nombre, "Unidad"),
    cargo: (nombre) => exigir(cargos, nombre, "Cargo"),
    norma: (nombre) => exigir(normas, nombre, "Norma"),
    documento: (codigo) => exigir(documentos, codigo, "Documento"),
    objetivo: (clave) => objetivos.get(clave)!,
  };

  return {
    sql,
    ahora: c.ahora,
    zona,
    cal: calendarioDeIndicadores(c.ahora, zona),
    cat,
    coordinadora,
    gerente: await sesionDe(sql, "gerente"),
    controlInterno: await sesionDe(sql, "control.interno"),
    liderGth: await sesionDe(sql, "lider.gth"),
    liderCex: await sesionDe(sql, "lider.cex"),
    jefeUrgencias: await sesionDe(sql, "jefe.urgencias"),
    creados: new Map(),
  };
}

// ── Las acciones, por las funciones del dominio ─────────────────────────────────────────────────────────────────────

function creado(s: Siembra, codigo: string) {
  const c = s.creados.get(codigo);
  if (!c) throw new Error(`La semilla aún no creó ${codigo}`);
  return c;
}

/** La coordinadora crea la ficha y, con `enviar`, la envía a aprobación cinco minutos después con su firma «Elaboró». */
async function crearFicha(s: Siembra, ficha: FichaDemo, op: OperacionDemo, momento: Date, enviar: boolean): Promise<void> {
  const { indicadorId, versionId } = await crearIndicador(s.coordinadora, datosDeFicha(s.cat, ficha, op), { sql: s.sql, ahora: momento });
  s.creados.set(ficha.codigo, { indicadorId, versionId, op });
  if (enviar) await enviarFicha(s, versionId, minutosDespues(momento, 5));
}

async function enviarFicha(s: Siembra, versionId: number, momento: Date): Promise<void> {
  await enviarAAprobacion(s.coordinadora, { versionId, credenciales: FIRMA }, { sql: s.sql, ahora: momento, verificar: firmaDeLaDemo });
}

/** Quien aprueba firma «Aprobó» las fichas en bloque, con una sola clave. */
async function aprobar(s: Siembra, quien: SesionFlujo, versionIds: number[], momento: Date): Promise<void> {
  await aprobarFichas(quien, { versionIds, credenciales: FIRMA }, { sql: s.sql, ahora: momento, verificar: firmaDeLaDemo });
}

/**
 * Un cambio sobre la ficha vigente (spec §7.6.5): abre la versión siguiente, guarda el formulario con lo que cambia y la
 * envía. El sistema decide si es mayor (queda por aprobar) o menor (queda aprobada sin aprobador).
 */
async function cambiarFicha(s: Siembra, codigo: string, ficha: FichaDemo, motivoCambio: string, momento: Date): Promise<number> {
  const actual = creado(s, codigo);
  const { versionId } = await abrirCambio(s.coordinadora, actual.indicadorId, { sql: s.sql, ahora: momento });
  const op = { ...actual.op, motivoCambio };
  await guardarBorrador(s.coordinadora, versionId, datosDeFicha(s.cat, ficha, op), { sql: s.sql, ahora: minutosDespues(momento, 10) });
  await enviarFicha(s, versionId, minutosDespues(momento, 30));
  s.creados.set(codigo, { ...actual, versionId, op });
  return versionId;
}

/** La medición del periodo, abierta como la abriría la lectura de ese momento. */
async function medicionDe(s: Siembra, codigo: string, clave: string, momento: Date): Promise<number> {
  const { indicadorId } = creado(s, codigo);
  await asegurarMediciones({ sql: s.sql, ahora: momento, indicadorId });
  const [m] = await s.sql`SELECT id FROM mediciones WHERE indicador_id = ${indicadorId} AND periodo = ${clave}`;
  if (!m) throw new Error(`${codigo} no tiene medición de ${clave}`);
  return Number(m.id);
}

/** Reporta A y B y comprueba el color que deja: si la semilla se equivoca de umbral, no siembra. */
async function reportarPeriodo(
  s: Siembra,
  quien: SesionFlujo,
  codigo: string,
  clave: string,
  [a, b]: [string, string],
  esperado: Semaforo,
  momento: Date,
): Promise<void> {
  const medicionId = await medicionDe(s, codigo, clave, momento);
  const r = await reportar(quien, { medicionId, valores: { A: a, B: b }, parcial: false, confirmado: true }, { sql: s.sql, ahora: momento });
  if (!r.ok || r.semaforo !== esperado) {
    throw new Error(`${codigo} ${clave}: se esperaba ${esperado} y quedó ${r.ok ? r.semaforo : `por confirmar (${r.confirmar})`}`);
  }
}

/** La coordinadora registra los históricos en la tabla del año (spec §8.8) y se comprueba el color de cada uno. */
async function registrarHistoricosDe(s: Siembra, codigo: string, filas: [string, string, string, Semaforo][], momento: Date): Promise<void> {
  const { indicadorId } = creado(s, codigo);
  const { registrados } = await registrarHistoricos(
    s.coordinadora,
    { indicadorId, filas: filas.map(([clave, A, B]) => ({ periodo: clave, valores: { A, B } })) },
    { sql: s.sql, ahora: momento },
  );
  const quedaron = await s.sql`SELECT periodo, semaforo FROM mediciones
    WHERE indicador_id = ${indicadorId} AND historica AND periodo IN ${s.sql(filas.map(([clave]) => clave))}`;
  for (const [clave, , , esperado] of filas) {
    const m = quedaron.find((f) => f.periodo === clave);
    if (registrados !== filas.length || m?.semaforo !== esperado) throw new Error(`${codigo} ${clave}: el histórico no quedó en ${esperado}`);
  }
}

async function analizarPeriodo(
  s: Siembra,
  quien: SesionFlujo,
  codigo: string,
  clave: string,
  textos: { analisis?: string; causa?: string; accionPropuesta?: string },
  momento: Date,
): Promise<void> {
  const medicionId = await medicionDe(s, codigo, clave, momento);
  await analizar(quien, { medicionId, ...textos }, { sql: s.sql, ahora: momento });
}

// ── Urgencias y consulta externa ────────────────────────────────────────────────────────────────────────────────────

/**
 * Los dos mensuales, aprobados juntos por Gerencia en el mes de hace seis meses y medidos desde él. Urgencias, por la
 * enfermera jefe: dos meses en Bien, uno que nadie reportó (el cierre lo deja sin dato), uno en Atención con su análisis,
 * uno vencido y el último por reportar. Consulta externa, por su líder: el de hace cuatro meses salió en Atención, se
 * cerró, se reabrió porque el dato estaba mal, se corrigió a Bien y se cerró de nuevo; el último, por reportar.
 */
function agendarUrgenciasYConsultaExterna(s: Siembra, en: Agendar): void {
  const m = s.cal.meses;
  const jefe = [s.jefeUrgencias.usuarioId];
  const lider = [s.liderCex.usuarioId];
  en(enDia(m[6], 0, 9), (t) => crearFicha(s, AIN_01, { inicio: m[6].clave, mide: jefe, analiza: jefe }, t, true));
  en(enDia(m[6], 0, 11), (t) => crearFicha(s, CEX_01, { inicio: m[6].clave, mide: lider, analiza: lider }, t, true));
  en(enDia(m[6], 2, 10), (t) => aprobar(s, s.gerente, [creado(s, "AIN-IND-01").versionId, creado(s, "CEX-IND-01").versionId], t));

  const urgencias = (k: number, valores: [string, string], esperado: Semaforo) =>
    en(enDia(m[k - 1], 2, 9), (t) => reportarPeriodo(s, s.jefeUrgencias, "AIN-IND-01", m[k].clave, valores, esperado, t));
  urgencias(6, ["1160", "40"], "bien");
  urgencias(5, ["1092", "42"], "bien");
  urgencias(3, ["1520", "40"], "atencion");
  en(enDia(m[2], 3, 10), (t) =>
    analizarPeriodo(s, s.jefeUrgencias, "AIN-IND-01", m[3].clave, {
      analisis:
        "La consulta por enfermedad respiratoria aumentó en la segunda quincena y el servicio trabajó dos fines de semana con un médico menos.",
    }, t),
  );

  const consulta = (k: number, valores: [string, string], esperado: Semaforo) =>
    en(enDia(m[k - 1], 3, 9), (t) => reportarPeriodo(s, s.liderCex, "CEX-IND-01", m[k].clave, valores, esperado, t));
  consulta(6, ["1302", "620"], "bien");
  consulta(5, ["1488", "600"], "bien");
  consulta(4, ["2108", "620"], "atencion");
  en(enDia(m[3], 4, 10), (t) =>
    analizarPeriodo(s, s.liderCex, "CEX-IND-01", m[4].clave, {
      analisis: "Un médico general salió a vacaciones sin reemplazo y las citas de primera vez se asignaron con más días de espera.",
    }, t),
  );
  consulta(3, ["1612", "620"], "bien");
  consulta(2, ["1736", "620"], "bien");

  // Después del cierre (a mediados del mes de hace dos): la reapertura del mes de hace cuatro y su corrección.
  en(enDia(m[2], 16, 9), async (t) =>
    reabrirMedicion(
      s.coordinadora,
      {
        medicionId: await medicionDe(s, "CEX-IND-01", m[4].clave, t),
        justificacion: "El sistema de agendamiento contó dos veces las citas reprogramadas de la jornada extramural; el líder envió el dato corregido.",
      },
      { sql: s.sql, ahora: t },
    ),
  );
  // El líder la corrige: de Atención a Bien.
  en(enDia(m[2], 16, 15), (t) => reportarPeriodo(s, s.liderCex, "CEX-IND-01", m[4].clave, ["1798", "620"], "bien", t));
  en(enDia(m[2], 17, 9), async (t) => cerrarDeNuevo(s.coordinadora, await medicionDe(s, "CEX-IND-01", m[4].clave, t), { sql: s.sql, ahora: t }));
}

// ── Sistema de Gestión de Calidad y talento humano ──────────────────────────────────────────────────────────────────

/** Los históricos de cada ficha del SGC: los dos trimestres (o el semestre o el año) que terminaron antes de aprobarse. */
function historicosDelSgc(cal: CalendarioDeIndicadores): Record<string, [string, string, string, Semaforo][]> {
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
 * coordinadora los registra desde el Excel. La de rotación de personal la aprueba `lider.gth` el mismo día. Al terminar
 * el trimestre se reportan: `SGC-IND-01` en Crítico, con causa, acción y la observación de Control Interno; `SGC-IND-02`
 * en Atención con su análisis; `SGC-IND-06` con la meta que se le programó; `SGC-IND-08` «no aplica». `SGC-IND-09` se
 * retira.
 */
function agendarSgcYTalentoHumano(s: Siembra, en: Agendar): void {
  const { cal } = s;
  const ultimo = cal.trimestres[2];
  const siguiente = cal.trimestreSiguiente;
  const coordinadora = [s.coordinadora.usuarioId];
  const inicioDe = (f: FichaDemo) =>
    f.periodicidad === "semestral" ? cal.semestreHistorico.clave : f.periodicidad === "anual" ? cal.anioHistorico.clave : cal.trimestres[0].clave;

  DEL_SGC.forEach((f, i) =>
    en(minutosDespues(enDia(ultimo, 7, 9), i * 10), (t) => crearFicha(s, f, { inicio: inicioDe(f), mide: coordinadora, analiza: coordinadora }, t, true)),
  );
  const lider = [s.liderGth.usuarioId];
  en(enDia(ultimo, 7, 15), (t) => crearFicha(s, GTH_01, { inicio: ultimo.clave, mide: lider, analiza: lider }, t, true));
  en(cal.aprobacionSgc, (t) => aprobar(s, s.gerente, DEL_SGC.map((f) => creado(s, f.codigo).versionId), t));
  en(enDia(ultimo, 14, 15), (t) => aprobar(s, s.liderGth, [creado(s, "GTH-IND-01").versionId], t));
  // Gerencia hace seguimiento de las auditorías: recibe la alerta del Crítico (spec §10.3).
  en(enDia(ultimo, 15, 9), (t) =>
    designar(s.coordinadora, { indicadorId: creado(s, "SGC-IND-01").indicadorId, funcion: "seguimiento", usuarioIds: [s.gerente.usuarioId] }, { sql: s.sql, ahora: t }),
  );

  Object.entries(historicosDelSgc(cal)).forEach(([codigo, filas], i) =>
    en(minutosDespues(enDia(ultimo, 21, 9), i * 10), (t) => registrarHistoricosDe(s, codigo, filas, t)),
  );
  // Una meta programada distinta de la de la ficha (80), antes de que el periodo termine: sin justificación ni marca.
  en(enDia(ultimo, 24, 11), (t) =>
    programarMeta(s.coordinadora, { indicadorId: creado(s, "SGC-IND-06").indicadorId, periodo: ultimo.clave, meta: "70" }, { sql: s.sql, ahora: t }),
  );

  const reportes: [string, [string, string], Semaforo][] = [
    ["SGC-IND-01", ["3", "5"], "critico"],
    ["SGC-IND-02", ["6", "8"], "atencion"],
    ["SGC-IND-05", ["47", "50"], "bien"],
    ["SGC-IND-06", ["3", "4"], "bien"],
    ["SGC-IND-07", ["8", "10"], "bien"],
  ];
  reportes.forEach(([codigo, valores, esperado], i) =>
    en(minutosDespues(enDia(siguiente, 3, 9), i * 15), (t) => reportarPeriodo(s, s.coordinadora, codigo, ultimo.clave, valores, esperado, t)),
  );
  en(enDia(siguiente, 3, 11), async (t) =>
    marcarNoAplica(
      s.coordinadora,
      {
        medicionId: await medicionDe(s, "SGC-IND-08", ultimo.clave, t),
        motivo: "En el trimestre no se cerró ninguna no conformidad ni venció el plazo de ninguna: no hubo casos que medir.",
      },
      { sql: s.sql, ahora: t },
    ),
  );
  en(enDia(siguiente, 4, 11), (t) => reportarPeriodo(s, s.liderGth, "GTH-IND-01", ultimo.clave, ["2", "64"], "bien", t));

  en(enDia(siguiente, 5, 10), (t) =>
    analizarPeriodo(s, s.coordinadora, "SGC-IND-01", ultimo.clave, {
      causa:
        "Dos de las cinco auditorías programadas no se ejecutaron: el único auditor interno de los procesos asistenciales estuvo incapacitado y no había un auditor de respaldo formado.",
      accionPropuesta: "Formar dos auditores internos más y reprogramar en el trimestre siguiente las auditorías de Atención Inmediata e Internación.",
    }, t),
  );
  en(enDia(siguiente, 5, 11), (t) =>
    analizarPeriodo(s, s.coordinadora, "SGC-IND-02", ultimo.clave, {
      analisis:
        "Dos de las ocho acciones correctivas evaluadas no eliminaron la causa: el hallazgo de almacenamiento de Gestión de Bienes y Servicios se repitió y se rehízo su análisis de causa con el proceso.",
    }, t),
  );
  en(enDia(siguiente, 8, 11), (t) =>
    retirar(
      s.coordinadora,
      {
        indicadorId: creado(s, "SGC-IND-09").indicadorId,
        motivo: "La oportunidad de publicación ya se mide sola en los indicadores documentales de Vigencia: no hace falta digitarla aquí.",
      },
      { sql: s.sql, ahora: t },
    ),
  );
  en(enDia(siguiente, 12, 15), async (t) =>
    observar(
      s.controlInterno,
      {
        medicionId: await medicionDe(s, "SGC-IND-01", ultimo.clave, t),
        texto: "¿Las dos auditorías reprogramadas quedan dentro del programa anual aprobado? Adjunten el acta del comité que aprobó la reprogramación.",
      },
      { sql: s.sql, ahora: t },
    ),
  );
}

// ── Las fichas de la última semana ──────────────────────────────────────────────────────────────────────────────────

/**
 * En la última semana: el cambio mayor de `SGC-IND-05` (la meta sube a 90: versión 2, aprobada por Gerencia y vigente
 * desde el trimestre siguiente al reportado) y su cambio menor (versión 3: se precisa la fuente de una variable, sin
 * aprobador); la ficha de capacitación institucional, enviada a `lider.gth`; y la de cartera, en borrador.
 */
function agendarFichasRecientes(s: Siembra, en: Agendar): void {
  const conMetaNueva: FichaDemo = { ...SGC_05, meta: "90" };
  en(momentoHace(7, s.ahora), (t) =>
    cambiarFicha(s, "SGC-IND-05", conMetaNueva, "La revisión por la dirección subió la meta a 90 %: el indicador superó el 85 % en los tres últimos trimestres.", t),
  );
  en(momentoHace(6, s.ahora), (t) => aprobar(s, s.gerente, [creado(s, "SGC-IND-05").versionId], t));
  en(momentoHace(5, s.ahora), (t) =>
    cambiarFicha(
      s,
      "SGC-IND-05",
      { ...conMetaNueva, b: { ...conMetaNueva.b, fuente: FUENTE_PRECISADA } },
      "Se precisa la fuente de los documentos revisados: el muestreo trimestral que hace la coordinación de calidad.",
      t,
    ),
  );

  const lider = [s.liderGth.usuarioId];
  const trimestreEnCurso = elQueContiene("trimestral", s.ahora, s.zona).clave;
  en(momentoHace(3, s.ahora), (t) => crearFicha(s, GTH_02, { inicio: trimestreEnCurso, mide: lider, analiza: lider }, t, true));
  en(momentoHace(2, s.ahora), (t) => crearFicha(s, GRF_01, { inicio: s.cal.meses[0].clave, mide: [], analiza: [] }, t, false));
}
