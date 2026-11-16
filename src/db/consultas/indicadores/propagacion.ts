/**
 * La propagación de los valores ajenos (anexo 14C, §3.2 a §3.4): el valor de un dato compartido, juntado a la periodicidad
 * de cada indicador que lo usa (`valorDeDato`), se copia a cada medición abierta que lo espera, en `medicion_valores`, sin
 * usuario y con su fracción exacta cuando no cabe en cuatro decimales; después el cálculo único la calcula sola
 * (`recalcularMedicion`, `sistema: "fuente"`). Es la gemela de `tomarFotos` (`fotos.ts`) para lo que reporta una persona en
 * otro lugar.
 *
 * - **A quién:** las mediciones sin cerrar y no históricas de los indicadores activos con inicio de medición cuya versión
 *   con que se calcula (`versionesDeCalculo`) es de su periodicidad y tiene variables ajenas. Una variable tomada de otro
 *   indicador queda «falta» (sus valores llegan con los compuestos).
 * - **Idempotente:** compara la fracción copiada con la de la fuente y solo escribe si difieren, o si una medición sin
 *   variables propias ya tiene todo y aún no está reportada, o si su «No aplica» del sistema dejó de ser cierto.
 * - **Escribe solo lo ajeno:** la fila de la variable en la versión con que se calcula, sin quien la reportó, y quita las
 *   que el sistema copió en otra versión para la misma letra; si la fuente dejó de tener valor, quita la fila. Nunca toca lo
 *   que digitó una persona.
 * - **Quién reportó:** en un indicador sin variables propias, el sistema, al llegar el último valor (`reportada_en`, sin
 *   usuario); en un mixto, nadie más que quien mide.
 * - **Sin nada que medir** (§3.4): con todos los valores y la medición reportada, si la fórmula divide por cero, «No aplica»
 *   con `MOTIVO_NADA_QUE_MEDIR`; si después deja de dividir por cero, se quita. Un «No aplica» de una persona no se toca.
 * - **El plazo** (§3.4): si la medición pasa de no pedir el análisis a pedirlo y su fecha límite ya pasó (o el plazo es 0),
 *   se cuenta otra vez desde hoy con el mismo plazo (`laFuenteMueveElPlazo`), con las marcas de aviso limpias y `venceEn` en
 *   el evento.
 * - **El evento es del sistema** (`propagacion`, sin usuario): qué cambió de cada fuente (`detalle.fuentes`, con la letra,
 *   la clase, el id del dato o del indicador y el antes y el después) y los valores de todas las letras a los dos lados.
 *
 * Candados: el indicador `FOR SHARE`, después la medición `FOR UPDATE`, todo releído bajo ellos; la fuente se lee sin
 * candado (la medición que depende no bloquea la de su fuente). Primero se buscan sin candado las mediciones a las que les
 * cambiaría algo, y cada una va en su transacción: la que falla se registra, cuenta en `fallidas` y la siguiente pasada la
 * intenta otra vez. Corre justo después de la acción que cambia una fuente (`propagarSinFallar`), en la pasada de
 * vencimientos y, antes de clasificar, en el resumen y el cierre del mes.
 *
 * Módulo liviano: lo importan las acciones, la pasada y el cierre, así que no importa `lectura`, `fichas`, `aprobacion` ni
 * `operacion`.
 */
import type { Row, TransactionSql } from "postgres";
import { obtenerSql, type Cliente } from "@/db/cliente";
import { enTransaccion } from "@/db/consultas/flujo/contrato";
import { juntadoONada } from "@/lib/indicadores/acumulado";
import { calcular } from "@/lib/indicadores/calculo";
import { analisisCompleto, analisisExigido, cumpleDeFila } from "@/lib/indicadores/estados";
import { aTexto, comparar, fraccion, type Fraccion } from "@/lib/indicadores/formula/fraccion";
import { clavesFinas } from "@/lib/indicadores/periodos";
import { laFuenteMueveElPlazo } from "@/lib/indicadores/propagacion";
import { fichaDeCalculo, reglaDeTexto, valorEnTexto } from "@/lib/indicadores/reporte";
import { MOTIVO_NADA_QUE_MEDIR, type Consolidacion, type Periodicidad, type Semaforo } from "@/lib/indicadores/tipos";
import { zonaHoraria } from "@/lib/zona-horaria";
import {
  analisisDe,
  columnasDeValor,
  elegirValores,
  esDeOtraPeriodicidad,
  mide,
  recalcularMedicion,
  texto,
  valoresPorLetra,
  versionesAprobadas,
  versionesAprobadasDe,
  versionesDeCalculo,
  type ValorGuardado,
  type VersionDeCalculo,
} from "./mediciones";

type Opciones = { sql?: Cliente; ahora?: Date; indicadorIds?: readonly number[] };

/** El valor de un dato juntado para un periodo: listo, con los periodos del dato que se juntaron, o falta alguno. */
export type ValorDeDato = { estado: "listo"; valor: Fraccion; periodos: number[] } | { estado: "falta" };

/** Lo que la fuente de una variable ajena tiene para la medición. `no_aplica`, el de un componente (los compuestos). */
export type ValorAjeno = { estado: "listo"; valor: Fraccion } | { estado: "falta" } | { estado: "no_aplica"; fuenteId: number };

type Variable = VersionDeCalculo["variables"][number];

type DatoDelPeriodo = { datoId: number; consolidacion: Consolidacion; datoPeriodicidad: Periodicidad; periodo: string; categoriaId?: number };

const esAjena = (v: Variable) => v.origen === "compartida" || v.origen === "indicador";

// ─────────────────────────────────────────────────────────────────────────────
// La fuente
// ─────────────────────────────────────────────────────────────────────────────

/** Los periodos con valor (`reportado` o `cerrado`) de los datos, sin candado: de todos sus periodos, para juntar. */
async function filasDeDatos(sql: Cliente, datoIds: readonly number[]): Promise<readonly Row[]> {
  if (datoIds.length === 0) return [];
  return sql`SELECT id, variable_id, periodo, valor, por_categoria FROM variable_valores
    WHERE variable_id IN ${sql([...new Set(datoIds)])} AND estado IN ('reportado', 'cerrado') AND valor IS NOT NULL`;
}

/**
 * El dato juntado sobre los periodos que forman el de la medición (`clavesFinas`), con su regla (`juntadoONada`): falta si
 * alguno no tiene valor. Con `categoriaId`, el valor de esa categoría (`por_categoria`). `filas` son las de `filasDeDatos`.
 */
function juntarDato(filas: readonly Row[], d: DatoDelPeriodo): ValorDeDato {
  const claves = clavesFinas(d.periodo, d.datoPeriodicidad);
  const porClave = new Map(filas.filter((f) => Number(f.variable_id) === d.datoId).map((f) => [f.periodo as string, f]));
  const valorDe = (f: Row | undefined): Fraccion | null => {
    if (!f) return null;
    const t = d.categoriaId === undefined ? texto(f.valor) : texto((f.por_categoria as Record<string, unknown> | null)?.[String(d.categoriaId)]);
    return t === null ? null : fraccion(t);
  };
  const valor = juntadoONada(d.consolidacion, claves.map((c) => valorDe(porClave.get(c))));
  return valor ? { estado: "listo", valor, periodos: claves.map((c) => Number(porClave.get(c)!.id)) } : { estado: "falta" };
}

/**
 * El valor de un dato compartido para el periodo `periodo` de un indicador (anexo 14C, §4.5): los periodos del dato que lo
 * forman, juntados con su regla, solo si todos están reportados o cerrados con valor; si falta alguno, `falta`. Con
 * `categoriaId`, el de esa categoría. Lee sin candado.
 */
export async function valorDeDato(sql: Cliente, d: DatoDelPeriodo): Promise<ValorDeDato> {
  return juntarDato(await filasDeDatos(sql, [d.datoId]), d);
}

/** Lo que tiene la fuente de cada variable ajena de la versión, por letra. La tomada de otro indicador, aún «falta». */
function ajenosDe(version: VersionDeCalculo, periodo: string, filas: readonly Row[]): Map<string, ValorAjeno> {
  const salida = new Map<string, ValorAjeno>();
  for (const v of version.variables) {
    if (!esAjena(v)) continue;
    if (v.origen !== "compartida" || v.datoId === null || v.datoPeriodicidad === null) {
      salida.set(v.letra, { estado: "falta" });
      continue;
    }
    const r = juntarDato(filas, { datoId: v.datoId, consolidacion: v.consolidacion, datoPeriodicidad: v.datoPeriodicidad, periodo });
    salida.set(v.letra, r.estado === "listo" ? { estado: "listo", valor: r.valor } : { estado: "falta" });
  }
  return salida;
}

const datosDe = (version: VersionDeCalculo): number[] =>
  version.variables.flatMap((v) => (v.origen === "compartida" && v.datoId !== null ? [v.datoId] : []));

// ─────────────────────────────────────────────────────────────────────────────
// Qué cambia
// ─────────────────────────────────────────────────────────────────────────────

/**
 * La versión con que se calcula la medición `m` (`versionesDeCalculo`, la regla de `"fuente"`), si la propagación le toca:
 * la que rige es de su periodicidad y la que calcula es manual y tiene variables ajenas. Si no, `null`.
 */
function versionQuePropaga(m: Row, versiones: readonly VersionDeCalculo[], zona: string): VersionDeCalculo | null {
  const { rige, version } = versionesDeCalculo(versiones, m, "fuente", zona);
  if (!rige || !version || esDeOtraPeriodicidad(m.periodo as string, rige) || version.origenDato !== "manual") return null;
  return version.variables.some(esAjena) ? version : null;
}

type Cambio = { variable: Variable; antes: Fraccion | null; despues: Fraccion | null };

type Plan = {
  cambios: Cambio[];
  /** Los valores por letra después de copiar lo ajeno. */
  valores: Record<string, Fraccion>;
  /** Sin variables propias y con todo, la medición queda reportada por el sistema. */
  reportarPorSistema: boolean;
  /** El «No aplica» del sistema que se pone (con su motivo) o se quita (`motivo: null`); `null` si no cambia. */
  noAplica: { motivo: string | null } | null;
};

/**
 * Lo que la propagación le cambia a la medición `m` (`guardados`: sus valores por letra de `version`; `ajenos`: lo que tiene
 * cada fuente), o `null` si nada: cada letra ajena cuya fracción difiere de la de su fuente; el reporte del sistema en un
 * indicador sin variables propias que ya tiene todo; y el «No aplica» del sistema, que vale con todos los valores, la
 * medición reportada y la fórmula dividiendo por cero. No consulta nada.
 */
function planear(m: Row, version: VersionDeCalculo, guardados: Readonly<Record<string, Fraccion>>, ajenos: ReadonlyMap<string, ValorAjeno>): Plan | null {
  const valores: Record<string, Fraccion> = { ...guardados };
  const cambios: Cambio[] = [];
  for (const v of version.variables) {
    if (!esAjena(v)) continue;
    const a = ajenos.get(v.letra);
    const despues = a?.estado === "listo" ? a.valor : null;
    const antes = guardados[v.letra] ?? null;
    if (despues) valores[v.letra] = despues;
    else delete valores[v.letra];
    if (antes === null ? despues !== null : despues === null || comparar(antes, despues) !== 0) cambios.push({ variable: v, antes, despues });
  }
  const todas = version.calculo.letras.every((l) => Object.hasOwn(valores, l));
  const reportarPorSistema = !mide(version) && todas && m.reportada_en === null;
  const deSistema = m.no_aplica === true && m.no_aplica_motivo === MOTIVO_NADA_QUE_MEDIR;
  const dePersona = m.no_aplica === true && !deSistema;
  const ficha = fichaDeCalculo(version.calculo);
  const nadaQueMedir =
    todas &&
    (m.reportada_en !== null || reportarPorSistema) &&
    ficha !== null &&
    calcular(ficha, valores, reglaDeTexto(version.regla)).sinResultado === "division_por_cero";
  const noAplica = !dePersona && nadaQueMedir !== deSistema ? { motivo: nadaQueMedir ? MOTIVO_NADA_QUE_MEDIR : null } : null;
  if (cambios.length === 0 && !reportarPorSistema && noAplica === null) return null;
  return { cambios, valores, reportarPorSistema, noAplica };
}

// ─────────────────────────────────────────────────────────────────────────────
// Escribir
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Deja en la medición el valor ajeno de una letra, en la variable de la versión con que se calcula, sin usuario: el valor
 * con cuatro decimales (truncado) y, si no cabe exacto en ellos, su fracción. Antes quita las filas que el sistema copió
 * para esa letra en otra versión; sin valor, quita también la suya.
 */
async function escribirAjeno(tx: TransactionSql, m: { id: number; indicadorId: number }, c: Cambio, ahora: Date): Promise<void> {
  const v = c.variable;
  await tx`DELETE FROM medicion_valores mv
    WHERE mv.medicion_id = ${m.id} AND mv.categoria_id IS NULL AND mv.variable_id <> ${v.id}
      AND mv.variable_id IN (SELECT iv.id FROM indicador_variables iv JOIN indicador_versiones x ON x.id = iv.version_id
        WHERE x.indicador_id = ${m.indicadorId} AND iv.letra = ${v.letra} AND iv.origen IN ('compartida', 'indicador'))`;
  if (c.despues === null) {
    await tx`DELETE FROM medicion_valores WHERE medicion_id = ${m.id} AND variable_id = ${v.id} AND categoria_id IS NULL`;
    return;
  }
  const valor = valorEnTexto(c.despues);
  const exacto = comparar(fraccion(valor)!, c.despues) === 0 ? null : aTexto(c.despues);
  const [cambiada] = await tx`UPDATE medicion_valores SET valor = ${valor}, valor_exacto = ${exacto}, reportado_por = NULL, reportado_en = ${ahora}
    WHERE medicion_id = ${m.id} AND variable_id = ${v.id} AND categoria_id IS NULL
    RETURNING id`;
  if (!cambiada) {
    await tx`INSERT INTO medicion_valores (medicion_id, variable_id, valor, valor_exacto, reportado_por, reportado_en)
      VALUES (${m.id}, ${v.id}, ${valor}, ${exacto}, NULL, ${ahora})`;
  }
}

/** Los valores en el texto del evento: una clave por letra de la versión, con `null` si no hay. */
const enTexto = (version: VersionDeCalculo, valores: Readonly<Record<string, Fraccion>>): Record<string, string | null> =>
  Object.fromEntries(version.calculo.letras.map((l) => [l, valores[l] ? valorEnTexto(valores[l]) : null]));

/** ¿La medición pide un análisis que no tiene? El que exige su resultado (`analisisExigido`) frente al guardado. */
function pideAnalisis(d: { semaforo: Semaforo | null; cumple: boolean | null; repetido: boolean; noAplica: boolean }, m: Row): boolean {
  return !analisisCompleto(analisisExigido({ ...d, historica: false }), analisisDe(m));
}

/**
 * La propagación de una medición en su transacción, con los candados (el indicador `FOR SHARE` y la medición `FOR UPDATE`) y
 * todo releído bajo ellos: «valores», «no_aplica» (quedó en el «No aplica» del sistema) o `null` si ya no le tocaba o nada
 * difería.
 */
async function propagarEn(tx: TransactionSql, medicionId: number, ahora: Date): Promise<"valores" | "no_aplica" | null> {
  const [i] = await tx`SELECT id, estado, plazo_reporte_dias FROM indicadores
    WHERE id = (SELECT indicador_id FROM mediciones WHERE id = ${medicionId}) FOR SHARE`;
  if (!i || i.estado !== "activo") return null;
  const [m] = await tx`SELECT * FROM mediciones WHERE id = ${medicionId} FOR UPDATE`;
  if (!m || m.estado === "cerrada" || m.historica === true) return null;
  const zona = zonaHoraria();
  const indicadorId = Number(i.id);
  const version = versionQuePropaga(m, await versionesAprobadas(tx, indicadorId), zona);
  if (!version) return null;
  const guardados = await valoresPorLetra(tx, medicionId, version);
  const plan = planear(m, version, guardados, ajenosDe(version, m.periodo as string, await filasDeDatos(tx, datosDe(version))));
  if (!plan) return null;

  for (const c of plan.cambios) await escribirAjeno(tx, { id: medicionId, indicadorId }, c, ahora);
  if (plan.reportarPorSistema) await tx`UPDATE mediciones SET reportada_en = ${ahora}, reportada_por = NULL WHERE id = ${medicionId}`;
  if (plan.noAplica) {
    await tx`UPDATE mediciones SET no_aplica = ${plan.noAplica.motivo !== null}, no_aplica_motivo = ${plan.noAplica.motivo} WHERE id = ${medicionId}`;
  }
  const noAplica = plan.noAplica ? plan.noAplica.motivo !== null : m.no_aplica === true;
  const marca = (no: boolean, motivo: unknown) => (plan.noAplica ? { noAplica: no, motivo: (motivo as string | null) ?? null } : {});
  const semaforo = (m.semaforo as Semaforo | null) ?? null;
  const pedia = pideAnalisis(
    { semaforo, cumple: cumpleDeFila({ cumple: (m.cumple as boolean | null) ?? null, semaforo }), repetido: m.incumplimiento_repetido === true, noAplica: m.no_aplica === true },
    m,
  );
  await recalcularMedicion(tx, medicionId, {
    ahora,
    actorId: null,
    evento: "propagacion",
    sistema: "fuente",
    detalle: {
      fuentes: plan.cambios.map((c) => ({
        letra: c.variable.letra,
        clase: c.variable.origen === "compartida" ? "dato" : "indicador",
        id: c.variable.origen === "compartida" ? c.variable.datoId : c.variable.indicadorOrigenId,
        antes: c.antes ? valorEnTexto(c.antes) : null,
        despues: c.despues ? valorEnTexto(c.despues) : null,
      })),
      antes: { ...enTexto(version, guardados), ...marca(m.no_aplica === true, m.no_aplica_motivo) },
      despues: { ...enTexto(version, plan.valores), ...marca(noAplica, plan.noAplica?.motivo) },
    },
    // Un cambio ajeno que la deja pidiendo el análisis con la fecha ya pasada no la deja vencida (anexo 14C, §3.4).
    conElResultado: async (r) => {
      const pide = pideAnalisis({ semaforo: r.despues, cumple: r.cumple, repetido: r.repetido, noAplica }, m);
      const vence = laFuenteMueveElPlazo({
        pedia,
        pide,
        venceEn: new Date(m.vence_en as string),
        ahora,
        plazoDias: Number(i.plazo_reporte_dias),
        zona,
      });
      if (!vence) return {};
      await tx`UPDATE mediciones SET vence_en = ${vence}, aviso_previo_en = NULL, aviso_vencido_en = NULL, escalado_en = NULL
        WHERE id = ${medicionId}`;
      return { venceEn: vence.toISOString() };
    },
  });
  return plan.noAplica?.motivo ? "no_aplica" : "valores";
}

/**
 * De `filas` (mediciones candidatas, con todas sus columnas), las que la propagación cambiaría, leídas sin candado y en
 * pocas lecturas: sus versiones, sus valores y los periodos de sus datos. La que no se pudo revisar también va: su
 * transacción lo vuelve a intentar y, si falla, lo registra.
 */
async function conTrabajo(sql: Cliente, filas: readonly Row[], zona: string): Promise<number[]> {
  const versiones = await versionesAprobadasDe(sql, filas.map((f) => Number(f.indicador_id)));
  const aRevisar = filas.flatMap((m) => {
    const version = versionQuePropaga(m, versiones.get(Number(m.indicador_id)) ?? [], zona);
    return version ? [{ m, version }] : [];
  });
  if (aRevisar.length === 0) return [];
  const [guardados, deDatos] = await Promise.all([
    sql`SELECT mv.medicion_id, ${columnasDeValor(sql)}
      FROM medicion_valores mv JOIN indicador_variables iv ON iv.id = mv.variable_id
      WHERE mv.medicion_id IN ${sql(aRevisar.map((x) => Number(x.m.id)))} AND mv.categoria_id IS NULL AND mv.valor IS NOT NULL`,
    filasDeDatos(sql, aRevisar.flatMap((x) => datosDe(x.version))),
  ]);
  const porMedicion = new Map<number, Row[]>();
  for (const g of guardados) porMedicion.set(Number(g.medicion_id), [...(porMedicion.get(Number(g.medicion_id)) ?? []), g]);
  return aRevisar.flatMap(({ m, version }) => {
    const id = Number(m.id);
    try {
      const valores = elegirValores((porMedicion.get(id) ?? []) as unknown as ValorGuardado[], version);
      return planear(m, version, valores, ajenosDe(version, m.periodo as string, deDatos)) ? [id] : [];
    } catch {
      return [id];
    }
  });
}

/**
 * Lleva el valor de cada fuente a las mediciones abiertas que lo esperan (anexo 14C, §3.3): todas, o solo las de los
 * indicadores `indicadorIds`. Cada una en su transacción; la que falla se registra, cuenta en `fallidas` y no corta la
 * pasada. `escritas` cuenta las que recibieron valores y `noAplica`, las que quedaron en el «No aplica» del sistema.
 */
export async function propagar(opciones?: Opciones): Promise<{ escritas: number; noAplica: number; fallidas: number }> {
  const sql = opciones?.sql ?? obtenerSql();
  const ahora = opciones?.ahora ?? new Date();
  const total = { escritas: 0, noAplica: 0, fallidas: 0 };
  const ids = opciones?.indicadorIds;
  if (ids && ids.length === 0) return total;
  const filas = await sql`SELECT m.* FROM mediciones m JOIN indicadores i ON i.id = m.indicador_id
    WHERE m.estado <> 'cerrada' AND NOT m.historica AND i.estado = 'activo' AND i.inicio_medicion IS NOT NULL
      AND EXISTS (SELECT 1 FROM indicador_versiones v JOIN indicador_variables iv ON iv.version_id = v.id
        WHERE v.indicador_id = i.id AND v.estado = 'aprobada' AND iv.origen IN ('compartida', 'indicador'))
      ${ids ? sql`AND i.id IN ${sql([...new Set(ids)])}` : sql``}
    ORDER BY m.indicador_id, m.desde, m.id`;
  if (filas.length === 0) return total;
  for (const id of await conTrabajo(sql, filas, zonaHoraria())) {
    try {
      const r = await enTransaccion(sql, (tx) => propagarEn(tx, id, ahora));
      if (r === "valores") total.escritas += 1;
      else if (r === "no_aplica") total.noAplica += 1;
    } catch (err) {
      total.fallidas += 1;
      console.error(`No se pudo propagar a la medición ${id}:`, err);
    }
  }
  return total;
}

/**
 * La propagación que llaman las acciones después de confirmar lo suyo: si algo falla, lo registra y no lo relanza (la
 * acción ya terminó y la pasada siguiente lo intenta otra vez).
 */
export async function propagarSinFallar(opciones?: Opciones): Promise<void> {
  try {
    await propagar(opciones);
  } catch (err) {
    console.error("No se pudieron propagar los valores ajenos:", err);
  }
}
