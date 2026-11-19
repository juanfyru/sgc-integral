/**
 * Lecturas de los hallazgos de mejoramiento (spec 15 §6.3, §8.1 y §16.2): la lista con sus cifras y el detalle. Toda
 * lectura pasa por `filtroHallazgos` (`src/lib/alcance.ts`): quien no ve un hallazgo no lo recibe, no lo cuenta, y un
 * identificador que no existe y uno que no se ve responden igual (nulo). El turno y lo vencido se calculan al leer.
 */
import type { PendingQuery, Row } from "postgres";
import { z } from "zod";
import { obtenerSql, type Cliente } from "@/db/cliente";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { nombreSql } from "@/db/consultas/normograma/busqueda";
import { adminsActivos, lideresDeProceso } from "@/db/consultas/tramites";
import {
  componentesVisibles,
  ejecutoEnElHallazgo,
  filtroAcceso,
  filtroHallazgos,
  participacionEnHallazgo,
  puedeVerHallazgo,
  puedeVerPlan,
  puedeVerificar,
  quienesVerifican,
  vistaCompletaDeHallazgo,
} from "@/lib/alcance";
import { periodoDe } from "@/lib/indicadores-documentales/periodo";
import { rutaDeIndicador } from "@/lib/indicadores/rutas";
import { leerCriterios, yaSePuedeEvaluar } from "@/lib/mejoramiento/eficacia";
import { etiquetaDeEstado, marcasDeHallazgo, turnoDe } from "@/lib/mejoramiento/estados";
import { fechaLargaDeDia } from "@/lib/mejoramiento/formato";
import type { ActividadDeExcel, FilaDeExcel } from "@/lib/mejoramiento/excel";
import { esExterno } from "@/lib/mejoramiento/origenes";
import { rutaDeHallazgo } from "@/lib/mejoramiento/rutas";
import { esReprogramada } from "@/lib/mejoramiento/textos";
import {
  METODOS_DE_VERIFICACION,
  SE_AJUSTA_EN,
  TERMINALES,
  type Clase,
  type CriterioEficacia,
  type Criticidad,
  type EstadoActividad,
  type EstadoHallazgo,
  type HallazgoBase,
  type EstadoAjuste,
  type MetodoAnalisis,
  type MetodoDeVerificacion,
  type Origen,
  type ResultadoCierre,
  type TipoAccion,
  type TipoAjuste,
  estaAbierta,
} from "@/lib/mejoramiento/tipos";
import { puede } from "@/lib/permisos";
import { fechaEnZona } from "@/lib/tramites/plazos";
import { zonaHoraria } from "@/lib/zona-horaria";
import { avanceDeAccion, avanceDeHallazgo } from "./actividades";
import { quienDecideAjustes } from "./ajustes";
import { clasificacionDe } from "./clasificacion";
import { leerAjustes, sinLaFila, type AjusteDeDetalle } from "./ajustes-lectura";

export type { AjusteDeDetalle } from "./ajustes-lectura";
import { activosDeRol, quienTieneElTurno, revisoresDe } from "./avisos";
import { cargaConfirmada, cargaResuelta } from "./carga-confirmada";
import { indicadoresDeEficacia } from "./indicador-de-eficacia";
import { tareasConSuHallazgo } from "./tareas";
import { venceLaActividad } from "./vence-actividad";
import { ofreceRechazo, pasoDelEstado, puedeDarElPaso, type PasoDelRecorrido } from "./recorrido";
import { contextoDeMejora } from "./config";
import { fechasMinimasDe, venceLaEvaluacionDe } from "./espera";
import { evaluablesDesde, NADIE_PUEDE_VERIFICAR, type FilaDelIndicador } from "./verificacion";

type Opciones = { sql?: Cliente; ahora?: Date };

export type FiltroDeLista = {
  q?: string;
  procesoId?: number;
  origen?: Origen;
  clase?: Clase;
  criticidad?: Criticidad;
  /** Además de los estados guardados: `por_evaluar`, los «En espera de eficacia» que ya llegaron a su fecha mínima (R4). */
  estado?: EstadoHallazgo | "abiertos" | "reabiertos" | "sin_accion" | "por_evaluar";
  soloVencidos?: boolean;
  /** Los que esperan la decisión de quien mira (R2): los hallazgos de sus tareas de mejoramiento (`tareasConSuHallazgo`). */
  esperanSuDecision?: boolean;
};

export type FilaDeHallazgo = {
  id: number;
  codigo: string;
  titulo: string;
  clase: Clase;
  criticidad: Criticidad | null;
  origen: Origen;
  proceso: string;
  estado: EstadoHallazgo;
  etiqueta: string;
  marcas: string[];
  turno: string;
  avance: number | null;
  vence: Date | null;
  prioridadAlta: boolean;
};

export type CifrasDeLista = {
  abiertos: number;
  conAlgoVencido: number;
  esperanSuDecision: number;
  enEspera: number;
  /** Los «En espera de eficacia» que ya llegaron a su fecha mínima: «Por evaluar la eficacia» (R4). */
  porEvaluar: number;
  reabiertos: number;
};

const idONulo = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const esTerminal = (e: EstadoHallazgo) => TERMINALES.includes(e);

function aBase(f: Record<string, unknown>): HallazgoBase {
  return {
    id: Number(f.id),
    codigo: f.codigo as string,
    clase: f.clase as Clase,
    criticidad: (f.criticidad as Criticidad | null) ?? null,
    origen: f.origen as Origen,
    estado: f.estado as EstadoHallazgo,
    ronda: Number(f.ronda),
    procesoId: Number(f.proceso_id),
    reincidenteDe: idONulo(f.reincidente_de),
    correccionRequerida: (f.correccion_requerida as boolean | null) ?? null,
    accionRequerida: (f.accion_requerida as boolean | null) ?? null,
    resultadoCierre: (f.resultado_cierre as ResultadoCierre | null) ?? null,
    registradoPor: Number(f.registrado_por),
  };
}

const ADMIN = "Administrador del SGC";
const QUIEN_LO_ELABORO = "Quien lo elaboró";
const QUIEN_VERIFICA = "Quien puede verificar";
/** El turno de un paso que nadie puede dar hoy (la lista lo dice así; «Lo que sigue», con su porqué). */
const NADIE_VERIFICA_TURNO = "Nadie puede verificarlo";
const NADIE_ARBITRA_TURNO = "Nadie puede arbitrarlo";
const NADIE_ACEPTA_TURNO = "Nadie puede aceptarlo";
/** El turno de un hallazgo cargado sin su formato firmado (spec §15): es del Admin SGC, que lo adjunta (la tarea `mej-escaneo`). */
const TURNO_SIN_EL_FORMATO = "El Administrador del SGC: falta el formato firmado";

/** Lo que le toca a quien elaboró el plan en revisión cuando no queda ningún Admin SGC que lo revise (F15-DC15). */
const SIN_REVISOR = "devolverlo y reenviarlo: no hay otro Administrador del SGC activo que lo revise";

/** La resolución de turnos dentro de una llamada: cada clave se resuelve una vez (ver `resolverTurno`). */
type Memoria = Map<string, Promise<unknown>>;
const recordar = <T>(m: Memoria, clave: string, f: () => Promise<T>): Promise<T> => {
  if (!m.has(clave)) m.set(clave, f());
  return m.get(clave) as Promise<T>;
};

/**
 * Quién tiene el turno y cómo se dice. En la espera de eficacia nadie lo tiene hasta la fecha mínima; desde ella, quien puede
 * verificar (spec §8.1; `yaSePuedeEvaluar`, R4). Un hallazgo cargado sin su formato firmado (`faltaElFormato`) no avanza hasta
 * que el Admin SGC lo adjunta: el turno es suyo, sea cual sea el paso (spec §15).
 */
async function resolverTurno(
  tx: Cliente,
  h: HallazgoBase,
  m: Memoria,
  x?: { yaSePuedeEvaluar?: boolean; faltaElFormato?: boolean },
): Promise<{ ids: number[]; texto: string }> {
  if (x?.faltaElFormato && !esTerminal(h.estado)) {
    return { ids: await recordar(m, "admins", () => adminsActivos({ sql: tx })), texto: TURNO_SIN_EL_FORMATO };
  }
  if (h.estado === "en_espera" && x?.yaSePuedeEvaluar) {
    const ids = await recordar(m, `verificadores:${h.id}`, () => quienesVerifican(tx, h.id));
    return { ids, texto: ids.length > 0 ? QUIEN_VERIFICA : NADIE_VERIFICA_TURNO };
  }
  const turno = turnoDe(h.estado);
  if (!turno) return { ids: [], texto: esTerminal(h.estado) ? "Sin pendientes" : "Nadie por ahora" };
  // Quién tiene el turno depende solo de esto: el proceso (en «Por aceptar», también quien lo registró, que no acepta), quien
  // registró, el hallazgo o nada.
  const clave =
    turno === "lideres" ? `lideres:${h.procesoId}${h.estado === "por_aceptar" ? `:sin:${h.registradoPor}` : ""}`
    : turno === "registrador" ? `registrador:${h.registradoPor}`
    // El árbitro depende también de quién lo sostuvo; los validadores, de quién registró la corrección y decidió; los
    // verificadores, de quién ejecutó en ese hallazgo (`quienesVerifican`); quienes revisan el plan, de quién lo elaboró
    // (`revisoresDe`).
    : turno === "responsables" || turno === "arbitro" || turno === "validadores" || turno === "verificadores" ? `${turno}:${h.id}`
    : turno === "admin" && h.estado === "en_revision" ? `revisores:${h.id}`
    : turno;
  const ids = await recordar(m, clave, () => quienTieneElTurno(tx, h));
  switch (turno) {
    case "lideres": {
      if (ids.length === 0 && h.estado === "por_aceptar") return { ids, texto: NADIE_ACEPTA_TURNO };
      const lideres = await recordar(m, `hay-lideres:${h.procesoId}`, () => lideresDeProceso(h.procesoId, { sql: tx }));
      return { ids, texto: lideres.length > 0 ? "La líder del proceso" : ADMIN };
    }
    case "registrador":
      return { ids, texto: ids.includes(h.registradoPor) ? "Quien lo registró" : ADMIN };
    case "arbitro": {
      if (ids.length === 0) return { ids, texto: NADIE_ARBITRA_TURNO };
      const gerencia = await recordar(m, "gerencia-activa", () => activosDeRol(tx, ["gerencia"]));
      return { ids, texto: ids.every((id) => gerencia.includes(id)) ? "Gerencia" : ADMIN };
    }
    case "admin": {
      // Sin nadie que revise lo enviado, el turno es de quien lo elaboró, para devolverlo y reenviarlo (`QUIENES.admin`).
      if (h.estado !== "en_revision") return { ids, texto: ADMIN };
      const revisores = await recordar(m, `solo-revisores:${h.id}`, () => revisoresDe(tx, h));
      return { ids, texto: revisores.length > 0 ? ADMIN : QUIEN_LO_ELABORO };
    }
    case "gerencia":
      return { ids, texto: "Gerencia" };
    case "responsables":
      return { ids, texto: "Los responsables de las actividades" };
    case "verificadores":
      return { ids, texto: ids.length > 0 ? QUIEN_VERIFICA : NADIE_VERIFICA_TURNO };
    case "validadores":
      return { ids, texto: "Quien puede validar" };
  }
}

/**
 * Con quién está el hallazgo, en palabras, según los usuarios activos de hoy (nunca se guarda): si el turno es del líder y
 * el proceso ya no tiene ninguno activo, es del Administrador del SGC.
 */
export async function turnoEnTexto(tx: Cliente, h: HallazgoBase, x?: { yaSePuedeEvaluar?: boolean }): Promise<string> {
  return (await resolverTurno(tx, h, new Map(), x)).texto;
}

/**
 * Una actividad vencida: con el plan aprobado (`fin_original`), sin terminar ni cancelar y con su fecha ya pasada en la zona (la
 * de corregir si la verificación la devolvió, si no su fin: `venceLaActividad`, la de las tareas y la pasada de vencimientos). La
 * de una carga sin su formato firmado no vence todavía: no le ha llegado a nadie (`cargaResuelta`, spec §15).
 */
const ACTIVIDAD_VENCIDA = (sql: Cliente, hoy: string) => sql`(${cargaResuelta(sql)} AND EXISTS (
  SELECT 1 FROM mejora_actividades va
  WHERE va.hallazgo_id = h.id AND va.fin_original IS NOT NULL AND va.estado NOT IN ('terminada', 'cancelada')
    AND ${venceLaActividad(sql, "va")} < ${hoy}::date))`;

/**
 * El avance (spec §10.3): el promedio de los avances de las acciones de la ronda en curso, y el de cada acción, el de sus
 * actividades no canceladas; enteros (el de cada acción se redondea antes, como `avanceDeAccion` y `avanceDeHallazgo` en la
 * página), y nulo si no hay. Las de un plan que nunca se aprobó (sin `fin_original`) no cuentan: sin plan aprobado la lista
 * dice «—».
 */
const AVANCE = (sql: Cliente) => sql`(
  SELECT round(avg(por_accion.promedio))::int FROM (
    SELECT round(avg(aa.avance)) AS promedio
    FROM mejora_actividades aa
    JOIN mejora_acciones ac ON ac.id = aa.accion_id
    JOIN mejora_rondas ar ON ar.id = ac.ronda_id
    WHERE aa.hallazgo_id = h.id AND ar.numero = h.ronda AND aa.estado <> 'cancelada' AND aa.fin_original IS NOT NULL
    GROUP BY ac.id) por_accion)`;

/** `%` y `_` de la búsqueda se toman como texto, no como comodines. */
const comoPatron = (q: string) => "%" + q.trim().replace(/[\\%_]/g, (m) => "\\" + m) + "%";

const COLUMNAS_BASE = (sql: Cliente) => sql`h.id, h.codigo, h.clase, h.criticidad, h.origen, h.estado, h.ronda, h.proceso_id,
  h.reincidente_de, h.correccion_requerida, h.accion_requerida, h.resultado_cierre, h.registrado_por`;

/**
 * Lo vencido y lo que ya se puede evaluar de los hallazgos de `donde` (un fragmento sobre `h` que ya lleva la visibilidad de quien
 * mira), con una sola regla para la lista y para los hallazgos de un plan (Fase 15B, anexo §3.5): una actividad vencida, el paso
 * en curso vencido o, en la espera de eficacia, su evaluación vencida. Desde cuándo se evalúa cada hallazgo en espera, en una pasada
 * para todos (R4: nunca una por fila), y si ya venció su evaluación (`venceLaEvaluacionDe`, la regla de la pasada: la espera no
 * guarda `vence_en`).
 */
async function reglasDeLaLista(sql: Cliente, donde: PendingQuery<Row[]>, ahora: Date) {
  const zona = zonaHoraria();
  const hoy = fechaEnZona(ahora, zona);
  const enEspera = await sql`SELECT h.id FROM mejora_hallazgos h WHERE ${donde} AND h.estado = 'en_espera'`;
  const minimas = await fechasMinimasDe(sql, enEspera.map((f) => Number(f.id)), zona);
  const porEvaluar = [...minimas].flatMap(([id, fm]) => (yaSePuedeEvaluar(fm.minima, ahora, zona) ? [id] : []));
  const contexto = minimas.size > 0 ? await contextoDeMejora(sql, ahora) : null;
  const evaluacionVencida = contexto
    ? [...minimas].flatMap(([id, fm]) => (venceLaEvaluacionDe(fm, contexto).getTime() < ahora.getTime() ? [id] : []))
    : [];
  const algoVencido = sql`(${ACTIVIDAD_VENCIDA(sql, hoy)} OR h.vence_en < ${ahora} OR h.id = ANY(${sql.array(evaluacionVencida)}::bigint[]))`;
  return { hoy, porEvaluar, algoVencido };
}

/** Las columnas de una fila de la lista, sobre `h` y su proceso `p`. */
const COLUMNAS_DE_LA_LISTA = (sql: Cliente, hoy: string, algoVencido: PendingQuery<Row[]>) => sql`${COLUMNAS_BASE(sql)}, h.titulo,
  h.vence_en, h.cargado, p.nombre AS proceso, ${ACTIVIDAD_VENCIDA(sql, hoy)} AS actividad_vencida, ${algoVencido} AS algo_vencido,
  ${AVANCE(sql)} AS avance, ${cargaResuelta(sql)} AS carga_resuelta`;

/** Una fila de la lista con si tiene algo vencido (solo abierta), para ordenarla y contarla. */
type FilaConVencido = FilaDeHallazgo & { vencido: boolean };

/** Una fila leída con `COLUMNAS_DE_LA_LISTA`, como la pinta la lista. El turno, con la memoria de la llamada. */
async function aFilaDeLista(sql: Cliente, f: Row, memoria: Memoria, porEvaluar: readonly number[]): Promise<FilaConVencido> {
  const h = aBase(f);
  const yaSePuede = { yaSePuedeEvaluar: porEvaluar.includes(h.id) };
  const abierta = !esTerminal(h.estado);
  return {
    id: h.id,
    codigo: h.codigo,
    titulo: f.titulo as string,
    clase: h.clase,
    criticidad: h.criticidad,
    origen: h.origen,
    proceso: f.proceso as string,
    estado: h.estado,
    etiqueta: etiquetaDeEstado(h, yaSePuede),
    marcas: marcasDeHallazgo(h, { cargado: f.cargado === true, algunaActividadVencida: f.actividad_vencida === true }),
    turno: (await resolverTurno(sql, h, memoria, { ...yaSePuede, faltaElFormato: f.carga_resuelta === false })).texto,
    avance: idONulo(f.avance),
    vence: abierta ? ((f.vence_en as Date | null) ?? null) : null,
    prioridadAlta: abierta && esExterno(h.origen),
    vencido: abierta && f.algo_vencido === true,
  };
}

/**
 * El orden de la lista: los de prioridad alta (externos) primero, luego los que tienen algo vencido, luego por vencimiento
 * ascendente con los nulos al final.
 */
function ordenDeLaLista(a: FilaConVencido, b: FilaConVencido): number {
  if (a.prioridadAlta !== b.prioridadAlta) return a.prioridadAlta ? -1 : 1;
  if (a.vencido !== b.vencido) return a.vencido ? -1 : 1;
  if (a.vence && b.vence) return a.vence.getTime() - b.vence.getTime() || a.id - b.id;
  if (a.vence || b.vence) return a.vence ? -1 : 1;
  return a.id - b.id;
}

/**
 * La lista de hallazgos que la persona ve, con las cifras de lo que ve (no de lo filtrado). Orden por omisión: los
 * de prioridad alta (externos) primero, luego los que tienen algo vencido, luego por vencimiento ascendente con los nulos
 * al final. Los filtros van al `WHERE`; `esperanSuDecision` sale de las tareas de mejoramiento de quien mira, en una sola
 * llamada para toda la lista.
 */
export async function listarHallazgos(
  sesion: SesionFlujo,
  filtro: FiltroDeLista,
  opciones?: Opciones,
): Promise<{ filas: FilaDeHallazgo[]; cifras: CifrasDeLista }> {
  const sql = opciones?.sql ?? obtenerSql();
  const ahora = opciones?.ahora ?? new Date();
  const memoria: Memoria = new Map();
  const visible = filtroHallazgos(sql, sesion);
  const abierto = sql`h.estado NOT IN ${sql([...TERMINALES])}`;
  const { hoy, porEvaluar, algoVencido } = await reglasDeLaLista(sql, visible, ahora);

  // Los que esperan la decisión de quien mira (R2): los hallazgos distintos entre sus tareas de mejoramiento, las mismas de
  // «Mis tareas», en una sola llamada para toda la lista (nunca una por fila); de esos, solo los que ve.
  const deSusTareas = [
    ...new Set((await tareasConSuHallazgo(sesion, { sql, ahora })).flatMap((t) => (t.hallazgoId === null ? [] : [t.hallazgoId]))),
  ];
  const suyos =
    deSusTareas.length === 0
      ? []
      : (await sql`SELECT h.id FROM mejora_hallazgos h WHERE ${visible} AND h.id = ANY(${sql.array(deSusTareas)}::bigint[])`).map((f) =>
          Number(f.id),
        );

  const [c] = await sql`SELECT
      count(*) FILTER (WHERE ${abierto}) AS abiertos,
      count(*) FILTER (WHERE ${abierto} AND ${algoVencido}) AS con_algo_vencido,
      count(*) FILTER (WHERE h.estado = 'en_espera') AS en_espera,
      count(*) FILTER (WHERE ${abierto} AND h.ronda > 1) AS reabiertos
    FROM mejora_hallazgos h WHERE ${visible}`;
  const cifras: CifrasDeLista = {
    abiertos: Number(c.abiertos),
    conAlgoVencido: Number(c.con_algo_vencido),
    esperanSuDecision: suyos.length,
    enEspera: Number(c.en_espera),
    porEvaluar: porEvaluar.length,
    reabiertos: Number(c.reabiertos),
  };

  const e = filtro.estado;
  const q = filtro.q?.trim();
  const condiciones = [
    q
      ? sql`(unaccent(lower(h.codigo)) LIKE unaccent(lower(${comoPatron(q)})) OR unaccent(lower(h.titulo)) LIKE unaccent(lower(${comoPatron(q)})))`
      : sql`true`,
    filtro.procesoId !== undefined ? sql`h.proceso_id = ${filtro.procesoId}` : sql`true`,
    filtro.origen ? sql`h.origen = ${filtro.origen}` : sql`true`,
    filtro.clase ? sql`h.clase = ${filtro.clase}` : sql`true`,
    filtro.criticidad ? sql`h.criticidad = ${filtro.criticidad}` : sql`true`,
    e === "abiertos" ? abierto
    : e === "reabiertos" ? sql`(${abierto} AND h.ronda > 1)`
    : e === "sin_accion" ? sql`(h.estado = 'cerrado' AND h.resultado_cierre = 'sin_accion')`
    : e === "por_evaluar" ? sql`h.id = ANY(${sql.array(porEvaluar)}::bigint[])`
    : e ? sql`h.estado = ${e}`
    : sql`true`,
    filtro.soloVencidos ? sql`(${abierto} AND ${algoVencido})` : sql`true`,
    filtro.esperanSuDecision ? sql`h.id = ANY(${sql.array(suyos)}::bigint[])` : sql`true`,
  ];
  const filas = await sql`
    SELECT ${COLUMNAS_DE_LA_LISTA(sql, hoy, algoVencido)}
    FROM mejora_hallazgos h
    JOIN procesos p ON p.id = h.proceso_id
    WHERE ${visible} AND ${condiciones.reduce((a, b) => sql`${a} AND ${b}`)}`;

  const resultado: FilaConVencido[] = [];
  for (const f of filas) resultado.push(await aFilaDeLista(sql, f, memoria, porEvaluar));
  resultado.sort(ordenDeLaLista);
  return { filas: resultado.map((fila) => ({ ...fila, vencido: undefined }) as FilaDeHallazgo), cifras };
}

/** Una fila de la lista de un subconjunto de hallazgos (los de un plan): la de `listarHallazgos`, con su proceso y si tiene algo vencido. */
export type FilaDeLaLista = FilaDeHallazgo & { procesoId: number; vencido: boolean };

/**
 * Las filas de la lista de los hallazgos de `donde`, un fragmento sobre `h` que ya lleva la visibilidad de quien mira (Fase 15B:
 * los hallazgos de un plan que la persona ve completos), con lo vencido, el avance, la etiqueta, las marcas y el turno de
 * `listarHallazgos` y en su orden. Sin cifras ni filtros: los pone quien llama. Las consultas no crecen con las filas, salvo el
 * turno de los pasos que dependen de cada hallazgo (`resolverTurno`).
 */
export async function filasDeLaLista(sql: Cliente, donde: PendingQuery<Row[]>, opciones: { ahora: Date }): Promise<FilaDeLaLista[]> {
  const { hoy, porEvaluar, algoVencido } = await reglasDeLaLista(sql, donde, opciones.ahora);
  const filas = await sql`
    SELECT ${COLUMNAS_DE_LA_LISTA(sql, hoy, algoVencido)}
    FROM mejora_hallazgos h
    JOIN procesos p ON p.id = h.proceso_id
    WHERE ${donde}`;
  const memoria: Memoria = new Map();
  const resultado: Array<FilaConVencido & { procesoId: number }> = [];
  for (const f of filas) resultado.push({ ...(await aFilaDeLista(sql, f, memoria, porEvaluar)), procesoId: Number(f.proceso_id) });
  return resultado.sort(ordenDeLaLista);
}

/**
 * Lo que la lista sabe de cada hallazgo de `donde` (un fragmento sobre `h` con la visibilidad de quien mira) sin resolver su
 * turno: su estado, si tiene algo vencido (solo abierto, con la regla de `listarHallazgos`) y su avance (nulo sin plan de acción
 * aprobado en su ronda en curso). Un número fijo de consultas, sean cuantos sean: las cifras de la lista de planes (Fase 15B).
 */
export async function hechosDeLaLista(
  sql: Cliente,
  donde: PendingQuery<Row[]>,
  opciones: { ahora: Date },
): Promise<Map<number, { estado: EstadoHallazgo; vencido: boolean; avance: number | null }>> {
  const { algoVencido } = await reglasDeLaLista(sql, donde, opciones.ahora);
  const filas = await sql`SELECT h.id, h.estado, ${algoVencido} AS algo_vencido, ${AVANCE(sql)} AS avance
    FROM mejora_hallazgos h WHERE ${donde}`;
  return new Map(
    filas.map((f) => {
      const estado = f.estado as EstadoHallazgo;
      return [Number(f.id), { estado, vencido: !esTerminal(estado) && f.algo_vencido === true, avance: idONulo(f.avance) }];
    }),
  );
}

/**
 * Si la persona ve algún hallazgo (`filtroHallazgos`: completo o por una actividad). Una sola regla para la lista y «Mis
 * actividades» (spec §16.1): decide la pestaña «Hallazgos», y quien no ve ninguno y tiene actividades va a las suyas.
 */
export async function veAlgunHallazgo(sesion: SesionFlujo, opciones?: Opciones): Promise<boolean> {
  const sql = opciones?.sql ?? obtenerSql();
  const [f] = await sql`SELECT EXISTS (SELECT 1 FROM mejora_hallazgos h WHERE ${filtroHallazgos(sql, sesion)}) AS ve`;
  return f?.ve === true;
}

// ─────────────────────────────────────────────────────────────────────────────
// El Excel de la lista

/** El resultado y el criterio de eficacia de una ronda, sin nombrar el indicador enlazado (spec §11.2 y §16.3). */
function eficaciaDeRonda(r: Record<string, unknown> | undefined): FilaDeExcel["eficacia"] {
  if (!r) return null;
  return {
    resultado: r.resultado === "eficaz" || r.resultado === "no_eficaz" ? r.resultado : null,
    criterios: leerCriterios(r.criterios),
    criterioOtro: textoONulo(r.criterio_otro),
  };
}

/** Lo que Gerencia respondió a una escalada, como lo guarda su evento (`responderEscalada`): la nota y el acta, si la hubo. */
function escaladaDe(detalle: unknown): ActividadDeExcel["escalada"] {
  if (typeof detalle !== "object" || detalle === null) return null;
  const d = detalle as Record<string, unknown>;
  const nota = textoONulo(d.nota);
  if (nota === null) return null;
  const acta = typeof d.acta === "object" && d.acta !== null ? (d.acta as Record<string, unknown>) : null;
  const numero = textoONulo(acta?.numero);
  const fecha = textoONulo(acta?.fecha);
  return { nota, acta: numero && fecha ? { numero, fecha } : null };
}

/** Agrupa las filas por la clave que se les dé, en su orden. */
function agrupar<T>(filas: readonly T[], clave: (f: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const f of filas) {
    const k = clave(f);
    const lista = m.get(k);
    if (lista) lista.push(f);
    else m.set(k, [f]);
  }
  return m;
}

/**
 * Las filas del Excel de la lista (spec §16.3 y Apéndice A.6): los hallazgos que `listarHallazgos` muestra con `filtro`, en su
 * orden, con una fila por actividad de un plan aprobado (`fin_original`) de cualquier ronda y una por hallazgo sin ninguna. Toda
 * fila pasa otra vez por `filtroHallazgos`. Quien ve el hallazgo solo por una actividad (§6.3) recibe de las que no abre
 * (`puedeVerActividad`: la suya o una en que registró un seguimiento) lo que la página le muestra en texto: sin sus archivos, sus
 * seguimientos ni sus ajustes; la respuesta de Gerencia a una escalada, solo quien lo ve completo. El indicador del criterio no se
 * nombra. Cinco consultas para todo el libro, nunca una por fila.
 */
export async function filasParaExcel(sesion: SesionFlujo, filtro: FiltroDeLista, opciones?: Opciones): Promise<FilaDeExcel[]> {
  const sql = opciones?.sql ?? obtenerSql();
  const ahora = opciones?.ahora ?? new Date();
  const hoy = fechaEnZona(ahora, zonaHoraria());
  const { filas: lista } = await listarHallazgos(sesion, filtro, { sql, ahora });
  if (lista.length === 0) return [];
  const ids = sql.array(lista.map((f) => f.id));
  const [hallazgos, rondas, actividades, causas, analisis] = await Promise.all([
    sql`SELECT h.id, h.codigo, h.titulo, h.descripcion, h.origen, h.fuente, h.ronda, h.estado, h.resultado_cierre,
        h.correccion_requerida, to_char(h.cerrado_en, 'YYYY-MM-DD') AS cerrado, p.nombre AS proceso,
        ${vistaCompletaDeHallazgo(sql, sesion)} AS completo
      FROM mejora_hallazgos h JOIN procesos p ON p.id = h.proceso_id
      WHERE h.id = ANY(${ids}::bigint[]) AND ${filtroHallazgos(sql, sesion)}`,
    sql`SELECT hallazgo_id, numero, resultado, criterios, criterio_otro FROM mejora_rondas WHERE hallazgo_id = ANY(${ids}::bigint[])`,
    sql`SELECT a.id, a.hallazgo_id, a.accion_id, a.orden, a.descripcion, a.responsable_id, u.nombre AS responsable, cg.nombre AS cargo,
        a.avance, a.estado, a.verificacion, a.reprogramaciones, to_char(a.inicio, 'YYYY-MM-DD') AS inicio,
        to_char(a.fin, 'YYYY-MM-DD') AS fin, to_char(a.fin_original, 'YYYY-MM-DD') AS fin_original,
        to_char(${venceLaActividad(sql)}, 'YYYY-MM-DD') AS vence, ${cargaResuelta(sql)} AS entregada,
        ac.orden AS accion_orden, ac.tipo, ac.descripcion AS accion, r.numero AS ronda,
        (SELECT count(*) FROM archivos f WHERE f.contexto = 'mejora_actividad' AND f.contexto_id = a.id AND f.version_id IS NULL) AS evidencias,
        EXISTS (SELECT 1 FROM mejora_seguimientos s WHERE s.actividad_id = a.id AND s.registrado_por = ${sesion.usuarioId}) AS siguio,
        seg.fecha AS seg_fecha, seg.realizado AS seg_realizado, seg.barreras AS seg_barreras,
        aj.tipo AS aj_tipo, aj.estado AS aj_estado, aj.causa AS aj_causa, to_char(aj.decidido_en, 'YYYY-MM-DD') AS aj_decidido,
        ud.nombre AS aj_decidio, esc.detalle AS escalada
      FROM mejora_actividades a
      JOIN mejora_hallazgos h ON h.id = a.hallazgo_id
      JOIN mejora_acciones ac ON ac.id = a.accion_id
      JOIN mejora_rondas r ON r.id = ac.ronda_id
      JOIN usuarios u ON u.id = a.responsable_id
      LEFT JOIN cargos cg ON cg.id = u.cargo_id
      LEFT JOIN LATERAL (SELECT to_char(s.fecha, 'YYYY-MM-DD') AS fecha, s.realizado, s.barreras FROM mejora_seguimientos s
        WHERE s.actividad_id = a.id ORDER BY s.fecha DESC, s.id DESC LIMIT 1) seg ON true
      LEFT JOIN LATERAL (SELECT x.tipo, x.estado, x.causa, x.decidido_en, x.decidido_por FROM mejora_ajustes x
        WHERE x.actividad_id = a.id ORDER BY x.pedido_en DESC, x.id DESC LIMIT 1) aj ON true
      LEFT JOIN usuarios ud ON ud.id = aj.decidido_por
      LEFT JOIN LATERAL (SELECT e.detalle FROM mejora_eventos e WHERE e.hallazgo_id = a.hallazgo_id AND e.tipo = 'escalada_respondida'
        AND e.detalle->>'actividadId' = a.id::text ORDER BY e.id DESC LIMIT 1) esc ON true
      WHERE a.hallazgo_id = ANY(${ids}::bigint[]) AND a.fin_original IS NOT NULL
      ORDER BY r.numero, ac.orden, ac.id, a.orden, a.id`,
    sql`SELECT v.accion_id, c.texto FROM mejora_accion_causas v JOIN mejora_causas c ON c.id = v.causa_id
      WHERE v.hallazgo_id = ANY(${ids}::bigint[]) ORDER BY c.orden, c.id`,
    sql`SELECT x.hallazgo_id, r.numero AS ronda, x.metodo FROM mejora_analisis x JOIN mejora_rondas r ON r.id = x.ronda_id
      WHERE x.hallazgo_id = ANY(${ids}::bigint[]) ORDER BY x.orden, x.id`,
  ]);

  const visibles = new Map(hallazgos.map((f) => [Number(f.id), f]));
  const rondaDe = new Map(rondas.map((r) => [`${r.hallazgo_id}:${r.numero}`, r as Record<string, unknown>]));
  const causasDe = agrupar(causas, (x) => String(x.accion_id));
  const metodosDe = agrupar(analisis, (x) => `${x.hallazgo_id}:${x.ronda}`);
  const actividadesDe = agrupar(actividades, (x) => String(x.hallazgo_id));

  const filas: FilaDeExcel[] = [];
  for (const { id } of lista) {
    const h = visibles.get(id);
    if (!h) continue;
    const completo = h.completo === true;
    const rondaEnCurso = Number(h.ronda);
    const base = (ronda: number): Omit<FilaDeExcel, "actividad"> => ({
      codigo: h.codigo as string,
      ronda,
      proceso: h.proceso as string,
      origen: h.origen as Origen,
      fuente: textoONulo(h.fuente),
      titulo: h.titulo as string,
      descripcion: h.descripcion as string,
      eficacia: eficaciaDeRonda(rondaDe.get(`${id}:${ronda}`)),
      // La decisión del cierre, en las filas de la ronda que se cerró.
      cierre:
        h.estado === "cerrado" && ronda === rondaEnCurso
          ? {
              etiqueta: etiquetaDeEstado({
                estado: "cerrado",
                resultadoCierre: (h.resultado_cierre as ResultadoCierre | null) ?? null,
                correccionRequerida: (h.correccion_requerida as boolean | null) ?? null,
              }),
              en: (h.cerrado as string | null) ?? null,
            }
          : null,
    });
    const suyas = actividadesDe.get(String(id)) ?? [];
    if (suyas.length === 0) {
      filas.push({ ...base(rondaEnCurso), actividad: null });
      continue;
    }
    for (const a of suyas) {
      const ronda = Number(a.ronda);
      // La regla de `puedeVerActividad`, con lo ya leído: quien ve el hallazgo completo, su responsable o quien siguió en ella.
      const abre = completo || Number(a.responsable_id) === sesion.usuarioId || a.siguio === true;
      const estado = a.estado as EstadoActividad;
      const vence = a.vence as string;
      filas.push({
        ...base(ronda),
        actividad: {
          etiqueta: `A${Number(a.accion_orden)}.${Number(a.orden)}`,
          tipo: a.tipo as TipoAccion,
          accion: a.accion as string,
          descripcion: a.descripcion as string,
          causas: (causasDe.get(String(a.accion_id)) ?? []).map((x) => x.texto as string),
          metodos: (metodosDe.get(`${id}:${ronda}`) ?? []).map((x) => x.metodo as MetodoAnalisis),
          responsable: a.responsable as string,
          cargo: textoONulo(a.cargo),
          inicio: a.inicio as string,
          fin: a.fin as string,
          finOriginal: a.fin_original as string,
          avance: Number(a.avance),
          estado,
          verificacion: a.verificacion === "conforme" || a.verificacion === "devuelta" ? a.verificacion : null,
          // La regla de la pasada (`venceLaActividad`); la de una carga sin su formato firmado no vence todavía.
          vencida: a.entregada === true && estaAbierta(estado) && vence < hoy ? { vence, hoy } : null,
          reprogramada: esReprogramada({ reprogramaciones: Number(a.reprogramaciones) }),
          evidencias: abre ? Number(a.evidencias) : null,
          ultimoSeguimiento:
            abre && a.seg_fecha
              ? { fecha: a.seg_fecha as string, realizado: a.seg_realizado as string, barreras: textoONulo(a.seg_barreras) }
              : null,
          ajuste:
            abre && a.aj_tipo
              ? {
                  tipo: a.aj_tipo as TipoAjuste,
                  estado: a.aj_estado as EstadoAjuste,
                  causa: a.aj_causa as string,
                  decididoPor: textoONulo(a.aj_decidio),
                  decididoEn: textoONulo(a.aj_decidido),
                }
              : null,
          escalada: completo ? escaladaDe(a.escalada) : null,
        },
      });
    }
  }
  return filas;
}

// ─────────────────────────────────────────────────────────────────────────────
// El detalle

export type ActividadDeDetalle = {
  id: number;
  orden: number;
  descripcion: string;
  responsableId: number;
  responsable: string;
  /** Si el responsable sigue activo: el formulario del borrador lo dice en lugar de perderlo. */
  responsableActivo: boolean;
  inicio: string;
  finOriginal: string | null;
  fin: string;
  /** El día en que vence (`venceLaActividad`): la fecha para corregir si se devolvió, si no `fin`. */
  vence: string;
  avance: number;
  estado: string;
  reprogramaciones: number;
  terminadaEn: Date | null;
  /** La verificación de la implementación (Tarea 16): «conforme» o «devuelta». */
  verificacion: string | null;
  /** Quien mira abre la página de la actividad (`puedeVerActividad`): la del hallazgo la enlaza solo entonces. */
  seAbre: boolean;
  /** Cuándo se escaló a Gerencia (spec §10.7), o nulo; una reprogramación aprobada la borra. */
  gerenciaEn: Date | null;
  /** La nota con que se devolvió en la verificación, solo a quien ve el hallazgo completo; el responsable la lee en su página. */
  verificacionNota: string | null;
  /** Hasta cuándo se corrige una actividad devuelta (`yyyy-mm-dd`). */
  corregirAntesDe: string | null;
  /** Cuántos archivos de evidencia tiene, para quien ve el hallazgo completo; nulo para quien no ve los archivos. */
  evidencias: number | null;
};

export type AccionDeDetalle = {
  id: number;
  orden: number;
  tipo: string;
  descripcion: string;
  recursos: string | null;
  indicadorCumplimiento: string | null;
  meta: string | null;
  causaIds: number[];
  /** El promedio de sus actividades de un plan aprobado, sin las canceladas (`avanceDeAccion`); nulo si no hay. */
  avance: number | null;
  actividades: ActividadDeDetalle[];
};

export type RondaDeDetalle = {
  id: number;
  numero: number;
  estadoPlan: string;
  formularAntesDe: Date | null;
  enviadoEn: Date | null;
  aprobadoEn: Date | null;
  aprobadoRol: string | null;
  /** Quién aprobó el plan en papel, «nombre, cargo», en un hallazgo cargado (spec §15); nulo en los demás. */
  aprobadoFuera: string | null;
  /** Lo marcó la revisión (spec §8.6): «requiere recursos adicionales o tiene impacto institucional», con su nota. */
  requiereRecursos: boolean;
  notaRecursos: string | null;
  /** El envío vigente lo elaboró un Admin SGC (lo guarda el evento `enviar_plan`): una de las condiciones de Gerencia. */
  elaboroAdmin: boolean;
  fechaEvaluacion: string | null;
  cierrePrevisto: Date | null;
  /** El criterio de eficacia tal como se guardó (`criterios`, jsonb): quien lo pinta lo lee sin confiar en su forma. */
  criterios: unknown;
  criterioOtro: string | null;
  indicadorEficaciaId: number | null;
  resultado: string | null;
  similares: boolean | null;
  similaresDetalle: string | null;
  /** Tal como se guardó: quien lo pinta lo lee con `leerCambios` (no se confía en su forma). */
  cambios: unknown;
  analisis: Array<{ id: number; orden: number; metodo: string; equipo: string | null; observaciones: string | null; contenido: unknown }>;
  causas: Array<{ id: number; orden: number; texto: string; sinAccionPorque: string | null }>;
  acciones: AccionDeDetalle[];
  /** En el orden en que se pidieron; vacía para quien ve el hallazgo solo por una actividad (spec §6.3). */
  ajustes: AjusteDeDetalle[];
  /** La verificación de la implementación (spec §11.4), cuando todas quedaron conformes: quién, cuándo, cómo y la nota. */
  verificacion: VerificacionDeRonda | null;
  /** La evaluación de la eficacia de la ronda (spec §11.4), si ya se registró. */
  evaluacion: EvaluacionDeRonda | null;
};

export type VerificacionDeRonda = {
  por: string;
  en: Date;
  metodos: MetodoDeVerificacion[];
  /** Solo a quien ve el hallazgo completo (texto libre de quien verificó). */
  nota: string | null;
};

/**
 * El indicador de lo que mostró la evaluación, tal como lo puede leer quien mira (spec §6.3 y §11.2): con su código, su nombre y
 * sus filas solo si lo ve (`componentesVisibles`, la regla de `puedeVerIndicador`); si no, «un indicador», sin nada más.
 */
export type IndicadorDeLoVisto = { visible: true; codigo: string; nombre: string; filas: FilaDelIndicador[] } | { visible: false } | null;

/** Lo que la pantalla de evaluar mostró, congelado en el evento (spec §12.2), ya decidido para quien mira. */
export type VistoEnLectura = {
  minima: string;
  r: string;
  indicador: IndicadorDeLoVisto;
  ocurrencias: Array<{ fecha: string; descripcion: string }>;
};

export type EvaluacionDeRonda = {
  resultado: "eficaz" | "no_eficaz";
  por: string;
  en: Date;
  criterios: CriterioEficacia[];
  desde: string | null;
  hasta: string | null;
  /** La justificación y lo que la pantalla mostró, solo a quien ve el hallazgo completo (spec §6.3). */
  justificacion: string | null;
  visto: VistoEnLectura | null;
};

/** Las fechas de la columna derecha de la página (spec §16.2, maqueta 2), de la ronda en curso. */
export type FechasDeHallazgo = {
  /** El primer envío de la causa raíz y el plan de la ronda, y si fue dentro de su plazo de formular. */
  planFormulado: { cuando: Date; aTiempo: boolean } | null;
  cierrePrevisto: Date | null;
  /** Desde qué día se puede registrar «eficaz» (`fechaMinimaDe`), mientras está en espera. */
  evaluableDesde: string | null;
  reprogramaciones: { aprobadas: number; pedidas: number };
};

/**
 * Un enlace del hallazgo (spec §6.3, F15-DC5): con su nombre y su ruta solo a quien puede ver lo enlazado, con la regla de alcance
 * de ese módulo; a los demás, solo su clase («un indicador», «un documento restringido»). Un hallazgo que no se ve no está.
 */
export type EnlaceDelHallazgo =
  | { visible: true; clase: "hallazgo" | "documento" | "norma" | "indicador"; rotulo: string; codigo: string | null; nombre: string; href: string }
  | { visible: false; clase: "indicador" | "documento" | "norma"; rotulo: string };

export type DetalleDeHallazgo = {
  /** `completo`, o `actividad` si solo es responsable de una actividad: lo ve en texto, sin historial y sin archivos de otros. */
  ve: "completo" | "actividad";
  id: number;
  codigo: string;
  titulo: string;
  descripcion: string;
  clase: Clase;
  criticidad: Criticidad | null;
  origen: Origen;
  fuente: string | null;
  referenciaCaso: string | null;
  detectadoEn: string;
  procesoId: number;
  proceso: string;
  requisitoClausula: string | null;
  requisitoNormaId: number | null;
  requisitoDocumentoId: number | null;
  riesgo: string | null;
  estado: EstadoHallazgo;
  etiqueta: string;
  ronda: number;
  registradoPor: string;
  registradoPorId: number;
  registradoEn: Date;
  /** Si nació de convertir el reporte de un funcionario (spec §7.3). */
  naceDeUnReporte: boolean;
  /**
   * El nombre de quien reportó, solo para `mejora.ver_todo` (F15-DC5); para los demás, nulo, y la página dice «Reportado por un
   * funcionario».
   */
  reportadoPor: string | null;
  /** El reporte del que nació, para listar sus archivos: solo a quien ve el hallazgo completo. */
  reporteId: number | null;
  cargado: boolean;
  /** Si tiene su formato firmado (`cargaConfirmada`); un hallazgo que no es cargado, siempre. Sin él, el plan no avanza. */
  cargaConfirmada: boolean;
  /** El hallazgo anterior solo si quien mira puede verlo; si no, sin id ni nombre. */
  reincidenteDe: { id: number; codigo: string; titulo: string } | { visible: false } | null;
  marcas: string[];
  fechaLimiteEnte: string | null;
  /** La respuesta al ente de un hallazgo externo (spec §13.4): el día en que se envió y quién la registró; nula sin registrar. */
  respuestaAlEnte: { enviadaEn: string; por: string } | null;
  vence: Date | null;
  correccion: {
    requerida: boolean | null;
    descripcion: string | null;
    responsable: string | null;
    implementadaEn: string | null;
    registradaEn: Date | null;
    /** Quién validó la corrección (o el cierre sin acción), y cuándo. */
    validadaPor: string | null;
    validadaEn: Date | null;
  };
  decision: { accionRequerida: boolean | null; justificacion: string | null; decididaEn: Date | null };
  cierre: {
    resultado: ResultadoCierre | null;
    cerradoEn: Date | null;
    /** Quién firmó «Cerró» (el cierre eficaz); en el camino corto cierra la validación (`correccion.validadaPor`). */
    cerradoPor: string | null;
    /** Las lecciones y cómo se atendieron los cambios: solo a quien ve el hallazgo completo (spec §6.3). */
    lecciones: string | null;
    cambiosAtendidos: string | null;
    anuladoMotivo: string | null;
  };
  rondas: RondaDeDetalle[];
  /** Las rondas que terminaron «no eficaz» (las de número menor que la en curso), congeladas y a la vista (spec §8.7). */
  rondasAnteriores: RondaDeDetalle[];
  fechas: FechasDeHallazgo;
  enlaces: EnlaceDelHallazgo[];
  /** `reporteId`: el reporte de funcionario del que llegó la ocurrencia (sus archivos los abre quien ve el hallazgo completo). */
  ocurrencias: Array<{ id: number; fecha: string; descripcion: string; origen: string; quien: string; reporteId: number | null }>;
  eventos: Array<{
    id: number;
    tipo: string;
    ronda: number;
    detalle: unknown;
    quien: string | null;
    cuando: Date;
    fuera: boolean;
    /** En una reasignación, de quién a quién (los nombres de `antes` y `despues`); nulo en los demás eventos. */
    personas: { de: string; a: string } | null;
  }>;
  turno: string;
  loQueSigue: LoQueSigueDelHallazgo;
  /** El de las acciones de la ronda en curso (`avanceDeHallazgo`); nulo sin plan aprobado. */
  avance: number | null;
  /**
   * El plan y el objetivo del hallazgo (Fase 15B, anexo §3.6 y §10.4): el plan con su código y su nombre, con enlace solo a quien
   * ve el plan (`puedeVerPlan`: quien ve el hallazgo solo por su actividad lo lee sin enlace, F15B-DC9), y el enunciado del
   * objetivo. `puedeClasificar`: quien tiene `mejora.planes` y ve el hallazgo completo (el servidor lo vuelve a comprobar).
   */
  clasificacion: {
    plan: { id: number; codigo: string; nombre: string; enlace: boolean } | null;
    objetivo: string | null;
    objetivoId: number | null;
    puedeClasificar: boolean;
  };
};

/**
 * «Lo que sigue» (spec §16.2): el paso del estado (el formulario que pinta la página), si quien mira puede darlo y la frase
 * que lo dice («A usted le toca…» o quién tiene el turno). `paso` es nulo en los estados cuyo formulario llega en otra tarea.
 * `nota`, solo cuando hace falta: por qué quien mira, que por su rol daría el paso, no lo da (va donde iría el botón).
 */
export type LoQueSigueDelHallazgo = { paso: PasoDelHallazgo | null; puede: boolean; turno: string; nota?: string };

/** Los pasos que pinta «Lo que sigue»: los del recorrido hasta el plan y, después, verificar, evaluar la eficacia y cerrar. */
export type PasoDelHallazgo = PasoDelRecorrido | "verificar" | "evaluar" | "cerrar";

/** Lo que le toca a quien tiene el turno, por estado. */
const LE_TOCA: Partial<Record<EstadoHallazgo, string>> = {
  por_aceptar: "aceptar el hallazgo o rechazarlo",
  rechazo: "decidir si retira el hallazgo o lo sostiene",
  arbitraje: "arbitrar el rechazo",
  por_corregir: "registrar la corrección",
  por_decidir: "decidir si lleva acción correctiva",
  por_validar: "validar la corrección",
  por_formular: "formular el análisis y el plan",
  en_revision: "revisar el plan",
  en_aprobacion: "aprobar el plan",
  en_ejecucion: "ejecutar sus actividades",
  por_verificar: "verificar la implementación",
  en_espera: "evaluar la eficacia",
  por_cerrar: "cerrar el hallazgo",
};

/** Cómo se nombra tras los dos puntos a quien tiene el turno: los roles, con su mayúscula y su artículo. */
function quienEnLaFrase(turno: string): string {
  if (turno === ADMIN) return "el Administrador del SGC";
  if (turno === "Gerencia") return turno;
  return turno.charAt(0).toLowerCase() + turno.slice(1);
}

/**
 * La frase de «Lo que sigue» (pura): el turno va en minúscula tras los dos puntos («Tiene el turno: la líder del proceso»), salvo
 * los roles, que van con su mayúscula y su artículo («el Administrador del SGC», «Gerencia»).
 */
export function fraseDeLoQueSigue(
  h: Pick<HallazgoBase, "estado" | "resultadoCierre" | "correccionRequerida">,
  turno: string,
  mio: boolean,
  x?: { sinRechazo?: boolean; sinRevisor?: boolean },
): string {
  if (esTerminal(h.estado)) return "El hallazgo está " + etiquetaDeEstado(h).toLowerCase() + ": no tiene pasos pendientes.";
  if (h.estado === "en_espera") return ESPERA + ".";
  const quien = quienEnLaFrase(turno);
  const toca =
    h.estado === "por_validar" && h.correccionRequerida === false ? "validar el cierre sin acción"
    : h.estado === "por_aceptar" && x?.sinRechazo ? "aceptar el hallazgo"
    : h.estado === "en_revision" && x?.sinRevisor ? SIN_REVISOR
    : LE_TOCA[h.estado];
  if (!toca) return "Tiene el turno: " + quien + ".";
  return mio ? "A usted le toca " + toca + "." : "Tiene el turno: " + quien + ", para " + toca + ".";
}

const ESPERA = "Espera el momento de evaluar la eficacia de las acciones";

/** Cuando nadie cumple la regla de quién arbitra (§8.3, F15-DC13): el acto se rechaza y la pantalla dice por qué. */
export const NADIE_ARBITRA =
  "Nadie puede arbitrarlo: no hay un Administrador del SGC ni Gerencia activos que no hayan tomado parte en el hallazgo. Dé el " +
  "rol a otra persona.";

/**
 * Cuando nadie puede aceptar un hallazgo «Por aceptar» (§6.1, F15-DC3): quien lo registró no lo acepta, y el proceso no tiene
 * otro líder ni (sin líder) otro Admin SGC activo. Pasa tras un cambio de proceso o una edición; la pantalla dice por qué y qué
 * hacer. Si el proceso tiene líder y es quien lo registró, lo dice así.
 */
export const NADIE_ACEPTA =
  "Nadie puede aceptarlo: el proceso no tiene líder y quien lo registró no puede aceptar su propio hallazgo. Asigne un líder al " +
  "proceso o cambie el proceso del hallazgo.";
export const NADIE_ACEPTA_SU_LIDER =
  "Nadie puede aceptarlo: el único líder del proceso es quien lo registró, y no puede aceptar su propio hallazgo. Asigne otro " +
  "líder al proceso o cambie el proceso del hallazgo.";

/**
 * A quien por su rol verificaría (Admin SGC o Control Interno; Gerencia, cuando solo ella puede) pero ejecutó en el hallazgo
 * (`ejecutoEnElHallazgo`, la regla de `quienesVerifican`, spec §11.1): por qué no ve «Ir a verificar», sin decir qué hizo.
 */
export const NO_VERIFICA_QUIEN_EJECUTO = "No puede verificarlo: participó en la corrección o en la ejecución del plan.";

/** Si la persona, que no puede verificar, verificaría por su rol de no haber ejecutado en el hallazgo. */
async function noVerificaPorqueEjecuto(tx: Cliente, h: HallazgoBase, sesion: SesionFlujo, verificadores: number[]): Promise<boolean> {
  if (!puede(sesion, "mejora.verificar")) return false;
  if (sesion.rol === "gerencia") {
    // Gerencia verifica solo si ningún Admin SGC ni Control Interno puede: entonces los que pueden son todos de Gerencia.
    const [f] = await tx`SELECT bool_and(rol = 'gerencia') AS solo FROM usuarios WHERE id = ANY(${verificadores}::bigint[])`;
    if (f?.solo !== true) return false;
  }
  return ejecutoEnElHallazgo(tx, h.id, sesion.usuarioId);
}

/** Cuando nadie cumple la regla de quién verifica (§11.1): el acto se rechaza y la pantalla dice por qué. */
export const NADIE_VERIFICA = `${NADIE_PUEDE_VERIFICAR}. Dé el rol de Administrador del SGC o de Control Interno a otra persona.`;

/** Cuando nadie cumple la regla de quién valida (§8.5 y §11.1): el acto se rechaza y la pantalla dice por qué. */
const NADIE_VALIDA =
  "Nadie puede validarla: quien registró la corrección, su responsable y, en el cierre sin acción, quien decidió el «no» no " +
  "validan. Dé el rol de Administrador del SGC o de Control Interno a otra persona.";

/**
 * La espera de eficacia (spec §11.4): quien puede verificar puede registrar «No eficaz» en cualquier momento y «Eficaz» desde la
 * fecha mínima, así que el formulario es suyo toda la espera; a los demás se les dice desde cuándo, y desde ese día quién tiene el
 * turno (o que nadie puede).
 */
async function laEspera(
  tx: Cliente,
  h: HallazgoBase,
  sesion: SesionFlujo,
  e: { desde: string; yaSePuede: boolean } | null,
): Promise<LoQueSigueDelHallazgo> {
  if (!e) return { paso: null, puede: false, turno: ESPERA + "." };
  const desde = fechaLargaDeDia(e.desde);
  if (await puedeVerificar(h.id, sesion, { sql: tx })) {
    return {
      paso: "evaluar",
      puede: true,
      turno: e.yaSePuede
        ? "A usted le toca evaluar la eficacia."
        : `Puede registrar «No eficaz» en cualquier momento de la espera; «Eficaz», desde el ${desde}.`,
    };
  }
  if (!e.yaSePuede) return { paso: "evaluar", puede: false, turno: `${ESPERA}: desde el ${desde}.` };
  if ((await quienesVerifican(tx, h.id)).length === 0) return { paso: "evaluar", puede: false, turno: NADIE_VERIFICA };
  return { paso: "evaluar", puede: false, turno: `Tiene el turno: ${quienEnLaFrase(QUIEN_VERIFICA)}, para ${LE_TOCA.en_espera}.` };
}

/**
 * El paso, si quien mira puede darlo (la regla del acto, `puedeDarElPaso`) y la frase. «A usted le toca…» sale de poder
 * darlo, no de estar en el turno: tras un rechazo, el Admin SGC puede retirarlo o sostenerlo sin tener el turno; el turno
 * de «Por aceptar» puede incluir a quien lo registró, que no lo acepta. Verificar y evaluar, por `puedeVerificar`; cerrar, por
 * `mejora.gestionar`. Cuando nadie puede dar el paso (validar, arbitrar, verificar), la frase dice por qué.
 */
async function loQueSigue(
  tx: Cliente,
  h: HallazgoBase,
  sesion: SesionFlujo,
  turno: string,
  evaluable: { desde: string; yaSePuede: boolean } | null,
): Promise<LoQueSigueDelHallazgo> {
  if (esTerminal(h.estado)) return { paso: null, puede: false, turno: fraseDeLoQueSigue(h, turno, false) };
  if (h.estado === "en_espera") return laEspera(tx, h, sesion, evaluable);
  if (h.estado === "por_verificar") {
    const verifica = await puedeVerificar(h.id, sesion, { sql: tx });
    if (verifica) return { paso: "verificar", puede: true, turno: fraseDeLoQueSigue(h, turno, true) };
    const verificadores = await quienesVerifican(tx, h.id);
    if (verificadores.length === 0) return { paso: "verificar", puede: false, turno: NADIE_VERIFICA };
    const frase = fraseDeLoQueSigue(h, turno, false);
    return (await noVerificaPorqueEjecuto(tx, h, sesion, verificadores))
      ? { paso: "verificar", puede: false, turno: frase, nota: NO_VERIFICA_QUIEN_EJECUTO }
      : { paso: "verificar", puede: false, turno: frase };
  }
  if (h.estado === "por_cerrar") {
    const cierra = puede(sesion, "mejora.gestionar");
    return { paso: "cerrar", puede: cierra, turno: fraseDeLoQueSigue(h, turno, cierra) };
  }
  const paso = pasoDelEstado(h.estado);
  if (!LE_TOCA[h.estado]) return { paso: null, puede: false, turno: fraseDeLoQueSigue(h, turno, false) };
  if (!paso) {
    const sinRevisor = h.estado === "en_revision" && (await revisoresDe(tx, h)).length === 0;
    const mio = (await quienTieneElTurno(tx, h)).includes(sesion.usuarioId);
    return { paso, puede: false, turno: fraseDeLoQueSigue(h, turno, mio, { sinRevisor }) };
  }
  const daElPaso = await puedeDarElPaso(tx, sesion, h);
  if (!daElPaso && (h.estado === "por_validar" || h.estado === "arbitraje") && (await quienTieneElTurno(tx, h)).length === 0) {
    return { paso, puede: daElPaso, turno: h.estado === "por_validar" ? NADIE_VALIDA : NADIE_ARBITRA };
  }
  if (!daElPaso && h.estado === "por_aceptar" && (await quienTieneElTurno(tx, h)).length === 0) {
    const conLider = (await lideresDeProceso(h.procesoId, { sql: tx })).length > 0;
    return { paso, puede: false, turno: conLider ? NADIE_ACEPTA_SU_LIDER : NADIE_ACEPTA };
  }
  // «o rechazarlo», solo a quien puede rechazar; a los demás, sin él si el origen es externo (no se rechaza: se responde) o si el
  // turno es del Admin SGC (proceso sin líder).
  const sinRechazo =
    h.estado === "por_aceptar" &&
    (esExterno(h.origen) ||
      (daElPaso ? !(await ofreceRechazo(tx, sesion, h)) : (await lideresDeProceso(h.procesoId, { sql: tx })).length === 0));
  return { paso, puede: daElPaso, turno: fraseDeLoQueSigue(h, turno, daElPaso, { sinRechazo }) };
}

/**
 * «Lo que sigue» de un hallazgo cargado sin su formato firmado (spec §15): nadie da el paso hasta que el Administrador del SGC lo
 * adjunta; desde entonces, las actividades llegan a sus responsables o, si ya estaban terminadas, se puede verificar.
 */
function sinElFormato(h: HallazgoBase): LoQueSigueDelHallazgo {
  const despues = h.estado === "por_verificar" ? "se puede verificar" : "las actividades llegan a sus responsables";
  return { paso: null, puede: false, turno: `Falta el formato firmado de la carga: lo adjunta el Administrador del SGC y, desde entonces, ${despues}.` };
}

/** Lo congelado de un evento (spec §12.2): el plan del envío y de la aprobación, y lo que mostró la evaluación de la eficacia. */
const CONGELADO = ["plan", "visto"] as const;

/**
 * El detalle de un evento sin lo congelado (`detalle.plan` del envío y de la aprobación, y `detalle.visto` de la evaluación,
 * que nombra el indicador enlazado con sus resultados): no se pinta en el historial ni viaja a la página; quien lo necesite (los
 * impresos, la evaluación) lo lee con su propia regla de lo que nombra (§6.3: el indicador, solo a quien `puedeVerIndicador`).
 */
function sinLoCongelado(detalle: unknown): unknown {
  if (typeof detalle !== "object" || detalle === null || !CONGELADO.some((k) => Object.hasOwn(detalle, k))) return detalle;
  const resto = { ...(detalle as Record<string, unknown>) };
  for (const k of CONGELADO) delete resto[k];
  return resto;
}

const LoVisto = z.object({
  r: z.string(),
  minima: z.string(),
  indicadorId: z.number().nullable().optional(),
  indicador: z
    .object({
      codigo: z.string(),
      nombre: z.string(),
      filas: z.array(
        z.object({
          periodo: z.string(),
          etiqueta: z.string(),
          resultado: z.string().nullable(),
          semaforo: z.string().nullable(),
          noAplica: z.boolean(),
          momento: z.enum(["antes", "durante", "despues"]),
        }),
      ),
    })
    .nullable(),
  ocurrencias: z.array(z.object({ fecha: z.string(), descripcion: z.string() })),
});

const LeidoMetodos = z.array(z.enum(METODOS_DE_VERIFICACION));

/** Los métodos de la verificación tal como se guardaron (jsonb): una lista que no se puede leer es «ninguno». */
function leerMetodos(crudo: unknown): MetodoDeVerificacion[] {
  const leido = LeidoMetodos.safeParse(crudo);
  return leido.success ? METODOS_DE_VERIFICACION.filter((m) => leido.data.includes(m)) : [];
}

/**
 * Lo congelado de una evaluación (`detalle.visto`, spec §12.2), para quien mira: el indicador se nombra, con sus filas, solo si
 * la persona lo ve (`visibles`, por el id que guardó el evento, no por el que enlaza hoy la ronda); si quien evaluó tampoco lo veía,
 * se congeló sin código, y así sigue. Lo que no se puede leer es nulo.
 */
function vistoParaQuienLee(crudo: unknown, visibles: ReadonlySet<number>): VistoEnLectura | null {
  const leido = LoVisto.safeParse(crudo);
  if (!leido.success) return null;
  const v = leido.data;
  const id = v.indicadorId ?? null;
  const indicador: IndicadorDeLoVisto =
    v.indicador === null
      ? null
      : id !== null && visibles.has(id) && v.indicador.codigo !== ""
        ? { visible: true, codigo: v.indicador.codigo, nombre: v.indicador.nombre, filas: v.indicador.filas }
        : { visible: false };
  return { minima: v.minima, r: v.r, indicador, ocurrencias: v.ocurrencias };
}

/** El id del indicador que nombra lo congelado de una evaluación, si lo trae. */
const indicadorDeLoVisto = (crudo: unknown): number | null => {
  const leido = LoVisto.safeParse(crudo);
  return leido.success ? (leido.data.indicadorId ?? null) : null;
};

const textoONulo = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);

/**
 * Los enlaces del hallazgo (spec §6.3, F15-DC5), cada uno con la regla de su módulo: un hallazgo (la reincidencia, el de origen y
 * los derivados) solo si quien mira lo ve (`filtroHallazgos`), y si no, no está; un documento con `filtroAcceso` («un documento
 * restringido»); una norma, que lee toda sesión; un indicador con `componentesVisibles` (la regla de `puedeVerIndicador`).
 */
async function enlacesDe(
  sql: Cliente,
  sesion: SesionFlujo,
  x: {
    id: number;
    reincidente: { id: number; codigo: string; titulo: string } | null;
    derivadoDe: number | null;
    documentoId: number | null;
    requisitoDocumentoId: number | null;
    requisitoNormaId: number | null;
    indicadorId: number | null;
    medicionId: number | null;
    indicadorEficaciaId: number | null;
    visibles: ReadonlySet<number>;
  },
): Promise<EnlaceDelHallazgo[]> {
  const enlaces: EnlaceDelHallazgo[] = [];
  const hallazgo = (rotulo: string, o: { id: number; codigo: string; titulo: string }): EnlaceDelHallazgo => ({
    visible: true,
    clase: "hallazgo",
    rotulo,
    codigo: o.codigo,
    nombre: o.titulo,
    href: rutaDeHallazgo(o.id),
  });
  if (x.reincidente) enlaces.push(hallazgo("Reincidencia de", x.reincidente));
  const relacionados = await sql`SELECT h.id, h.codigo, h.titulo, (h.derivado_de IS NOT DISTINCT FROM ${x.id}) AS derivado
    FROM mejora_hallazgos h
    WHERE (h.id = ${x.derivadoDe} OR h.derivado_de = ${x.id}) AND h.id <> ${x.id} AND ${filtroHallazgos(sql, sesion)}
    ORDER BY h.id`;
  for (const o of relacionados.filter((f) => f.derivado !== true)) {
    enlaces.push(hallazgo("Derivado de", { id: Number(o.id), codigo: o.codigo as string, titulo: o.titulo as string }));
  }
  for (const o of relacionados.filter((f) => f.derivado === true)) {
    enlaces.push(hallazgo("Hallazgo derivado", { id: Number(o.id), codigo: o.codigo as string, titulo: o.titulo as string }));
  }

  const documentos = [x.documentoId, x.requisitoDocumentoId].filter((d): d is number => d !== null);
  if (documentos.length > 0) {
    const filas = await sql`SELECT d.id, d.codigo, d.titulo, ${filtroAcceso(sql, sesion)} AS ve FROM documentos d WHERE d.id IN ${sql(documentos)}`;
    const de = new Map(filas.map((f) => [Number(f.id), f]));
    for (const [rotulo, docId] of [
      ["Documento del requisito", x.requisitoDocumentoId],
      ["Documento", x.documentoId === x.requisitoDocumentoId ? null : x.documentoId],
    ] as const) {
      const d = docId === null ? undefined : de.get(docId);
      if (!d) continue;
      enlaces.push(
        d.ve === true
          ? { visible: true, clase: "documento", rotulo, codigo: d.codigo as string, nombre: d.titulo as string, href: `/documentos/${encodeURIComponent(d.codigo as string)}` }
          : { visible: false, clase: "documento", rotulo },
      );
    }
  }

  if (x.requisitoNormaId !== null) {
    const [n] = await sql`SELECT n.id, ${nombreSql(sql)} AS nombre, n.titulo FROM normas n JOIN tipos_norma tn ON tn.id = n.tipo_norma_id
      WHERE n.id = ${x.requisitoNormaId}`;
    if (n) {
      enlaces.push({ visible: true, clase: "norma", rotulo: "Norma del requisito", codigo: n.nombre as string, nombre: n.titulo as string, href: `/normograma/${Number(n.id)}` });
    }
  }

  const indicadores = [x.indicadorId, x.indicadorEficaciaId].filter((i): i is number => i !== null);
  if (indicadores.length > 0) {
    const de = await indicadoresDeEficacia(sql, indicadores);
    const [medicion] = x.medicionId === null ? [] : await sql`SELECT periodo FROM mediciones WHERE id = ${x.medicionId}`;
    const periodo = medicion ? (periodoDe(medicion.periodo as string, zonaHoraria())?.etiqueta ?? (medicion.periodo as string)) : null;
    for (const [rotulo, indId] of [
      ["Indicador", x.indicadorId],
      ["Indicador de eficacia", x.indicadorEficaciaId === x.indicadorId ? null : x.indicadorEficaciaId],
    ] as const) {
      const ind = indId === null ? undefined : de.get(indId);
      if (indId === null || !ind) continue;
      const conPeriodo = rotulo === "Indicador" && periodo ? ` · ${periodo}` : "";
      enlaces.push(
        x.visibles.has(indId)
          ? { visible: true, clase: "indicador", rotulo, codigo: ind.codigo, nombre: `${ind.nombre}${conPeriodo}`, href: rutaDeIndicador(ind.codigo) }
          : { visible: false, clase: "indicador", rotulo },
      );
    }
  }
  return enlaces;
}

/**
 * El hallazgo completo para quien lo ve; nulo si no existe **o** si no lo ve (la misma respuesta). Quien lo ve solo por
 * ser responsable de una actividad lo recibe en texto, sin eventos ni ocurrencias, y sin listas de archivos (los
 * archivos llegan en la Tarea 9, con su propia regla: solo los de sus actividades).
 */
export async function leerHallazgo(sesion: SesionFlujo, id: number, opciones?: Opciones): Promise<DetalleDeHallazgo | null> {
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  const sql = opciones?.sql ?? obtenerSql();
  const ve = await participacionEnHallazgo(id, sesion, { sql });
  if (ve === null) return null;
  const [f] = await sql`
    SELECT h.*, p.nombre AS proceso, ur.nombre AS registrador, uc.nombre AS correccion_responsable, uv.nombre AS validador,
      uz.nombre AS cerrador, ue.nombre AS respondio, to_char(h.respuesta_ente_en, 'YYYY-MM-DD') AS respuesta_ente,
      to_char(h.detectado_en, 'YYYY-MM-DD') AS detectado, to_char(h.fecha_limite_ente, 'YYYY-MM-DD') AS limite_ente,
      to_char(h.correccion_implementada_en, 'YYYY-MM-DD') AS implementada,
      rep.id AS reporte_id, urep.nombre AS reportero
    FROM mejora_hallazgos h
    JOIN procesos p ON p.id = h.proceso_id
    JOIN usuarios ur ON ur.id = h.registrado_por
    LEFT JOIN usuarios uc ON uc.id = h.correccion_responsable_id
    LEFT JOIN usuarios uv ON uv.id = h.validada_por
    LEFT JOIN usuarios uz ON uz.id = h.cerrado_por
    LEFT JOIN usuarios ue ON ue.id = h.respuesta_ente_por
    LEFT JOIN LATERAL (SELECT r.id, r.reportado_por FROM mejora_reportes r
      WHERE r.hallazgo_id = h.id AND r.estado = 'convertido' ORDER BY r.id LIMIT 1) rep ON true
    LEFT JOIN usuarios urep ON urep.id = rep.reportado_por
    WHERE h.id = ${id}`;
  if (!f) return null;
  const h = aBase(f);
  const ahora = opciones?.ahora ?? new Date();
  // «Por evaluar la eficacia» (R4): desde qué día y si ya llegó, con la misma regla de la lista.
  const evaluable = h.estado === "en_espera" ? ((await evaluablesDesde(sql, [h.id], ahora)).get(h.id) ?? null) : null;
  const turno = await turnoEnTexto(sql, h, { yaSePuedeEvaluar: evaluable?.yaSePuede === true });
  const anterior = (async (): Promise<DetalleDeHallazgo["reincidenteDe"]> => {
    if (h.reincidenteDe === null) return null;
    if (!(await puedeVerHallazgo(h.reincidenteDe, sesion, { sql }))) return { visible: false as const };
    const [o] = await sql`SELECT id, codigo, titulo FROM mejora_hallazgos WHERE id = ${h.reincidenteDe}`;
    return { id: Number(o.id), codigo: o.codigo as string, titulo: o.titulo as string };
  })();

  const [rondas, analisis, causas, acciones, vinculos, actividades, ajustes] = await Promise.all([
    sql`SELECT r.id, r.numero, r.estado_plan, r.formular_antes_de, r.enviado_en, r.aprobado_en, r.aprobado_rol, r.aprobado_fuera, r.resultado,
        r.cierre_previsto, r.requiere_recursos, r.nota_recursos, r.similares, r.similares_detalle, r.cambios, r.criterios,
        r.criterio_otro, r.indicador_eficacia_id, to_char(r.fecha_evaluacion, 'YYYY-MM-DD') AS fecha_evaluacion,
        coalesce((SELECT (e.detalle->>'elaboroAdmin')::boolean FROM mejora_eventos e
          WHERE e.hallazgo_id = r.hallazgo_id AND e.ronda = r.numero AND e.tipo = 'enviar_plan' ORDER BY e.id DESC LIMIT 1), false)
          AS elaboro_admin,
        r.verificada_en, uvr.nombre AS verificador, r.verificacion_metodos, r.verificacion_nota,
        r.evaluada_en, uev.nombre AS evaluador, r.evaluacion_criterios, r.evaluacion_justificacion,
        to_char(r.evaluacion_desde, 'YYYY-MM-DD') AS evaluacion_desde, to_char(r.evaluacion_hasta, 'YYYY-MM-DD') AS evaluacion_hasta,
        (SELECT min(e.ocurrio_en) FROM mejora_eventos e
          WHERE e.hallazgo_id = r.hallazgo_id AND e.ronda = r.numero AND e.tipo = 'enviar_plan') AS formulado_en,
        (SELECT count(*) FROM mejora_ajustes x WHERE x.ronda_id = r.id AND x.tipo = 'reprogramar') AS reprogramaciones_pedidas,
        (SELECT count(*) FROM mejora_ajustes x WHERE x.ronda_id = r.id AND x.tipo = 'reprogramar' AND x.estado = 'aprobado')
          AS reprogramaciones_aprobadas
      FROM mejora_rondas r
      LEFT JOIN usuarios uvr ON uvr.id = r.verificada_por
      LEFT JOIN usuarios uev ON uev.id = r.evaluada_por
      WHERE r.hallazgo_id = ${id} ORDER BY r.numero`,
    sql`SELECT id, ronda_id, orden, metodo, equipo, observaciones, contenido FROM mejora_analisis WHERE hallazgo_id = ${id} ORDER BY orden, id`,
    sql`SELECT id, ronda_id, orden, texto, sin_accion_porque FROM mejora_causas WHERE hallazgo_id = ${id} ORDER BY orden, id`,
    sql`SELECT id, ronda_id, orden, tipo, descripcion, recursos, indicador_cumplimiento, meta
      FROM mejora_acciones WHERE hallazgo_id = ${id} ORDER BY orden, id`,
    sql`SELECT accion_id, causa_id FROM mejora_accion_causas WHERE hallazgo_id = ${id}`,
    sql`SELECT a.id, a.accion_id, a.orden, a.descripcion, a.responsable_id, u.nombre AS responsable, u.activo AS responsable_activo,
        a.avance, a.estado, a.terminada_en, a.verificacion, a.gerencia_en, a.verificacion_nota,
        to_char(a.corregir_antes_de, 'YYYY-MM-DD') AS corregir_antes_de,
        (SELECT count(*) FROM archivos f WHERE f.contexto = 'mejora_actividad' AND f.contexto_id = a.id AND f.version_id IS NULL) AS evidencias,
        a.reprogramaciones, to_char(a.inicio, 'YYYY-MM-DD') AS inicio, to_char(a.fin_original, 'YYYY-MM-DD') AS fin_original,
        to_char(a.fin, 'YYYY-MM-DD') AS fin, to_char(${venceLaActividad(sql)}, 'YYYY-MM-DD') AS vence,
        EXISTS (SELECT 1 FROM mejora_seguimientos s WHERE s.actividad_id = a.id AND s.registrado_por = ${sesion.usuarioId}) AS siguio
      FROM mejora_actividades a JOIN usuarios u ON u.id = a.responsable_id
      WHERE a.hallazgo_id = ${id} ORDER BY a.orden, a.id`,
    // El contenido de los ajustes (la causa, la nota, quién) solo a quien ve el hallazgo completo (spec §6.3): quien lo ve por
    // una actividad lee los de la suya en la página de ella (`leerActividad`).
    ve === "completo" ? leerAjustes(sql, { hallazgoId: id }) : Promise.resolve([]),
  ]);
  // Quién decide cada ajuste pendiente de la ronda en curso, una vez por quien lo pidió (`quienDecideAjustes`).
  const decide = new Map<number, Promise<number[]>>();
  const loDecide = (pedidoPor: number) => {
    if (!decide.has(pedidoPor)) decide.set(pedidoPor, quienDecideAjustes(sql, id, pedidoPor).then((r) => r.usuarios));
    return decide.get(pedidoPor)!;
  };
  const rondaEnCurso = rondas.find((r) => Number(r.numero) === h.ronda);
  const puedeDecidirAjustes =
    ve === "completo" && SE_AJUSTA_EN.includes(h.estado) && (puede(sesion, "mejora.gestionar") || puede(sesion, "mejora.aprobar"));
  const decidibles = new Set<number>();
  for (const x of ajustes) {
    const enCurso = rondaEnCurso !== undefined && x.rondaId === Number(rondaEnCurso.id);
    if (puedeDecidirAjustes && enCurso && x.estado === "pendiente" && (await loDecide(x.pedidoPorId)).includes(sesion.usuarioId)) {
      decidibles.add(x.id);
    }
  }

  // La regla de `puedeVerActividad`, con lo ya leído: la de un plan aprobado, para quien ve el hallazgo completo, su
  // responsable o quien registró un seguimiento en ella.
  const seAbre = (a: (typeof actividades)[number]) =>
    a.fin_original !== null && (ve === "completo" || Number(a.responsable_id) === sesion.usuarioId || a.siguio === true);
  const actividadesDe = (accionId: number): ActividadDeDetalle[] =>
    actividades
      .filter((a) => Number(a.accion_id) === accionId)
      .map((a) => ({
        id: Number(a.id),
        orden: Number(a.orden),
        descripcion: a.descripcion as string,
        responsableId: Number(a.responsable_id),
        responsable: a.responsable as string,
        responsableActivo: a.responsable_activo === true,
        inicio: a.inicio as string,
        finOriginal: (a.fin_original as string | null) ?? null,
        fin: a.fin as string,
        vence: a.vence as string,
        avance: Number(a.avance),
        estado: a.estado as string,
        reprogramaciones: Number(a.reprogramaciones),
        terminadaEn: (a.terminada_en as Date | null) ?? null,
        verificacion: (a.verificacion as string | null) ?? null,
        seAbre: seAbre(a),
        gerenciaEn: (a.gerencia_en as Date | null) ?? null,
        verificacionNota: ve === "completo" ? textoONulo(a.verificacion_nota) : null,
        corregirAntesDe: (a.corregir_antes_de as string | null) ?? null,
        evidencias: ve === "completo" ? Number(a.evidencias) : null,
      }));
  const completo = ve === "completo";
  // En una reasignación, `antes` y `despues` son ids de usuario (el CASE guarda el cast: otros eventos usan `antes` para otra
  // cosa).
  const eventos = completo
    ? await sql`SELECT e.id, e.tipo, e.ronda, e.detalle, e.fuera, e.ocurrio_en, u.nombre AS quien, ua.nombre AS de, ud.nombre AS a
        FROM mejora_eventos e LEFT JOIN usuarios u ON u.id = e.usuario_id
        LEFT JOIN usuarios ua ON ua.id = (CASE WHEN e.tipo = 'reasignada' AND jsonb_typeof(e.detalle->'antes') = 'number'
          THEN (e.detalle->>'antes')::bigint END)
        LEFT JOIN usuarios ud ON ud.id = (CASE WHEN e.tipo = 'reasignada' AND jsonb_typeof(e.detalle->'despues') = 'number'
          THEN (e.detalle->>'despues')::bigint END)
        WHERE e.hallazgo_id = ${id} ORDER BY e.ocurrio_en, e.id`
    : [];
  // Lo que mostró la evaluación de cada ronda (el último evento que la evaluó), solo a quien ve el hallazgo completo.
  const vistoDeRonda = new Map<number, unknown>();
  for (const e of eventos) {
    if (e.tipo !== "evaluar_eficaz" && e.tipo !== "evaluar_no_eficaz") continue;
    const d = e.detalle as Record<string, unknown> | null;
    if (d && typeof d === "object" && "visto" in d) vistoDeRonda.set(Number(e.ronda), d.visto);
  }
  const rondaActual = rondas.find((r) => Number(r.numero) === h.ronda);
  const indicadorEficacia = idONulo(rondaActual?.indicador_eficacia_id);
  // Quién ve qué indicador, en una consulta: los que nombran lo congelado y los enlaces.
  const visibles = await componentesVisibles(sql, sesion, [
    ...[...vistoDeRonda.values()].flatMap((v) => {
      const i = indicadorDeLoVisto(v);
      return i === null ? [] : [i];
    }),
    ...[idONulo(f.indicador_id), indicadorEficacia].filter((i): i is number => i !== null),
  ]);
  const verificacionDe = (r: (typeof rondas)[number]): VerificacionDeRonda | null =>
    r.verificada_en === null || r.verificada_en === undefined
      ? null
      : {
          por: (r.verificador as string | null) ?? "",
          en: r.verificada_en as Date,
          metodos: leerMetodos(r.verificacion_metodos),
          nota: completo ? textoONulo(r.verificacion_nota) : null,
        };
  const evaluacionDe = (r: (typeof rondas)[number]): EvaluacionDeRonda | null =>
    r.evaluada_en === null || r.evaluada_en === undefined || (r.resultado !== "eficaz" && r.resultado !== "no_eficaz")
      ? null
      : {
          resultado: r.resultado,
          por: (r.evaluador as string | null) ?? "",
          en: r.evaluada_en as Date,
          criterios: leerCriterios(r.evaluacion_criterios),
          desde: (r.evaluacion_desde as string | null) ?? null,
          hasta: (r.evaluacion_hasta as string | null) ?? null,
          justificacion: completo ? textoONulo(r.evaluacion_justificacion) : null,
          visto: completo ? vistoParaQuienLee(vistoDeRonda.get(Number(r.numero)), visibles) : null,
        };

  const rondasDeDetalle: RondaDeDetalle[] = rondas.map((r) => ({
    id: Number(r.id),
    numero: Number(r.numero),
    estadoPlan: r.estado_plan as string,
    formularAntesDe: (r.formular_antes_de as Date | null) ?? null,
    enviadoEn: (r.enviado_en as Date | null) ?? null,
    aprobadoEn: (r.aprobado_en as Date | null) ?? null,
    aprobadoRol: (r.aprobado_rol as string | null) ?? null,
    aprobadoFuera: (r.aprobado_fuera as string | null) ?? null,
    requiereRecursos: r.requiere_recursos === true,
    notaRecursos: (r.nota_recursos as string | null) ?? null,
    elaboroAdmin: r.elaboro_admin === true,
    fechaEvaluacion: (r.fecha_evaluacion as string | null) ?? null,
    cierrePrevisto: (r.cierre_previsto as Date | null) ?? null,
    criterios: r.criterios ?? null,
    criterioOtro: (r.criterio_otro as string | null) ?? null,
    indicadorEficaciaId: idONulo(r.indicador_eficacia_id),
    resultado: (r.resultado as string | null) ?? null,
    similares: (r.similares as boolean | null) ?? null,
    similaresDetalle: (r.similares_detalle as string | null) ?? null,
    cambios: r.cambios ?? null,
    analisis: analisis
      .filter((x) => Number(x.ronda_id) === Number(r.id))
      .map((x) => ({
        id: Number(x.id),
        orden: Number(x.orden),
        metodo: x.metodo as string,
        equipo: (x.equipo as string | null) ?? null,
        observaciones: (x.observaciones as string | null) ?? null,
        contenido: x.contenido,
      })),
    causas: causas
      .filter((x) => Number(x.ronda_id) === Number(r.id))
      .map((x) => ({
        id: Number(x.id),
        orden: Number(x.orden),
        texto: x.texto as string,
        sinAccionPorque: (x.sin_accion_porque as string | null) ?? null,
      })),
    acciones: acciones
      .filter((x) => Number(x.ronda_id) === Number(r.id))
      .map((x) => {
        const suyas = actividadesDe(Number(x.id));
        return {
          id: Number(x.id),
          orden: Number(x.orden),
          tipo: x.tipo as string,
          descripcion: x.descripcion as string,
          recursos: (x.recursos as string | null) ?? null,
          indicadorCumplimiento: (x.indicador_cumplimiento as string | null) ?? null,
          meta: (x.meta as string | null) ?? null,
          causaIds: vinculos.filter((v) => Number(v.accion_id) === Number(x.id)).map((v) => Number(v.causa_id)),
          avance: avanceDeAccion(
            suyas.filter((a) => a.finOriginal !== null).map((a) => ({ avance: a.avance, estado: a.estado as EstadoActividad })),
          ),
          actividades: suyas,
        };
      }),
    ajustes: ajustes
      .filter((x) => x.rondaId === Number(r.id))
      .map((x): AjusteDeDetalle => ({ ...sinLaFila(x), puedeDecidir: decidibles.has(x.id) })),
    verificacion: verificacionDe(r),
    evaluacion: evaluacionDe(r),
  }));

  const reincidente = await anterior;
  const enlaces = await enlacesDe(sql, sesion, {
    id: h.id,
    reincidente: reincidente && "id" in reincidente ? reincidente : null,
    derivadoDe: idONulo(f.derivado_de),
    documentoId: idONulo(f.documento_id),
    requisitoDocumentoId: idONulo(f.requisito_documento_id),
    requisitoNormaId: idONulo(f.requisito_norma_id),
    indicadorId: idONulo(f.indicador_id),
    medicionId: idONulo(f.medicion_id),
    indicadorEficaciaId: indicadorEficacia,
    visibles,
  });
  const formulado = (rondaActual?.formulado_en as Date | null | undefined) ?? null;
  const formularAntes = (rondaActual?.formular_antes_de as Date | null | undefined) ?? null;
  const fechas: FechasDeHallazgo = {
    planFormulado: formulado ? { cuando: formulado, aTiempo: formularAntes === null || formulado <= formularAntes } : null,
    cierrePrevisto: (rondaActual?.cierre_previsto as Date | null | undefined) ?? null,
    evaluableDesde: evaluable?.desde ?? null,
    reprogramaciones: {
      aprobadas: Number(rondaActual?.reprogramaciones_aprobadas ?? 0),
      pedidas: Number(rondaActual?.reprogramaciones_pedidas ?? 0),
    },
  };

  // Un hallazgo cargado sin su formato firmado no avanza (spec §15): «Lo que sigue» lo dice y no ofrece el paso.
  const confirmada = f.cargado !== true || (await cargaConfirmada(sql, h.id));
  const clasificado = (await clasificacionDe(sql, [h.id])).get(h.id);
  const conEnlace = clasificado?.planId != null && (await puedeVerPlan(clasificado.planId, sesion, { sql }));
  const ocurrencias = completo
    ? await sql`SELECT o.id, o.descripcion, o.origen, o.reporte_id, to_char(o.fecha, 'YYYY-MM-DD') AS fecha, u.nombre AS quien
        FROM mejora_ocurrencias o JOIN usuarios u ON u.id = o.registrado_por
        WHERE o.hallazgo_id = ${id} ORDER BY o.fecha, o.id`
    : [];
  return {
    ve,
    id: h.id,
    codigo: h.codigo,
    titulo: f.titulo as string,
    descripcion: f.descripcion as string,
    clase: h.clase,
    criticidad: h.criticidad,
    origen: h.origen,
    fuente: (f.fuente as string | null) ?? null,
    referenciaCaso: (f.referencia_caso as string | null) ?? null,
    detectadoEn: f.detectado as string,
    procesoId: h.procesoId,
    proceso: f.proceso as string,
    requisitoClausula: (f.requisito_clausula as string | null) ?? null,
    requisitoNormaId: idONulo(f.requisito_norma_id),
    requisitoDocumentoId: idONulo(f.requisito_documento_id),
    riesgo: (f.riesgo as string | null) ?? null,
    estado: h.estado,
    etiqueta: etiquetaDeEstado(h, { yaSePuedeEvaluar: evaluable?.yaSePuede === true }),
    ronda: h.ronda,
    registradoPor: f.registrador as string,
    registradoPorId: Number(f.registrado_por),
    registradoEn: f.registrado_en as Date,
    naceDeUnReporte: f.reporte_id !== null,
    // La identidad de quien reportó, solo a los roles de control (cultura de reporte no punitiva, F15-DC5).
    reportadoPor: f.reporte_id !== null && puede(sesion, "mejora.ver_todo") ? (f.reportero as string) : null,
    reporteId: f.reporte_id !== null && ve === "completo" ? Number(f.reporte_id) : null,
    cargado: f.cargado === true,
    cargaConfirmada: confirmada,
    reincidenteDe: reincidente,
    marcas: marcasDeHallazgo(h, {
      cargado: f.cargado === true,
      // La misma regla de la lista y de la pasada (`venceLaActividad`): devuelta, la fecha para corregir; sin el formato de una
      // carga, nada vence todavía.
      algunaActividadVencida: confirmada && actividades.some((a) => a.fin_original !== null && !["terminada", "cancelada"].includes(a.estado as string) && (a.vence as string) < fechaEnZona(ahora, zonaHoraria())),
    }),
    fechaLimiteEnte: (f.limite_ente as string | null) ?? null,
    respuestaAlEnte: f.respuesta_ente ? { enviadaEn: f.respuesta_ente as string, por: (f.respondio as string | null) ?? "" } : null,
    vence: esTerminal(h.estado) ? null : ((f.vence_en as Date | null) ?? null),
    correccion: {
      requerida: h.correccionRequerida,
      descripcion: (f.correccion_descripcion as string | null) ?? null,
      responsable: (f.correccion_responsable as string | null) ?? (f.correccion_responsable_nombre as string | null) ?? null,
      implementadaEn: (f.implementada as string | null) ?? null,
      registradaEn: (f.correccion_registrada_en as Date | null) ?? null,
      validadaPor: (f.validador as string | null) ?? null,
      validadaEn: (f.validada_en as Date | null) ?? null,
    },
    decision: {
      accionRequerida: h.accionRequerida,
      justificacion: (f.accion_justificacion as string | null) ?? null,
      decididaEn: (f.accion_decidida_en as Date | null) ?? null,
    },
    cierre: {
      resultado: h.resultadoCierre,
      cerradoEn: (f.cerrado_en as Date | null) ?? null,
      cerradoPor: (f.cerrador as string | null) ?? null,
      // El cierre en texto es de quien ve el hallazgo completo (spec §6.3); quien lo ve por una actividad, el estado y la fecha.
      lecciones: completo ? ((f.lecciones as string | null) ?? null) : null,
      cambiosAtendidos: completo ? ((f.cambios_atendidos as string | null) ?? null) : null,
      anuladoMotivo: (f.anulado_motivo as string | null) ?? null,
    },
    rondas: rondasDeDetalle,
    rondasAnteriores: rondasDeDetalle.filter((r) => r.numero < h.ronda),
    fechas,
    enlaces,
    ocurrencias: ocurrencias.map((o) => ({
      id: Number(o.id),
      fecha: o.fecha as string,
      descripcion: o.descripcion as string,
      origen: o.origen as string,
      quien: o.quien as string,
      reporteId: idONulo(o.reporte_id),
    })),
    eventos: eventos.map((e) => ({
      id: Number(e.id),
      tipo: e.tipo as string,
      ronda: Number(e.ronda),
      detalle: sinLoCongelado(e.detalle),
      quien: (e.quien as string | null) ?? null,
      cuando: e.ocurrio_en as Date,
      fuera: e.fuera === true,
      personas: e.tipo === "reasignada" && e.de && e.a ? { de: e.de as string, a: e.a as string } : null,
    })),
    turno,
    loQueSigue: confirmada || esTerminal(h.estado) ? await loQueSigue(sql, h, sesion, turno, evaluable) : sinElFormato(h),
    avance: avanceDeHallazgo(rondasDeDetalle.find((r) => r.numero === h.ronda)?.acciones.map((a) => a.avance) ?? []),
    clasificacion: {
      plan:
        clasificado?.planId != null
          ? { id: clasificado.planId, codigo: clasificado.planCodigo ?? "", nombre: clasificado.planNombre ?? "", enlace: conEnlace }
          : null,
      objetivo: clasificado?.objetivo ?? null,
      objetivoId: clasificado?.objetivoId ?? null,
      puedeClasificar: completo && puede(sesion, "mejora.planes"),
    },
  };
}
