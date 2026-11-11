/**
 * El cierre del mes y la reapertura de una medición (spec 14 §8.7, §9 y §19.4; F14-DC3, F14-DC9 y F14-DC31; Tarea 12 de
 * la 14A). Todo es de quien administra, sin clave.
 *
 * - «Cerrar hasta marzo» alcanza toda medición sin cerrar cuyo periodo terminó en marzo o antes, salvo las que siguen
 *   dentro de su plazo de reporte, los históricos sin registrar (F14-DC3) y las de otra periodicidad que dejó un cambio
 *   mayor (`esDeOtraPeriodicidad`). Las cierra como están: la reportada con su resultado, la vacía como «Sin dato» y la que
 *   tiene datos sin el análisis exigido con la marca «sin análisis». También las de un indicador retirado, que siguen su
 *   curso hasta el cierre. Un histórico no tiene plazo: registrado, lo cierra el cierre que lo alcance.
 * - Cerrar no es un cálculo: escribe `estado`, `cierre_id` y `sin_analisis` sin pasar por `recalcularMedicion`.
 * - Un cierre no se modifica (trigger): su resumen se calcula antes de insertarlo, sobre las mediciones ya bloqueadas, y
 *   el `UPDATE … RETURNING` debe alcanzar exactamente las que cuenta.
 * - Reabrir es el único cambio que el trigger admite en una medición cerrada (quién, cuándo y por qué); después
 *   `recalcularMedicion`, el único camino de cálculo (spec §8.2), decide si queda reportada o abierta y deja el evento
 *   `reapertura`. Se cierra otra vez con el siguiente cierre o con «Cerrar de nuevo».
 *
 * Candados: los indicadores `FOR SHARE`, por id, antes que las mediciones `FOR UPDATE`, y estas por indicador, periodo e
 * id (el orden de `registrarHistoricos` dentro de un indicador): así un cierre no se interbloquea con un reporte ni con un
 * lote de históricos.
 */
import { obtenerSql, type Cliente } from "@/db/cliente";
import { registrarAuditoria } from "@/db/consultas/admin";
import { avisarA } from "@/db/consultas/avisos-vencimiento";
import { enTransaccion, type SesionFlujo } from "@/db/consultas/flujo/contrato";
import { puedeMedir, puedeVerIndicador, responsablesDeMedir, type SujetoVisibilidad } from "@/lib/alcance";
import { periodoDe, type Periodo } from "@/lib/indicadores-documentales/periodo";
import { analisisCompleto, analisisExigido } from "@/lib/indicadores/estados";
import { historialDeCorreccion, type EntradaDeHistorial, type EventoDeMedicion } from "@/lib/indicadores/historial";
import { anterior, periodoQueContiene, versionQueRigeEntre } from "@/lib/indicadores/periodos";
import { ErrorIndicador, type Semaforo, type TipoEvento } from "@/lib/indicadores/tipos";
import { ErrorPermiso, puede, type SujetoPermiso } from "@/lib/permisos";
import { fechaEnZona } from "@/lib/tramites/plazos";
import { zonaHoraria } from "@/lib/zona-horaria";
import {
  analisisDe,
  asegurarMediciones,
  conMayuscula,
  contextoDeMedicion,
  esDeOtraPeriodicidad,
  NO_EXISTE,
  recalcularMedicion,
  versionesAprobadas,
  type CondicionDePersona,
  type VersionDeCalculo,
} from "./mediciones";
import { sinRespuesta } from "./observaciones";

export type { EntradaDeHistorial } from "@/lib/indicadores/historial";

type Opciones = { sql?: Cliente; ahora?: Date };

const MES_INVALIDO = "El mes no es válido";
const NO_TERMINO = "Ese mes no ha terminado";
const YA_CERRADO = "Ese mes ya está cerrado";
const SOLO_CERRADA = "Solo se reabre una medición cerrada";
const NO_REABIERTA = "Solo se cierra de nuevo una medición reabierta";

/** Lo mínimo y lo máximo de la justificación de una reapertura (spec §8.7). */
export const JUSTIFICACION_MINIMA = 10;
export const JUSTIFICACION_MAXIMA = 1000;

export type ResumenDeCierre = {
  mes: string;
  yaCerrado: boolean;
  aCerrar: number;
  reportadas: number;
  /** Las que quedarán «Sin dato», con quién debía medirlas; por proceso, código y periodo. */
  sinDato: { codigo: string; nombre: string; proceso: string; periodo: string; quien: string[] }[];
  noAplica: number;
  sinAnalisis: number;
  observacionesSinRespuesta: number;
  /** No se cierran: siguen dentro de su plazo de reporte (F14-DC3). */
  enPlazo: number;
  /** No se cierran: históricos sin registrar (F14-DC3). */
  historicosSinRegistrar: number;
};

/** Lo que guarda `cierres_indicadores.resumen`: las cuentas del resumen previo, tal como quedaron al cerrar. */
type Cuentas = {
  cerradas: number;
  reportadas: number;
  sinDato: number;
  noAplica: number;
  sinAnalisis: number;
  observacionesSinRespuesta: number;
  enPlazo: number;
  historicosSinRegistrar: number;
};

function exigirAdministrar(sesion: SujetoPermiso): void {
  if (!puede(sesion, "indicadores.administrar")) throw new ErrorPermiso();
}

// ─────────────────────────────────────────────────────────────────────────────
// El mes
// ─────────────────────────────────────────────────────────────────────────────

const PATRON_MES = /^\d{4}-(0[1-9]|1[0-2])$/;

/** El mes en curso en la zona de la instalación (`AAAA-MM`). */
const mesEnCurso = (ahora: Date, zona: string) => periodoQueContiene("mensual", ahora, zona).clave;

/** El mes que sigue a `mes` (`AAAA-MM`). */
const mesSiguiente = (mes: string, zona: string) => periodoQueContiene("mensual", new Date(periodoDe(mes, zona)!.hasta.getTime() + 1), zona).clave;

/**
 * El mes que se propone cerrar (spec §9.1): el siguiente al último cerrado o, sin cierres, el anterior al mes en curso;
 * `null` si ese mes todavía no ha terminado. Pura.
 */
export function mesPorOmisionDe(ultimo: string | null, ahora: Date, zona: string): string | null {
  const actual = mesEnCurso(ahora, zona);
  const candidato = ultimo ? mesSiguiente(ultimo, zona) : anterior(actual);
  return candidato < actual ? candidato : null;
}

/** Los meses que tiene sentido cerrar: del de por omisión al último que terminó. Pura. */
export function mesesParaCerrar(porOmision: string | null, ahora: Date, zona: string): string[] {
  if (!porOmision || !PATRON_MES.test(porOmision)) return [];
  const actual = mesEnCurso(ahora, zona);
  const salida: string[] = [];
  for (let mes = porOmision; mes < actual; mes = mesSiguiente(mes, zona)) salida.push(mes);
  return salida;
}

/** «Marzo de 2026». */
export const etiquetaDeMes = (mes: string) => conMayuscula(periodoDe(mes, zonaHoraria())?.etiqueta ?? mes);

/** El mes `AAAA-MM`, si ya terminó; si no, el error de negocio que corresponde. */
function mesTerminado(mes: unknown, ahora: Date): Periodo {
  const periodo = typeof mes === "string" && PATRON_MES.test(mes) ? periodoDe(mes, zonaHoraria()) : null;
  if (!periodo) throw new ErrorIndicador(MES_INVALIDO);
  if (periodo.hasta.getTime() >= ahora.getTime()) throw new ErrorIndicador(NO_TERMINO);
  return periodo;
}

/** `cierres_indicadores.mes` guarda el último día del mes cerrado. */
const ultimoDia = (periodo: Periodo) => fechaEnZona(periodo.hasta, zonaHoraria());

async function estaCerrado(sql: Cliente, periodo: Periodo): Promise<boolean> {
  return (await sql`SELECT 1 AS hay FROM cierres_indicadores WHERE mes = ${ultimoDia(periodo)}`).length > 0;
}

/** El mes que se propone cerrar (spec §9.1), según el último cerrado de la base. */
export async function mesPorOmision(opciones?: Opciones): Promise<string | null> {
  const sql = opciones?.sql ?? obtenerSql();
  const [u] = await sql`SELECT to_char(max(mes), 'YYYY-MM') AS mes FROM cierres_indicadores`;
  return mesPorOmisionDe((u?.mes as string | null) ?? null, opciones?.ahora ?? new Date(), zonaHoraria());
}

// ─────────────────────────────────────────────────────────────────────────────
// Qué alcanza un cierre
// ─────────────────────────────────────────────────────────────────────────────

/** Cómo queda una medición alcanzada: los cuatro grupos del resumen, que se reparten todas. */
type Grupo = "reportada" | "sin_dato" | "no_aplica" | "sin_analisis";

type Alcanzada = { id: number; indicadorId: number; codigo: string; proceso: string; periodo: string; estado: string; grupo: Grupo };

type Clasificacion = {
  alcanzadas: Alcanzada[];
  enPlazo: number;
  historicosSinRegistrar: number;
  /** Las versiones aprobadas de cada indicador leído (la primera es la vigente). */
  versiones: Map<number, VersionDeCalculo[]>;
};

/**
 * «No aplica»; sin resultado, «Sin dato»; con resultado y sin el análisis que se le exige (`analisisCompleto`, la regla
 * de la tabla del año), «sin análisis»; lo demás, reportada (también la que solo espera el soporte obligatorio).
 */
function grupoDe(m: Record<string, unknown>): Grupo {
  if (m.no_aplica === true) return "no_aplica";
  if (m.resultado_exacto === null || m.resultado_exacto === undefined) return "sin_dato";
  const exigido = analisisExigido({
    semaforo: (m.semaforo as Semaforo | null) ?? null,
    repetido: m.incumplimiento_repetido === true,
    historica: m.historica === true,
    noAplica: false,
  });
  return analisisCompleto(exigido, analisisDe(m)) ? "reportada" : "sin_analisis";
}

/**
 * Las mediciones sin cerrar cuyo periodo terminó en `hasta` o antes, repartidas en lo que el cierre alcanza (por grupo)
 * y lo que deja abierto. Una sola regla para el resumen previo y el cierre; con `bloquear`, dentro de la transacción del
 * cierre, con los candados del encabezado.
 */
async function clasificar(sql: Cliente, hasta: Date, ahora: Date, bloquear: boolean): Promise<Clasificacion> {
  const zona = zonaHoraria();
  if (bloquear) {
    await sql`SELECT id FROM indicadores
      WHERE id IN (SELECT indicador_id FROM mediciones WHERE hasta <= ${hasta} AND estado <> 'cerrada')
      ORDER BY id FOR SHARE`;
  }
  const filas = await sql`SELECT m.id, m.indicador_id, m.periodo, m.estado, m.historica, m.no_aplica, m.reportada_en, m.vence_en,
      m.resultado_exacto, m.semaforo, m.incumplimiento_repetido, m.analisis, m.causa, m.accion_propuesta,
      i.codigo, p.nombre AS proceso
    FROM mediciones m JOIN indicadores i ON i.id = m.indicador_id JOIN procesos p ON p.id = i.proceso_id
    WHERE m.hasta <= ${hasta} AND m.estado <> 'cerrada'
    ORDER BY m.indicador_id, m.desde, m.id
    ${bloquear ? sql`FOR UPDATE OF m` : sql``}`;
  const versiones = new Map<number, VersionDeCalculo[]>();
  const salida: Clasificacion = { alcanzadas: [], enPlazo: 0, historicosSinRegistrar: 0, versiones };
  for (const m of filas) {
    const indicadorId = Number(m.indicador_id);
    if (!versiones.has(indicadorId)) versiones.set(indicadorId, await versionesAprobadas(sql, indicadorId));
    const clave = m.periodo as string;
    const periodo = periodoDe(clave, zona);
    const version = periodo ? versionQueRigeEntre(versiones.get(indicadorId)!, periodo, zona) : null;
    if (!version || esDeOtraPeriodicidad(clave, version)) continue;
    const historica = m.historica === true;
    if (historica && m.no_aplica !== true && m.reportada_en === null) {
      salida.historicosSinRegistrar += 1;
      continue;
    }
    if (!historica && new Date(m.vence_en as string).getTime() >= ahora.getTime()) {
      salida.enPlazo += 1;
      continue;
    }
    salida.alcanzadas.push({
      id: Number(m.id),
      indicadorId,
      codigo: m.codigo as string,
      proceso: m.proceso as string,
      periodo: clave,
      estado: m.estado as string,
      grupo: grupoDe(m),
    });
  }
  return salida;
}

function cuentas(c: Clasificacion, observacionesSinRespuesta: number): Cuentas {
  const de = (g: Grupo) => c.alcanzadas.filter((a) => a.grupo === g).length;
  return {
    cerradas: c.alcanzadas.length,
    reportadas: de("reportada"),
    sinDato: de("sin_dato"),
    noAplica: de("no_aplica"),
    sinAnalisis: de("sin_analisis"),
    observacionesSinRespuesta,
    enPlazo: c.enPlazo,
    historicosSinRegistrar: c.historicosSinRegistrar,
  };
}

async function nombresDe(sql: Cliente, ids: number[]): Promise<string[]> {
  if (ids.length === 0) return [];
  return (await sql`SELECT nombre FROM usuarios WHERE id IN ${sql(ids)} ORDER BY nombre, id`).map((f) => f.nombre as string);
}

/**
 * El resumen previo del cierre de `mes` (spec §9.2): cuántas mediciones se cerrarán y cómo, las que quedarán sin dato
 * con quién debía medirlas, las observaciones sin respuesta y los dos grupos que no se cierran. Abre antes los periodos
 * que hayan terminado (F14-DC12). No escribe nada más.
 */
export async function resumenDeCierre(sesion: SujetoPermiso, mes: string, opciones?: Opciones): Promise<ResumenDeCierre> {
  exigirAdministrar(sesion);
  const sql = opciones?.sql ?? obtenerSql();
  const ahora = opciones?.ahora ?? new Date();
  const periodo = mesTerminado(mes, ahora);
  await asegurarMediciones({ sql, ahora });
  const c = await clasificar(sql, periodo.hasta, ahora, false);
  const n = cuentas(c, await sinRespuesta(sql, { hasta: periodo.hasta }));
  const quien = new Map<number, string[]>();
  const sinDato: ResumenDeCierre["sinDato"] = [];
  for (const a of c.alcanzadas) {
    if (a.grupo !== "sin_dato") continue;
    if (!quien.has(a.indicadorId)) quien.set(a.indicadorId, await nombresDe(sql, await responsablesDeMedir(a.indicadorId, { sql })));
    sinDato.push({
      codigo: a.codigo,
      nombre: c.versiones.get(a.indicadorId)?.[0]?.nombre ?? a.codigo,
      proceso: a.proceso,
      periodo: a.periodo,
      quien: quien.get(a.indicadorId)!,
    });
  }
  sinDato.sort((x, y) => x.proceso.localeCompare(y.proceso, "es") || x.codigo.localeCompare(y.codigo, "es") || x.periodo.localeCompare(y.periodo));
  return {
    mes: periodo.clave,
    yaCerrado: await estaCerrado(sql, periodo),
    aCerrar: n.cerradas,
    reportadas: n.reportadas,
    sinDato,
    noAplica: n.noAplica,
    sinAnalisis: n.sinAnalisis,
    observacionesSinRespuesta: n.observacionesSinRespuesta,
    enPlazo: n.enPlazo,
    historicosSinRegistrar: n.historicosSinRegistrar,
  };
}

const mesRepetido = (err: unknown) =>
  (err as { code?: string }).code === "23505" && (err as { constraint_name?: string }).constraint_name === "cierres_indicadores_mes_unique";

/**
 * Cierra `mes` (spec §9): en una transacción, la fila del cierre con las cuentas del resumen y cada medición alcanzada a
 * `cerrada`, con su evento `cierre`. Rechaza un mes que no ha terminado o que ya se cerró (también si otro cierre del
 * mismo mes gana la carrera: el `23505` de su índice único).
 */
export async function cerrarMes(sesion: SesionFlujo, mes: string, opciones?: Opciones): Promise<{ cierreId: number; cerradas: number }> {
  exigirAdministrar(sesion);
  const sql = opciones?.sql ?? obtenerSql();
  const ahora = opciones?.ahora ?? new Date();
  const periodo = mesTerminado(mes, ahora);
  if (await estaCerrado(sql, periodo)) throw new ErrorIndicador(YA_CERRADO);
  await asegurarMediciones({ sql, ahora });
  try {
    return await enTransaccion(sql, async (tx) => {
      if (await estaCerrado(tx, periodo)) throw new ErrorIndicador(YA_CERRADO);
      const c = await clasificar(tx, periodo.hasta, ahora, true);
      const resumen = cuentas(c, await sinRespuesta(tx, { hasta: periodo.hasta }));
      const [cierre] = await tx`INSERT INTO cierres_indicadores (mes, cerrado_por, cerrado_en, resumen)
        VALUES (${ultimoDia(periodo)}, ${sesion.usuarioId}, ${ahora}, ${tx.json(resumen as never)}) RETURNING id`;
      const cierreId = Number(cierre.id);
      const ids = c.alcanzadas.map((a) => a.id);
      if (ids.length > 0) {
        const lote = () => tx`unnest(
          ${tx.array(ids)}::bigint[],
          ${tx.array(c.alcanzadas.map((a) => a.estado))}::text[],
          ${tx.array(c.alcanzadas.map((a) => a.grupo === "sin_analisis"))}::boolean[]
        ) AS x(id, estado, sin_analisis)`;
        const cerradas = await tx`UPDATE mediciones m SET estado = 'cerrada', cierre_id = ${cierreId}, sin_analisis = x.sin_analisis
          FROM ${lote()} WHERE m.id = x.id AND m.estado <> 'cerrada' RETURNING m.id`;
        if (cerradas.length !== resumen.cerradas) {
          throw new Error(`El cierre alcanzó ${cerradas.length} de las ${resumen.cerradas} mediciones del resumen: no se cerró nada`);
        }
        await tx`INSERT INTO medicion_eventos (medicion_id, tipo, usuario_id, detalle, creado_en)
          SELECT x.id, 'cierre', ${sesion.usuarioId},
            jsonb_build_object('cierreId', ${cierreId}::bigint, 'mes', ${periodo.clave}::text, 'sinAnalisis', x.sin_analisis,
              'antes', jsonb_build_object('estado', x.estado), 'despues', jsonb_build_object('estado', 'cerrada')),
            ${ahora}
          FROM ${lote()} ORDER BY x.id`;
      }
      await registrarAuditoria(tx, {
        usuarioId: sesion.usuarioId,
        accion: "indicadores_mes_cerrado",
        entidad: "cierre_indicadores",
        entidadId: cierreId,
        detalle: { mes: periodo.clave, ...resumen },
      });
      return { cierreId, cerradas: resumen.cerradas };
    });
  } catch (err) {
    if (mesRepetido(err)) throw new ErrorIndicador(YA_CERRADO);
    throw err;
  }
}

/** Los cierres hechos, del mes más reciente al más antiguo. Quien llama comprueba que la persona administra. */
export async function cierres(opciones?: { sql?: Cliente }): Promise<{ mes: string; cerradoPor: string; cerradoEn: Date; cerradas: number }[]> {
  const sql = opciones?.sql ?? obtenerSql();
  const filas = await sql`SELECT to_char(c.mes, 'YYYY-MM') AS mes, u.nombre, c.cerrado_en, c.resumen->>'cerradas' AS cerradas
    FROM cierres_indicadores c JOIN usuarios u ON u.id = c.cerrado_por
    ORDER BY c.mes DESC`;
  return filas.map((f) => ({
    mes: f.mes as string,
    cerradoPor: f.nombre as string,
    cerradoEn: new Date(f.cerrado_en as string),
    cerradas: Number(f.cerradas ?? 0),
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Reabrir y cerrar de nuevo
// ─────────────────────────────────────────────────────────────────────────────

/** El permiso ya se exigió: quien administra reabre sin ser quien mide (`contextoDeMedicion` pide medir por omisión). */
const ADMINISTRA: CondicionDePersona = async () => ({ puede: true, sinMedidor: false });
const COMO_ADMINISTRADOR = { admiteCerrada: true, exigir: ADMINISTRA };

function justificacionDe(valor: unknown): string {
  const t = typeof valor === "string" ? valor.trim() : "";
  if (t.length < JUSTIFICACION_MINIMA) throw new ErrorIndicador(`La justificación debe tener al menos ${JUSTIFICACION_MINIMA} caracteres`);
  if (t.length > JUSTIFICACION_MAXIMA) throw new ErrorIndicador(`La justificación no puede pasar de ${JUSTIFICACION_MAXIMA} caracteres`);
  return t;
}

function soloCerrada(m: Record<string, unknown>): void {
  if (m.estado !== "cerrada") throw new ErrorIndicador(SOLO_CERRADA);
}

const idValido = (id: number) => Number.isSafeInteger(id) && id > 0;

/**
 * Reabre una medición cerrada (spec §8.7, F14-DC31) con justificación y sin clave: queda «Corregida», vuelve a
 * `reportada` o a `abierta` (lo decide `recalcularMedicion`, con el evento `reapertura`) y se avisa a quienes miden, salvo
 * a quien reabre. Si quien reabre es también quien mide, el evento y la bitácora lo marcan (`propioMedidor`). Un
 * indicador retirado no se reabre: nadie podría corregirlo.
 */
export async function reabrirMedicion(sesion: SesionFlujo, d: { medicionId: number; justificacion: string }, opciones?: Opciones): Promise<void> {
  exigirAdministrar(sesion);
  const justificacion = justificacionDe(d.justificacion);
  if (!idValido(d.medicionId)) throw new ErrorIndicador(NO_EXISTE);
  const sql = opciones?.sql ?? obtenerSql();
  const ahora = opciones?.ahora ?? new Date();
  soloCerrada((await contextoDeMedicion(sql, sesion, d.medicionId, false, COMO_ADMINISTRADOR)).medicion);
  await enTransaccion(sql, async (tx) => {
    const ctx = await contextoDeMedicion(tx, sesion, d.medicionId, true, COMO_ADMINISTRADOR);
    const m = ctx.medicion;
    soloCerrada(m);
    const cierre =
      m.cierre_id === null
        ? null
        : (((await tx`SELECT to_char(mes, 'YYYY-MM') AS mes FROM cierres_indicadores WHERE id = ${m.cierre_id as number}`)[0]?.mes as string | undefined) ?? null);
    // El único cambio que el trigger admite en una cerrada; el estado lo decide enseguida el cálculo.
    await tx`UPDATE mediciones SET estado = 'abierta', reabierta_por = ${sesion.usuarioId}, reabierta_en = ${ahora},
        reabierta_motivo = ${justificacion}, corregida = true, cierre_id = NULL, sin_analisis = false
      WHERE id = ${m.id}`;
    const propioMedidor = (await puedeMedir(ctx.indicador.id, sesion, { sql: tx })).puede;
    const marca = propioMedidor ? { propioMedidor: true } : {};
    // `cerrada` en el antes y el después: el evento queda aunque ninguna columna calculada cambie.
    const r = await recalcularMedicion(tx, m.id, {
      ahora,
      actorId: sesion.usuarioId,
      evento: "reapertura",
      detalle: { justificacion, cierre, ...marca, antes: { cerrada: true }, despues: { cerrada: false } },
    });
    const codigo = ctx.indicador.codigo;
    const periodo = m.periodo as string;
    const destinatarios = (await responsablesDeMedir(ctx.indicador.id, { sql: tx })).filter((u) => u !== sesion.usuarioId);
    if (destinatarios.length > 0) {
      await avisarA(
        tx,
        {
          tipo: "indicadores.reabierta",
          titulo: `Medición reabierta en ${codigo}`,
          enlace: `/indicadores/${encodeURIComponent(codigo)}?vista=resultados&anio=${periodo.slice(0, 4)}`,
          entidad: "medicion",
          entidadId: m.id,
        },
        destinatarios.map((usuarioId) => ({ usuarioId, cuerpo: `${sesion.nombre} reabrió ${codigo}, ${ctx.periodo.etiqueta}: ${justificacion}` })),
      );
    }
    await registrarAuditoria(tx, {
      usuarioId: sesion.usuarioId,
      accion: "medicion_reabierta",
      entidad: "medicion",
      entidadId: m.id,
      detalle: { codigo, indicadorId: ctx.indicador.id, periodo, justificacion, cierre, estado: r.estado, ...marca },
    });
  });
}

/**
 * «Cerrar de nuevo» (F14-DC31): la reabierta vuelve a `cerrada` con el último cierre, como esté (sin dato, sin análisis o
 * corregida), con su evento `cierre`. También la de un indicador que se retiró mientras estaba reabierta.
 */
export async function cerrarDeNuevo(sesion: SesionFlujo, medicionId: number, opciones?: Opciones): Promise<void> {
  exigirAdministrar(sesion);
  if (!idValido(medicionId)) throw new ErrorIndicador(NO_EXISTE);
  const sql = opciones?.sql ?? obtenerSql();
  const ahora = opciones?.ahora ?? new Date();
  await enTransaccion(sql, async (tx) => {
    // Los candados a mano: `contextoDeMedicion` rechaza un indicador retirado.
    const [i] = await tx`SELECT id, codigo FROM indicadores WHERE id = (SELECT indicador_id FROM mediciones WHERE id = ${medicionId}) FOR SHARE`;
    const [m] = await tx`SELECT * FROM mediciones WHERE id = ${medicionId} FOR UPDATE`;
    if (!i || !m || !(await puedeVerIndicador(Number(i.id), sesion, { sql: tx }))) throw new ErrorIndicador(NO_EXISTE);
    if (m.estado === "cerrada" || m.reabierta_en === null) throw new ErrorIndicador(NO_REABIERTA);
    const [c] = await tx`SELECT id, to_char(mes, 'YYYY-MM') AS mes FROM cierres_indicadores ORDER BY mes DESC LIMIT 1`;
    if (!c) throw new ErrorIndicador(NO_REABIERTA);
    const cierreId = Number(c.id);
    const sinAnalisis = grupoDe(m) === "sin_analisis";
    await tx`UPDATE mediciones SET estado = 'cerrada', cierre_id = ${cierreId}, sin_analisis = ${sinAnalisis} WHERE id = ${m.id}`;
    const detalle = { cierreId, mes: c.mes as string, deNuevo: true, sinAnalisis, antes: { estado: m.estado as string }, despues: { estado: "cerrada" } };
    await tx`INSERT INTO medicion_eventos (medicion_id, tipo, usuario_id, detalle, creado_en)
      VALUES (${m.id}, 'cierre', ${sesion.usuarioId}, ${tx.json(detalle)}, ${ahora})`;
    await registrarAuditoria(tx, {
      usuarioId: sesion.usuarioId,
      accion: "medicion_cerrada_de_nuevo",
      entidad: "medicion",
      entidadId: Number(m.id),
      detalle: { codigo: i.codigo, indicadorId: Number(i.id), periodo: m.periodo, mes: c.mes, cierreId, ...(sinAnalisis ? { sinAnalisis: true } : {}) },
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// El historial de «Corregida»
// ─────────────────────────────────────────────────────────────────────────────

/**
 * El historial de las mediciones corregidas (reabiertas alguna vez) de `medicionIds`, por medición (spec §8.7 y §6.4):
 * desde la primera reapertura, sin los soportes, para quien ve el indicador. Las demás no salen.
 */
export async function historialDeCorregidas(
  sesion: SujetoVisibilidad,
  indicadorId: number,
  medicionIds: readonly number[],
  opciones?: { sql?: Cliente },
): Promise<Map<number, EntradaDeHistorial[]>> {
  const sql = opciones?.sql ?? obtenerSql();
  const salida = new Map<number, EntradaDeHistorial[]>();
  if (medicionIds.length === 0 || !(await puedeVerIndicador(indicadorId, sesion, { sql }))) return salida;
  const corregidas = await sql`SELECT id, version_id FROM mediciones
    WHERE indicador_id = ${indicadorId} AND corregida AND id IN ${sql([...medicionIds])}`;
  if (corregidas.length === 0) return salida;
  const versiones = await versionesAprobadas(sql, indicadorId);
  const eventos = await sql`SELECT e.id, e.medicion_id, e.tipo, e.detalle, e.creado_en, u.nombre
    FROM medicion_eventos e LEFT JOIN usuarios u ON u.id = e.usuario_id
    WHERE e.medicion_id IN ${sql(corregidas.map((c) => Number(c.id)))} AND e.tipo <> 'soporte'
    ORDER BY e.medicion_id, e.id`;
  for (const c of corregidas) {
    const id = Number(c.id);
    const version = versiones.find((v) => v.id === Number(c.version_id)) ?? versiones[0];
    if (!version) continue;
    const propios: EventoDeMedicion[] = eventos
      .filter((e) => Number(e.medicion_id) === id)
      .map((e) => ({
        id: Number(e.id),
        tipo: e.tipo as TipoEvento,
        quien: (e.nombre as string | null) ?? null,
        creadoEn: new Date(e.creado_en as string),
        detalle: typeof e.detalle === "object" && e.detalle !== null ? (e.detalle as Record<string, unknown>) : {},
      }));
    salida.set(id, historialDeCorreccion(propios, { unidad: version.unidad, nombres: Object.fromEntries(version.variables.map((v) => [v.letra, v.nombre])) }));
  }
  return salida;
}
