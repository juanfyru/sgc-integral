/**
 * Las mediciones de un indicador (spec 14 §8, Tarea 9 de la 14A): abrir los periodos terminados, el único camino de
 * cálculo (`recalcularMedicion`), reportar, guardar sin reportar, «no aplica», corregir antes del cierre y las lecturas
 * de la pantalla de reporte y de la tabla del año.
 *
 * Candados de toda escritura: el indicador `FOR SHARE` (y se vuelve a exigir que esté activo: hay carrera con
 * `retirar`), después la medición `FOR UPDATE` y por último sus filas hijas: los triggers de la 0011 leen la medición con
 * `FOR SHARE`, y escribir hijas antes de bloquearla interbloquea dos pestañas (40P01).
 *
 * «Reportada» es un hecho guardado (`reportada_en`): «Guardar sin reportar» conserva lo digitado sin calcular aunque esté
 * completo. Los valores se leen por la letra de la variable en la versión que rige: un cambio menor da otros ids a las
 * mismas letras.
 */
import type { TransactionSql } from "postgres";
import { obtenerSql, type Cliente } from "@/db/cliente";
import { registrarAuditoria } from "@/db/consultas/admin";
import { enTransaccion, type SesionFlujo } from "@/db/consultas/flujo/contrato";
import { puedeMedir, puedeVerIndicador, type Capacidad, type SujetoVisibilidad } from "@/lib/alcance";
import { periodoDe, type Periodo } from "@/lib/indicadores-documentales/periodo";
import { calcular, variacionExcesiva } from "@/lib/indicadores/calculo";
import { analisisExigido, esRepetido, estadoVisible, type EstadoVisible } from "@/lib/indicadores/estados";
import { enPalabras } from "@/lib/indicadores/formula/formas";
import { aDecimal, aTexto, comparar, deTexto, fraccion, type Fraccion } from "@/lib/indicadores/formula/fraccion";
import {
  clavesDelAnio,
  fechaLimiteDeReporte,
  periodicidadDe,
  periodosTerminados,
  periodoQueContiene,
  versionQueRigeEntre,
} from "@/lib/indicadores/periodos";
import {
  CIFRA_FUERA_DE_RANGO,
  decimalCorto,
  DIVISION_POR_CERO,
  fichaDeCalculo,
  fueraDeLimites,
  leerValores,
  reglaDeTexto,
  valorEnTexto,
  type CalculoEnTexto,
  type ReglaEnTexto,
} from "@/lib/indicadores/reporte";
import { limiteDeCritico, numeroEs, rangosEnPalabras, type Regla } from "@/lib/indicadores/semaforo";
import { fraseDeResultado, fraseDeVariacion, textoMeta, textoValor, type Unidad } from "@/lib/indicadores/textos";
import {
  ErrorIndicador,
  type EstadoMedicion,
  type ModoSemaforo,
  type Periodicidad,
  type Semaforo,
  type Tendencia,
  type TipoEvento,
} from "@/lib/indicadores/tipos";
import { ErrorPermiso, puede } from "@/lib/permisos";
import { fechaEnZona } from "@/lib/tramites/plazos";
import { zonaHoraria } from "@/lib/zona-horaria";
import { alRecalcular } from "./alertas";
import { obtenerParametros } from "./maestros";

type Opciones = { sql?: Cliente; ahora?: Date };

const NO_EXISTE = "La medición no existe";
const CERRADA = "La medición está cerrada: pida al Administrador del SGC que la reabra";
const RETIRADO = "El indicador está retirado: ya no admite reportes";
const YA_REPORTADA = "La medición ya se reportó: corrija los datos y pulse «Reportar»";
const FICHA_CAMBIO = "La ficha del indicador cambió: recargue la página";

const texto = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));
const lleno = (v: unknown) => typeof v === "string" && v.trim() !== "";
const fr = (v: unknown): Fraccion | null => (v === null || v === undefined ? null : fraccion(String(v)));

// ─────────────────────────────────────────────────────────────────────────────
// Versiones
// ─────────────────────────────────────────────────────────────────────────────

type VariableDeVersion = {
  id: number;
  letra: string;
  nombre: string;
  descripcion: string | null;
  fuente: string | null;
  capturaMin: string | null;
  capturaMax: string | null;
  admiteNegativos: boolean;
};

type VersionDeCalculo = {
  id: number;
  numero: number;
  tipoCambio: string;
  rigeDesde: string | null;
  aprobadaEn: Date | null;
  periodicidad: Periodicidad | null;
  nombre: string | null;
  calculo: CalculoEnTexto;
  /** La regla de la ficha; la meta programada del periodo la reemplaza (`reglaDelPeriodo`). */
  regla: ReglaEnTexto;
  unidad: Unidad;
  variables: VariableDeVersion[];
};

/** Las versiones aprobadas del indicador, de mayor a menor número (el orden de `versionQueRigeEntre`). */
async function versionesAprobadas(sql: Cliente, indicadorId: number): Promise<VersionDeCalculo[]> {
  const filas = await sql`SELECT id, numero, tipo_cambio, rige_desde, aprobada_en, periodicidad, nombre, formula, resultado_min, resultado_max,
      tendencia, meta, meta_max, semaforo_modo, umbral_atencion_pct, limite_critico, tolerancia, unidad_sufijo, decimales
    FROM indicador_versiones WHERE indicador_id = ${indicadorId} AND estado = 'aprobada' ORDER BY numero DESC`;
  if (filas.length === 0) return [];
  const variables = await sql`SELECT id, version_id, letra, nombre, descripcion, fuente, captura_min, captura_max, admite_negativos
    FROM indicador_variables WHERE version_id IN ${sql(filas.map((f) => Number(f.id)))} ORDER BY orden, letra`;
  return filas.map((f) => {
    const propias = variables
      .filter((v) => Number(v.version_id) === Number(f.id))
      .map((v) => ({
        id: Number(v.id),
        letra: v.letra as string,
        nombre: (v.nombre as string | null) ?? (v.letra as string),
        descripcion: texto(v.descripcion),
        fuente: texto(v.fuente),
        capturaMin: texto(v.captura_min),
        capturaMax: texto(v.captura_max),
        admiteNegativos: v.admite_negativos === true,
      }));
    return {
      id: Number(f.id),
      numero: Number(f.numero),
      tipoCambio: f.tipo_cambio as string,
      rigeDesde: texto(f.rige_desde),
      aprobadaEn: f.aprobada_en ? new Date(f.aprobada_en as string) : null,
      periodicidad: (f.periodicidad as Periodicidad | null) ?? null,
      nombre: texto(f.nombre),
      calculo: {
        formula: (f.formula as string | null) ?? "",
        letras: propias.map((v) => v.letra),
        resultadoMin: texto(f.resultado_min),
        resultadoMax: texto(f.resultado_max),
      },
      regla: {
        tendencia: ((f.tendencia as Tendencia | null) ?? "ascendente") as Tendencia,
        meta: texto(f.meta),
        metaMax: texto(f.meta_max),
        modo: (f.semaforo_modo as ModoSemaforo | null) ?? null,
        umbralPct: f.umbral_atencion_pct === null ? null : Number(f.umbral_atencion_pct),
        limite: texto(f.limite_critico),
        tolerancia: texto(f.tolerancia),
      },
      unidad: { sufijo: (f.unidad_sufijo as string | null) ?? "", decimales: f.decimales === null ? 0 : Number(f.decimales) },
      variables: propias,
    };
  });
}

/** La meta programada del periodo (spec §8.9) reemplaza la de la ficha. */
async function reglaDelPeriodo(sql: Cliente, indicadorId: number, periodo: string, v: VersionDeCalculo): Promise<ReglaEnTexto> {
  const [p] = await sql`SELECT meta, meta_max FROM indicador_metas WHERE indicador_id = ${indicadorId} AND periodo = ${periodo}`;
  return p ? { ...v.regla, meta: texto(p.meta), metaMax: texto(p.meta_max) } : v.regla;
}

/** La primera versión aprobada: con su aprobación, lo que terminó antes es histórico (spec §8.8). */
function primeraAprobada(versiones: readonly VersionDeCalculo[]): VersionDeCalculo | null {
  return versiones.find((v) => v.tipoCambio === "inicial") ?? versiones[versiones.length - 1] ?? null;
}

type Tramo = { desde: number; hasta: number; version: VersionDeCalculo; periodicidad: Periodicidad; primero: Periodo };

const despuesDe = (p: Periodicidad, periodo: Periodo, zona: string) => periodoQueContiene(p, new Date(periodo.hasta.getTime() + 1), zona);

/**
 * Desde el inicio de medición, un tramo por cada «rige desde» posterior: en cada uno rige una versión, con su
 * periodicidad, hasta donde empieza el siguiente. El primer periodo de un tramo es el primero de esa periodicidad que
 * empieza con el tramo o después.
 */
function tramos(versiones: readonly VersionDeCalculo[], inicio: string, zona: string): Tramo[] {
  const primero = periodoDe(inicio, zona);
  if (!primero) return [];
  const base = primero.desde.getTime();
  const comienzos = [
    ...new Set([
      base,
      ...versiones
        .map((v) => (v.rigeDesde ? periodoDe(v.rigeDesde, zona)?.desde.getTime() : undefined))
        .filter((x): x is number => x !== undefined && x > base),
    ]),
  ].sort((a, b) => a - b);
  const salida: Tramo[] = [];
  comienzos.forEach((desde, k) => {
    const version = versionQueRigeEntre(versiones, { desde: new Date(desde) }, zona);
    const p = version?.periodicidad;
    if (!version || !p) return;
    let periodo = periodoQueContiene(p, new Date(desde), zona);
    if (periodo.desde.getTime() < desde) periodo = despuesDe(p, periodo, zona);
    salida.push({ desde, hasta: comienzos[k + 1] ?? Infinity, version, periodicidad: p, primero: periodo });
  });
  return salida;
}

// ─────────────────────────────────────────────────────────────────────────────
// Abrir los periodos
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Abre (crea, idempotente) la medición de cada periodo terminado de cada indicador activo desde su inicio de medición
 * (spec §8.1, F14-DC12), con la versión que rige el periodo y su fecha límite. Es histórica la de un periodo que terminó
 * antes de aprobarse la primera versión (§8.8). Devuelve cuántas creó.
 */
export async function asegurarMediciones(opciones?: { sql?: Cliente; ahora?: Date; indicadorId?: number }): Promise<number> {
  const sql = opciones?.sql ?? obtenerSql();
  const ahora = opciones?.ahora ?? new Date();
  const ids =
    opciones?.indicadorId !== undefined
      ? [opciones.indicadorId]
      : (await sql`SELECT id FROM indicadores WHERE estado = 'activo' AND inicio_medicion IS NOT NULL ORDER BY id`).map((f) => Number(f.id));
  let creadas = 0;
  for (const id of ids) creadas += await abrirPeriodos(sql, id, ahora);
  return creadas;
}

/** Un indicador en su transacción, tomado `FOR SHARE` con el estado releído: no abre nada en uno que se acaba de retirar. */
function abrirPeriodos(sql: Cliente, indicadorId: number, ahora: Date): Promise<number> {
  return enTransaccion(sql, async (tx) => {
    const [i] = await tx`SELECT inicio_medicion, plazo_reporte_dias FROM indicadores
      WHERE id = ${indicadorId} AND estado = 'activo' FOR SHARE`;
    if (!i?.inicio_medicion) return 0;
    const zona = zonaHoraria();
    const versiones = await versionesAprobadas(tx, indicadorId);
    const aprobada = primeraAprobada(versiones)?.aprobadaEn ?? null;
    const existentes = new Set((await tx`SELECT periodo FROM mediciones WHERE indicador_id = ${indicadorId}`).map((f) => f.periodo as string));
    const nuevos: { periodo: Periodo; versionId: number }[] = [];
    for (const t of tramos(versiones, i.inicio_medicion as string, zona)) {
      for (const periodo of periodosTerminados(t.periodicidad, t.primero.clave, ahora, zona)) {
        if (periodo.desde.getTime() >= t.hasta) break;
        if (existentes.has(periodo.clave)) continue;
        nuevos.push({ periodo, versionId: versionQueRigeEntre(versiones, periodo, zona)!.id });
      }
    }
    if (nuevos.length === 0) return 0;
    const plazo = Number(i.plazo_reporte_dias);
    const iso = (d: Date) => d.toISOString();
    const creadas = await tx`INSERT INTO mediciones (indicador_id, version_id, periodo, desde, hasta, vence_en, historica)
      SELECT ${indicadorId}, x.version_id, x.periodo, x.desde, x.hasta, x.vence_en, x.historica
      FROM unnest(
        ${tx.array(nuevos.map((n) => n.versionId))}::bigint[],
        ${tx.array(nuevos.map((n) => n.periodo.clave))}::text[],
        ${tx.array(nuevos.map((n) => iso(n.periodo.desde)))}::timestamptz[],
        ${tx.array(nuevos.map((n) => iso(n.periodo.hasta)))}::timestamptz[],
        ${tx.array(nuevos.map((n) => iso(fechaLimiteDeReporte(n.periodo, plazo, zona))))}::timestamptz[],
        ${tx.array(nuevos.map((n) => aprobada !== null && n.periodo.hasta.getTime() < aprobada.getTime()))}::boolean[]
      ) AS x(version_id, periodo, desde, hasta, vence_en, historica)
      ON CONFLICT (indicador_id, periodo) DO NOTHING
      RETURNING id`;
    return creadas.length;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// El cálculo único
// ─────────────────────────────────────────────────────────────────────────────

export type Recalculo = {
  medicionId: number;
  indicadorId: number;
  antes: Semaforo | null;
  despues: Semaforo | null;
  estado: EstadoMedicion;
  resultado: Fraccion | null;
  repetido: boolean;
  historica: boolean;
  /** Algo cambió (y quedó el evento); `false` si todo quedó como estaba. */
  cambio: boolean;
};

/** Los soportes de la medición: filas de `archivos` con contexto `medicion`. */
export async function contarSoportes(sql: Cliente, medicionId: number): Promise<number> {
  const [f] = await sql`SELECT count(*)::int AS n FROM archivos WHERE contexto = 'medicion' AND contexto_id = ${medicionId}`;
  return Number(f.n);
}

/** Los valores de la medición por letra de la versión dada: primero los de sus variables; si no, los de otra versión. */
async function valoresPorLetra(sql: Cliente, medicionId: number, v: VersionDeCalculo): Promise<Record<string, Fraccion>> {
  const propias = v.variables.map((x) => x.id);
  const filas = await sql`SELECT iv.letra, mv.valor FROM medicion_valores mv JOIN indicador_variables iv ON iv.id = mv.variable_id
    WHERE mv.medicion_id = ${medicionId} AND mv.categoria_id IS NULL AND mv.valor IS NOT NULL
    ORDER BY (mv.variable_id = ANY(${propias})) DESC, mv.reportado_en DESC NULLS LAST, mv.id DESC`;
  const salida: Record<string, Fraccion> = {};
  for (const f of filas) {
    const letra = f.letra as string;
    const valor = fr(f.valor);
    if (v.calculo.letras.includes(letra) && !Object.hasOwn(salida, letra) && valor) salida[letra] = valor;
  }
  return salida;
}

/** Los valores en el texto de los eventos, uno por letra de la versión («5», `null` si no hay). */
function enTexto(v: VersionDeCalculo, valores: Readonly<Record<string, Fraccion | null | undefined>>): Record<string, string | null> {
  return Object.fromEntries(v.calculo.letras.map((l) => [l, valores[l] ? valorEnTexto(valores[l]!) : null]));
}

const igualNumero = (a: unknown, b: unknown) => {
  const x = fr(a);
  const y = fr(b);
  return x === null || y === null ? x === y : comparar(x, y) === 0;
};

const objeto = (v: unknown): Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

/**
 * El único camino que escribe el resultado, el semáforo, la meta aplicada y el estado de una medición (spec §8.2): con la
 * fila bloqueada calcula con la versión que rige el periodo y la meta programada (o la de la ficha), congela la versión,
 * la meta y el límite, decide `requiere_accion`, el incumplimiento repetido y el estado, deja el evento con el antes y el
 * después y llama `alRecalcular`. Si nada cambió, ni evento ni alertas.
 *
 * Cuenta como dato lo reportado (`reportada_en`) o «no aplica». `c.detalle` se guarda en el evento; su `antes` y su
 * `despues` (lo que quien llama cambió: valores, «no aplica», análisis) se completan con el resultado, el semáforo y el
 * estado, y cuentan para saber si algo cambió.
 */
export async function recalcularMedicion(
  tx: TransactionSql,
  medicionId: number,
  c: { ahora: Date; actorId: number | null; evento: TipoEvento; detalle?: Record<string, unknown> },
): Promise<Recalculo> {
  const zona = zonaHoraria();
  const [m] = await tx`SELECT m.*, i.soporte_obligatorio FROM mediciones m JOIN indicadores i ON i.id = m.indicador_id
    WHERE m.id = ${medicionId} FOR UPDATE OF m`;
  if (!m) throw new ErrorIndicador(NO_EXISTE);
  if (m.estado === "cerrada") throw new ErrorIndicador(CERRADA);
  const indicadorId = Number(m.indicador_id);
  const periodo = periodoDe(m.periodo as string, zona);
  const versiones = await versionesAprobadas(tx, indicadorId);
  const version = periodo ? versionQueRigeEntre(versiones, periodo, zona) : null;
  const ficha = version ? fichaDeCalculo(version.calculo) : null;
  if (!version || !ficha) throw new ErrorIndicador("El indicador no tiene una ficha aprobada que calcule este periodo");

  const reglaTexto = await reglaDelPeriodo(tx, indicadorId, m.periodo as string, version);
  const regla = reglaDeTexto(reglaTexto);
  const historica = m.historica === true;
  const noAplica = m.no_aplica === true;
  let resultado: Fraccion | null = null;
  let semaforo: Semaforo | null = null;
  if (m.reportada_en !== null && !noAplica) {
    const r = calcular(ficha, await valoresPorLetra(tx, medicionId, version), regla);
    if (r.resultado) {
      resultado = r.resultado;
      semaforo = r.semaforo;
    }
  }

  // La racha: las anteriores ordinarias medidas, de la más reciente a la más antigua (spec §10.3, F14-DC20 y F14-DC41).
  let repetido = false;
  if (!historica && semaforo !== null && semaforo !== "bien") {
    const { incumplimientoPeriodos: n } = await obtenerParametros({ sql: tx });
    const anteriores = await tx`SELECT semaforo FROM mediciones
      WHERE indicador_id = ${indicadorId} AND id <> ${medicionId} AND hasta < ${m.desde}
        AND NOT historica AND NOT no_aplica AND resultado_exacto IS NOT NULL
      ORDER BY hasta DESC LIMIT ${n - 1}`;
    repetido = esRepetido(
      anteriores.map((a) => (a.semaforo as Semaforo | null) ?? null),
      semaforo,
      n,
    );
  }
  const exigido = analisisExigido({ semaforo, repetido, historica, noAplica });
  const dosPartes = lleno(m.causa) && lleno(m.accion_propuesta);
  const conAnalisis = exigido === "ninguno" || dosPartes || (exigido === "simple" && lleno(m.analisis));
  const conSoporte = m.soporte_obligatorio !== true || historica || noAplica || (await contarSoportes(tx, medicionId)) > 0;
  const estado: EstadoMedicion = (noAplica || resultado !== null) && conAnalisis && conSoporte ? "reportada" : "abierta";
  const limite = limiteDeCritico(regla);

  const nuevo = {
    version_id: version.id,
    resultado_exacto: resultado ? aTexto(resultado) : null,
    resultado: resultado ? aDecimal(resultado, 10, "redondear") : null,
    semaforo,
    meta_aplicada: reglaTexto.meta,
    meta_max_aplicada: reglaTexto.metaMax,
    limite_aplicado: limite ? decimalCorto(limite) : null,
    requiere_accion: !historica && !noAplica && (semaforo === "critico" || repetido),
    incumplimiento_repetido: repetido,
    estado,
  };
  const columnasCambiaron =
    Number(m.version_id) !== nuevo.version_id ||
    m.resultado_exacto !== nuevo.resultado_exacto ||
    m.semaforo !== nuevo.semaforo ||
    !igualNumero(m.meta_aplicada, nuevo.meta_aplicada) ||
    !igualNumero(m.meta_max_aplicada, nuevo.meta_max_aplicada) ||
    !igualNumero(m.limite_aplicado, nuevo.limite_aplicado) ||
    m.requiere_accion !== nuevo.requiere_accion ||
    m.incumplimiento_repetido !== nuevo.incumplimiento_repetido ||
    m.estado !== nuevo.estado;
  if (columnasCambiaron) {
    await tx`UPDATE mediciones SET version_id = ${nuevo.version_id}, resultado_exacto = ${nuevo.resultado_exacto},
        resultado = ${nuevo.resultado}, semaforo = ${nuevo.semaforo}, meta_aplicada = ${nuevo.meta_aplicada},
        meta_max_aplicada = ${nuevo.meta_max_aplicada}, limite_aplicado = ${nuevo.limite_aplicado},
        requiere_accion = ${nuevo.requiere_accion}, incumplimiento_repetido = ${nuevo.incumplimiento_repetido}, estado = ${nuevo.estado}
      WHERE id = ${medicionId}`;
  }

  const { antes: antesDe, despues: despuesDe, ...resto } = c.detalle ?? {};
  const resultadoAntes = m.resultado_exacto ? decimalCorto(deTexto(m.resultado_exacto as string)) : null;
  const antes = { ...objeto(antesDe), resultado: resultadoAntes, semaforo: (m.semaforo as Semaforo | null) ?? null, estado: m.estado as string };
  const despues = { ...objeto(despuesDe), resultado: resultado ? decimalCorto(resultado) : null, semaforo, estado };
  const cambio = columnasCambiaron || JSON.stringify(antes) !== JSON.stringify(despues);
  const r: Recalculo = {
    medicionId,
    indicadorId,
    antes: (m.semaforo as Semaforo | null) ?? null,
    despues: semaforo,
    estado,
    resultado,
    repetido,
    historica,
    cambio,
  };
  if (!cambio) return r;
  await tx`INSERT INTO medicion_eventos (medicion_id, tipo, usuario_id, detalle, creado_en)
    VALUES (${medicionId}, ${c.evento}, ${c.actorId}, ${tx.json({ ...resto, antes, despues } as never)}, ${c.ahora})`;
  await alRecalcular(tx, r, { ahora: c.ahora, actorId: c.actorId });
  return r;
}

// ─────────────────────────────────────────────────────────────────────────────
// Reportar, «no aplica» y corregir
// ─────────────────────────────────────────────────────────────────────────────

type Contexto = {
  medicion: Record<string, unknown> & { id: number };
  indicador: { id: number; codigo: string; soporteObligatorio: boolean };
  capacidad: Capacidad;
  version: VersionDeCalculo;
  periodo: Periodo;
};

/**
 * Lo que debe cumplirse para tocar una medición: que la persona la vea (si no, «no existe»), que pueda medir el
 * indicador, que este siga activo y que la medición no esté cerrada. Con `bloquear`, dentro de la transacción: el
 * indicador `FOR SHARE` y la medición `FOR UPDATE`, en ese orden.
 */
async function contextoDeMedicion(sql: Cliente, sesion: SujetoVisibilidad, medicionId: number, bloquear: boolean): Promise<Contexto> {
  const [i] = bloquear
    ? await sql`SELECT id, codigo, estado, soporte_obligatorio FROM indicadores
        WHERE id = (SELECT indicador_id FROM mediciones WHERE id = ${medicionId}) FOR SHARE`
    : await sql`SELECT id, codigo, estado, soporte_obligatorio FROM indicadores
        WHERE id = (SELECT indicador_id FROM mediciones WHERE id = ${medicionId})`;
  const [m] = bloquear
    ? await sql`SELECT * FROM mediciones WHERE id = ${medicionId} FOR UPDATE`
    : await sql`SELECT * FROM mediciones WHERE id = ${medicionId}`;
  if (!i || !m || !(await puedeVerIndicador(Number(i.id), sesion, { sql }))) throw new ErrorIndicador(NO_EXISTE);
  const indicadorId = Number(i.id);
  const capacidad = await puedeMedir(indicadorId, sesion, { sql });
  if (!capacidad.puede) throw new ErrorPermiso();
  if (i.estado !== "activo") throw new ErrorIndicador(i.estado === "retirado" ? RETIRADO : NO_EXISTE);
  if (m.estado === "cerrada") throw new ErrorIndicador(CERRADA);
  const zona = zonaHoraria();
  const periodo = periodoDe(m.periodo as string, zona);
  const version = periodo ? versionQueRigeEntre(await versionesAprobadas(sql, indicadorId), periodo, zona) : null;
  if (!periodo || !version) throw new ErrorIndicador(NO_EXISTE);
  return {
    medicion: { ...m, id: Number(m.id) },
    indicador: { id: indicadorId, codigo: i.codigo as string, soporteObligatorio: i.soporte_obligatorio === true },
    capacidad,
    version,
    periodo,
  };
}

/** La medición anterior con resultado, sea histórica o no: contra ella se pide la confirmación por variación (spec §7.4). */
async function anteriorConResultado(
  sql: Cliente,
  indicadorId: number,
  desde: unknown,
): Promise<{ clave: string; etiqueta: string; valor: Fraccion } | null> {
  const [a] = await sql`SELECT periodo, resultado_exacto FROM mediciones
    WHERE indicador_id = ${indicadorId} AND hasta < ${desde as Date} AND resultado_exacto IS NOT NULL AND NOT no_aplica
    ORDER BY hasta DESC LIMIT 1`;
  if (!a) return null;
  const clave = a.periodo as string;
  return { clave, etiqueta: periodoDe(clave, zonaHoraria())?.etiqueta ?? clave, valor: deTexto(a.resultado_exacto as string) };
}

type DatosDeReportar = { medicionId: number; valores: Record<string, string>; parcial: boolean; confirmado: boolean };

/**
 * Lo que se va a escribir, sin escribir nada: los valores leídos y validados (spec §7.4) y, en un reporte, el cálculo,
 * los límites del resultado, la división por cero, el soporte obligatorio y la confirmación por variación.
 */
async function planDeReporte(
  sql: Cliente,
  ctx: Contexto,
  d: DatosDeReportar,
): Promise<{ valores: Record<string, Fraccion | null>; confirmar: string | null }> {
  const { version, medicion: m } = ctx;
  for (const letra of Object.keys(d.valores)) {
    if (!version.calculo.letras.includes(letra)) throw new ErrorIndicador(FICHA_CAMBIO);
  }
  const { valores, errores } = leerValores(version.variables, d.valores);
  const primerError = version.variables.map((v) => errores[v.letra]).find((e) => e !== undefined);
  if (primerError) throw new ErrorIndicador(primerError);
  if (d.parcial) {
    if (m.reportada_en !== null || m.no_aplica === true) throw new ErrorIndicador(YA_REPORTADA);
    return { valores, confirmar: null };
  }
  const falta = version.variables.find((v) => valores[v.letra] === null);
  if (falta) throw new ErrorIndicador(`Falta el valor de «${falta.nombre}»`);

  const regla = reglaDeTexto(await reglaDelPeriodo(sql, ctx.indicador.id, m.periodo as string, version));
  const ficha = fichaDeCalculo(version.calculo);
  if (!ficha) throw new ErrorIndicador(FICHA_CAMBIO);
  const r = calcular(ficha, Object.fromEntries(Object.entries(valores).map(([l, v]) => [l, v ?? undefined])), regla);
  if (r.sinResultado === "division_por_cero") throw new ErrorIndicador(DIVISION_POR_CERO);
  if (!r.resultado) throw new ErrorIndicador(CIFRA_FUERA_DE_RANGO);
  if (r.fueraDeLimites) throw new ErrorIndicador(fueraDeLimites(textoValor(r.resultado, version.unidad)));
  if (ctx.indicador.soporteObligatorio && m.historica !== true && (await contarSoportes(sql, m.id)) === 0) {
    throw new ErrorIndicador("Este indicador exige un soporte: adjúntelo antes de reportar");
  }
  if (!d.confirmado) {
    const anterior = await anteriorConResultado(sql, ctx.indicador.id, m.desde);
    const { variacionConfirmarPct } = await obtenerParametros({ sql });
    if (anterior && variacionExcesiva(r.resultado, anterior.valor, variacionConfirmarPct)) {
      return { valores, confirmar: fraseDeVariacion(r.resultado, anterior, version.unidad) };
    }
  }
  return { valores, confirmar: null };
}

/** Deja los valores de la versión que rige: quita los de otra versión y los vaciados, inserta o cambia los demás. */
async function escribirValores(
  tx: TransactionSql,
  medicionId: number,
  version: VersionDeCalculo,
  valores: Readonly<Record<string, Fraccion | null>>,
  usuarioId: number,
  ahora: Date,
): Promise<void> {
  const propias = version.variables.map((v) => v.id);
  await tx`DELETE FROM medicion_valores WHERE medicion_id = ${medicionId} AND categoria_id IS NULL AND NOT (variable_id = ANY(${propias}))`;
  const actuales = new Map(
    (await tx`SELECT variable_id, valor FROM medicion_valores WHERE medicion_id = ${medicionId} AND categoria_id IS NULL`).map((f) => [
      Number(f.variable_id),
      fr(f.valor),
    ]),
  );
  for (const v of version.variables) {
    const nuevo = valores[v.letra] ?? null;
    const hay = actuales.has(v.id);
    if (nuevo === null) {
      if (hay) await tx`DELETE FROM medicion_valores WHERE medicion_id = ${medicionId} AND variable_id = ${v.id} AND categoria_id IS NULL`;
      continue;
    }
    const valor = valorEnTexto(nuevo);
    const actual = actuales.get(v.id);
    if (!hay) {
      await tx`INSERT INTO medicion_valores (medicion_id, variable_id, valor, reportado_por, reportado_en)
        VALUES (${medicionId}, ${v.id}, ${valor}, ${usuarioId}, ${ahora})`;
    } else if (!actual || comparar(actual, nuevo) !== 0) {
      await tx`UPDATE medicion_valores SET valor = ${valor}, reportado_por = ${usuarioId}, reportado_en = ${ahora}
        WHERE medicion_id = ${medicionId} AND variable_id = ${v.id} AND categoria_id IS NULL`;
    }
  }
}

/** «60 %» con la regla del periodo, o `null` sin resultado. */
const resultadoEnTexto = (exacto: unknown, version: VersionDeCalculo, regla: Regla): string | null =>
  typeof exacto === "string" ? textoValor(deTexto(exacto), version.unidad, regla) : null;

export type ResultadoDeReporte = { ok: true; estado: EstadoMedicion; semaforo: Semaforo | null } | { ok: false; confirmar: string };

/**
 * Reporta los datos de una medición, los guarda sin reportar (`parcial`) o los corrige antes del cierre (spec §8.2 y
 * §8.7). Valida fuera de la transacción lo que puede y lo repite dentro, con los candados, antes de escribir nada. Un
 * salto grande frente al periodo anterior con resultado no escribe y pide confirmación (`confirmado`). Deja el evento
 * `reporte` la primera vez y `correccion` después; lo mismo otra vez no deja nada.
 */
export async function reportar(sesion: SesionFlujo, d: DatosDeReportar, opciones?: Opciones): Promise<ResultadoDeReporte> {
  if (!puede(sesion, "indicadores.medir")) throw new ErrorPermiso();
  const sql = opciones?.sql ?? obtenerSql();
  const ahora = opciones?.ahora ?? new Date();
  const fuera = await planDeReporte(sql, await contextoDeMedicion(sql, sesion, d.medicionId, false), d);
  if (fuera.confirmar) return { ok: false, confirmar: fuera.confirmar };

  return enTransaccion(sql, async (tx) => {
    const ctx = await contextoDeMedicion(tx, sesion, d.medicionId, true);
    const plan = await planDeReporte(tx, ctx, d);
    if (plan.confirmar) return { ok: false as const, confirmar: plan.confirmar };
    const { medicion: m, version } = ctx;
    const antes = enTexto(version, await valoresPorLetra(tx, m.id, version));
    const primera = m.reportada_en === null && m.no_aplica !== true;
    await escribirValores(tx, m.id, version, plan.valores, sesion.usuarioId, ahora);
    if (!d.parcial && (m.reportada_en === null || m.no_aplica === true)) {
      await tx`UPDATE mediciones SET reportada_por = coalesce(reportada_por, ${sesion.usuarioId}), reportada_en = coalesce(reportada_en, ${ahora}),
          no_aplica = false, no_aplica_motivo = NULL
        WHERE id = ${m.id}`;
    }
    const conMotivo = m.no_aplica === true ? { motivo: m.no_aplica_motivo as string | null } : {};
    const detalle = {
      antes: { ...antes, noAplica: m.no_aplica === true, ...conMotivo },
      despues: { ...enTexto(version, plan.valores), noAplica: false, ...(m.no_aplica === true ? { motivo: null } : {}) },
      ...(d.parcial ? { parcial: true } : {}),
      ...(ctx.capacidad.sinMedidor ? { sinMedidor: true } : {}),
    };
    const r = await recalcularMedicion(tx, m.id, { ahora, actorId: sesion.usuarioId, evento: primera ? "reporte" : "correccion", detalle });
    if (r.cambio) {
      const regla = reglaDeTexto(await reglaDelPeriodo(tx, ctx.indicador.id, m.periodo as string, version));
      await registrarAuditoria(tx, {
        usuarioId: sesion.usuarioId,
        accion: primera ? "medicion_reportada" : "medicion_corregida",
        entidad: "medicion",
        entidadId: m.id,
        detalle: {
          codigo: ctx.indicador.codigo,
          indicadorId: ctx.indicador.id,
          periodo: m.periodo,
          resultado: r.resultado ? textoValor(r.resultado, version.unidad, regla) : null,
          resultadoAntes: resultadoEnTexto(m.resultado_exacto, version, regla),
          semaforo: r.despues,
          ...detalle,
        },
      });
    }
    return { ok: true as const, estado: r.estado, semaforo: r.despues };
  });
}

/** El motivo de «no aplica»: de 5 a 500 caracteres. */
function motivoValido(motivo: string): string {
  const m = typeof motivo === "string" ? motivo.trim() : "";
  if (m.length < 5) throw new ErrorIndicador("El motivo debe tener al menos 5 caracteres");
  if (m.length > 500) throw new ErrorIndicador("El motivo no puede pasar de 500 caracteres");
  return m;
}

/**
 * «No aplica en este periodo» (spec §8.2): con motivo, cuenta como reportado, queda en gris y no pide análisis ni
 * soporte. Conserva lo digitado. Marcar lo mismo otra vez no deja nada.
 */
export async function marcarNoAplica(sesion: SesionFlujo, d: { medicionId: number; motivo: string }, opciones?: Opciones): Promise<void> {
  if (!puede(sesion, "indicadores.medir")) throw new ErrorPermiso();
  const motivo = motivoValido(d.motivo);
  const sql = opciones?.sql ?? obtenerSql();
  const ahora = opciones?.ahora ?? new Date();
  await contextoDeMedicion(sql, sesion, d.medicionId, false);
  await enTransaccion(sql, async (tx) => {
    const ctx = await contextoDeMedicion(tx, sesion, d.medicionId, true);
    const m = ctx.medicion;
    if (m.no_aplica === true && m.no_aplica_motivo === motivo) return;
    await tx`UPDATE mediciones SET no_aplica = true, no_aplica_motivo = ${motivo},
        reportada_por = coalesce(reportada_por, ${sesion.usuarioId}), reportada_en = coalesce(reportada_en, ${ahora})
      WHERE id = ${m.id}`;
    const detalle = {
      antes: { noAplica: m.no_aplica === true, motivo: (m.no_aplica_motivo as string | null) ?? null },
      despues: { noAplica: true, motivo },
      ...(ctx.capacidad.sinMedidor ? { sinMedidor: true } : {}),
    };
    const r = await recalcularMedicion(tx, m.id, { ahora, actorId: sesion.usuarioId, evento: "no_aplica", detalle });
    if (!r.cambio) return;
    await registrarAuditoria(tx, {
      usuarioId: sesion.usuarioId,
      accion: "medicion_no_aplica",
      entidad: "medicion",
      entidadId: m.id,
      detalle: { codigo: ctx.indicador.codigo, indicadorId: ctx.indicador.id, periodo: m.periodo, motivo, ...detalle },
    });
  });
}

/**
 * Quita «no aplica» (spec §8.7): es una corrección. La medición vuelve a estar por reportar, con lo que se hubiera
 * digitado.
 */
export async function quitarNoAplica(sesion: SesionFlujo, medicionId: number, opciones?: Opciones): Promise<void> {
  if (!puede(sesion, "indicadores.medir")) throw new ErrorPermiso();
  const sql = opciones?.sql ?? obtenerSql();
  const ahora = opciones?.ahora ?? new Date();
  const sinMarca = (m: Record<string, unknown>) => {
    if (m.no_aplica !== true) throw new ErrorIndicador("La medición no está marcada «No aplica»");
  };
  sinMarca((await contextoDeMedicion(sql, sesion, medicionId, false)).medicion);
  await enTransaccion(sql, async (tx) => {
    const ctx = await contextoDeMedicion(tx, sesion, medicionId, true);
    const m = ctx.medicion;
    sinMarca(m);
    await tx`UPDATE mediciones SET no_aplica = false, no_aplica_motivo = NULL, reportada_por = NULL, reportada_en = NULL WHERE id = ${m.id}`;
    const detalle = {
      antes: { noAplica: true, motivo: (m.no_aplica_motivo as string | null) ?? null },
      despues: { noAplica: false, motivo: null },
      ...(ctx.capacidad.sinMedidor ? { sinMedidor: true } : {}),
    };
    await recalcularMedicion(tx, m.id, { ahora, actorId: sesion.usuarioId, evento: "correccion", detalle });
    await registrarAuditoria(tx, {
      usuarioId: sesion.usuarioId,
      accion: "medicion_corregida",
      entidad: "medicion",
      entidadId: m.id,
      detalle: { codigo: ctx.indicador.codigo, indicadorId: ctx.indicador.id, periodo: m.periodo, resultado: null, resultadoAntes: null, ...detalle },
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Lecturas
// ─────────────────────────────────────────────────────────────────────────────

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** «10 de octubre de 2026», el día en la zona de la instalación. */
function diaEnPalabras(d: Date): string {
  const [anio, mes, dia] = fechaEnZona(d, zonaHoraria()).split("-").map(Number);
  return `${dia} de ${MESES[mes - 1]} de ${anio}`;
}

const conMayuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

export type VariableDeReporte = {
  letra: string;
  nombre: string;
  descripcion: string | null;
  fuente: string | null;
  capturaMin: string | null;
  capturaMax: string | null;
  admiteNegativos: boolean;
  /** Lo guardado, con punto decimal; `null` si no hay. */
  valor: string | null;
};

/** Lo que la pantalla de reporte necesita (spec §8.2 y §12.5), todo en texto para el navegador. */
export type DatosDeReporte = {
  medicionId: number;
  indicadorId: number;
  codigo: string;
  nombre: string;
  periodo: string;
  /** «Tercer trimestre de 2026». */
  etiqueta: string;
  /** «10 de octubre de 2026». */
  vence: string;
  vencida: boolean;
  estado: EstadoMedicion;
  historica: boolean;
  noAplica: boolean;
  motivo: string | null;
  reportada: boolean;
  soporteObligatorio: boolean;
  soportes: number;
  /** El Admin SGC mide porque nadie más puede (spec §6.1). */
  sinMedidor: boolean;
  variables: VariableDeReporte[];
  calculo: CalculoEnTexto;
  formulaEnPalabras: string;
  regla: ReglaEnTexto;
  unidad: Unidad;
  rangos: string | null;
  /** La fracción exacta guardada («60/1»), o `null`. */
  resultado: string | null;
  semaforo: Semaforo | null;
  /** La medición anterior con resultado, para la confirmación por variación; la etiqueta, en minúscula. */
  anterior: { clave: string; etiqueta: string; resultado: string } | null;
  variacionPct: number;
};

/** La medición de `periodo` del indicador `codigo` para reportarla; `null` si no existe o la persona no puede medirla. */
export async function medicionParaReportar(
  sesion: SujetoVisibilidad,
  codigo: string,
  periodo: string,
  opciones?: Opciones,
): Promise<DatosDeReporte | null> {
  const sql = opciones?.sql ?? obtenerSql();
  const ahora = opciones?.ahora ?? new Date();
  if (periodicidadDe(periodo) === null) return null;
  const [m] = await sql`SELECT m.id FROM mediciones m JOIN indicadores i ON i.id = m.indicador_id
    WHERE lower(i.codigo) = lower(${codigo}) AND m.periodo = ${periodo}`;
  if (!m) return null;
  let ctx: Contexto;
  try {
    ctx = await contextoDeMedicion(sql, sesion, Number(m.id), false);
  } catch (err) {
    // Una medición cerrada se muestra (sin formulario); lo demás no existe para la persona.
    if (!(err instanceof ErrorIndicador && err.message === CERRADA)) {
      if (err instanceof ErrorIndicador || err instanceof ErrorPermiso) return null;
      throw err;
    }
    return cerradaParaReportar(sql, sesion, Number(m.id), ahora);
  }
  return datosDeReporte(sql, ctx, ahora);
}

/** Una medición cerrada la ve quien podría medirla, para decirle que se pide reabrirla. */
async function cerradaParaReportar(sql: Cliente, sesion: SujetoVisibilidad, medicionId: number, ahora: Date): Promise<DatosDeReporte | null> {
  const [m] = await sql`SELECT * FROM mediciones WHERE id = ${medicionId}`;
  const [i] = await sql`SELECT id, codigo, soporte_obligatorio FROM indicadores WHERE id = ${m.indicador_id} AND estado = 'activo'`;
  if (!i || !(await puedeVerIndicador(Number(i.id), sesion, { sql }))) return null;
  const capacidad = await puedeMedir(Number(i.id), sesion, { sql });
  if (!capacidad.puede) return null;
  const zona = zonaHoraria();
  const periodo = periodoDe(m.periodo as string, zona)!;
  const version = versionQueRigeEntre(await versionesAprobadas(sql, Number(i.id)), periodo, zona);
  if (!version) return null;
  return datosDeReporte(
    sql,
    {
      medicion: { ...m, id: Number(m.id) },
      indicador: { id: Number(i.id), codigo: i.codigo as string, soporteObligatorio: i.soporte_obligatorio === true },
      capacidad,
      version,
      periodo,
    },
    ahora,
  );
}

async function datosDeReporte(sql: Cliente, ctx: Contexto, ahora: Date): Promise<DatosDeReporte> {
  const { medicion: m, version, indicador } = ctx;
  const guardados = await valoresPorLetra(sql, m.id, version);
  const regla = await reglaDelPeriodo(sql, indicador.id, m.periodo as string, version);
  const anterior = await anteriorConResultado(sql, indicador.id, m.desde);
  const { variacionConfirmarPct } = await obtenerParametros({ sql });
  const vence = new Date(m.vence_en as string);
  const nombres = Object.fromEntries(version.variables.map((v) => [v.letra, v.nombre]));
  return {
    medicionId: m.id,
    indicadorId: indicador.id,
    codigo: indicador.codigo,
    nombre: version.nombre ?? indicador.codigo,
    periodo: m.periodo as string,
    etiqueta: conMayuscula(ctx.periodo.etiqueta),
    vence: diaEnPalabras(vence),
    vencida: m.historica !== true && ahora.getTime() > vence.getTime(),
    estado: m.estado as EstadoMedicion,
    historica: m.historica === true,
    noAplica: m.no_aplica === true,
    motivo: (m.no_aplica_motivo as string | null) ?? null,
    reportada: m.reportada_en !== null,
    soporteObligatorio: indicador.soporteObligatorio,
    soportes: await contarSoportes(sql, m.id),
    sinMedidor: ctx.capacidad.sinMedidor,
    variables: version.variables.map((v) => ({
      letra: v.letra,
      nombre: v.nombre,
      descripcion: v.descripcion,
      fuente: v.fuente,
      capturaMin: v.capturaMin,
      capturaMax: v.capturaMax,
      admiteNegativos: v.admiteNegativos,
      valor: guardados[v.letra] ? valorEnTexto(guardados[v.letra]) : null,
    })),
    calculo: version.calculo,
    formulaEnPalabras: enPalabras(version.calculo.formula, nombres),
    regla,
    unidad: version.unidad,
    rangos: rangosEnPalabras(reglaDeTexto(regla), version.unidad),
    resultado: (m.resultado_exacto as string | null) ?? null,
    semaforo: (m.semaforo as Semaforo | null) ?? null,
    anterior: anterior ? { clave: anterior.clave, etiqueta: anterior.etiqueta, resultado: aTexto(anterior.valor) } : null,
    variacionPct: variacionConfirmarPct,
  };
}

/** La medición abierta más antigua que la persona puede reportar del indicador (la del botón «Reportar»), o `null`. */
export async function proximaPorReportar(
  sesion: SujetoVisibilidad,
  indicadorId: number,
  opciones?: { sql?: Cliente },
): Promise<{ periodo: string; etiqueta: string } | null> {
  const sql = opciones?.sql ?? obtenerSql();
  const [i] = await sql`SELECT estado FROM indicadores WHERE id = ${indicadorId}`;
  if (i?.estado !== "activo" || !(await puedeVerIndicador(indicadorId, sesion, { sql }))) return null;
  if (!(await puedeMedir(indicadorId, sesion, { sql })).puede) return null;
  const [m] = await sql`SELECT periodo FROM mediciones
    WHERE indicador_id = ${indicadorId} AND estado = 'abierta' AND NOT historica AND NOT no_aplica AND reportada_en IS NULL
    ORDER BY desde LIMIT 1`;
  if (!m) return null;
  const clave = m.periodo as string;
  return { periodo: clave, etiqueta: periodoDe(clave, zonaHoraria())?.etiqueta ?? clave };
}

export type FilaDelAnio = {
  periodo: string;
  /** «Primer trimestre de 2026». */
  etiqueta: string;
  medicionId: number | null;
  /** «por_venir»: el periodo no ha terminado; «sin_dato»: terminó y no tiene medición. */
  estado: EstadoVisible | "por_venir" | "sin_dato";
  vencida: boolean;
  /** «10 de abril de 2026»; `null` sin medición. */
  vence: string | null;
  historica: boolean;
  noAplica: boolean;
  motivo: string | null;
  /** Por letra de la versión que rige el periodo, con coma decimal; `null` si no hay. */
  valores: { letra: string; valor: string | null }[];
  /** «60 %»: nunca contradice el color. */
  resultado: string | null;
  semaforo: Semaforo | null;
  /** «≥ 90 %», «sin meta». */
  meta: string;
  /** La columna «Cumple» (spec §8.3): `null` sin resultado o sin meta. */
  cumple: boolean | null;
  frase: string | null;
  requiereAccion: boolean;
  repetido: boolean;
  corregida: boolean;
  metaTardia: boolean;
  sinAnalisis: boolean;
  analisis: string | null;
  causa: string | null;
  accionPropuesta: string | null;
};

/**
 * La tabla del año (spec §8.5 y §12.3): una fila por periodo de la periodicidad que rige, desde el inicio de medición,
 * con sus valores, resultado, meta, estado visible y marcas; sin soportes. Vacía para quien no ve el indicador.
 */
export async function tablaDelAnio(sesion: SujetoVisibilidad, indicadorId: number, anio: number, opciones?: Opciones): Promise<FilaDelAnio[]> {
  const sql = opciones?.sql ?? obtenerSql();
  const ahora = opciones?.ahora ?? new Date();
  if (!Number.isInteger(anio) || anio < 1900 || anio > 9999) return [];
  if (!(await puedeVerIndicador(indicadorId, sesion, { sql }))) return [];
  const [i] = await sql`SELECT inicio_medicion, soporte_obligatorio FROM indicadores WHERE id = ${indicadorId}`;
  if (!i?.inicio_medicion) return [];
  const zona = zonaHoraria();
  const versiones = await versionesAprobadas(sql, indicadorId);
  const inicio = periodoDe(i.inicio_medicion as string, zona);
  if (!inicio) return [];
  const periodos: Periodo[] = [];
  for (const t of tramos(versiones, i.inicio_medicion as string, zona)) {
    for (const clave of clavesDelAnio(t.periodicidad, anio)) {
      const p = periodoDe(clave, zona)!;
      if (p.desde.getTime() >= t.desde && p.desde.getTime() < t.hasta) periodos.push(p);
    }
  }
  if (periodos.length === 0) return [];
  const mediciones = await sql`SELECT * FROM mediciones WHERE indicador_id = ${indicadorId} AND periodo IN ${sql(periodos.map((p) => p.clave))}`;
  const metas = await sql`SELECT periodo, meta, meta_max FROM indicador_metas
    WHERE indicador_id = ${indicadorId} AND periodo IN ${sql(periodos.map((p) => p.clave))}`;
  const filas: FilaDelAnio[] = [];
  for (const p of periodos) {
    const version = versionQueRigeEntre(versiones, p, zona)!;
    const m = mediciones.find((x) => x.periodo === p.clave);
    const programada = metas.find((x) => x.periodo === p.clave);
    // La meta congelada si la hay; si no, la que aplicaría hoy.
    const reglaTexto: ReglaEnTexto =
      m && m.meta_aplicada !== null
        ? { ...version.regla, meta: texto(m.meta_aplicada), metaMax: texto(m.meta_max_aplicada) }
        : programada
          ? { ...version.regla, meta: texto(programada.meta), metaMax: texto(programada.meta_max) }
          : version.regla;
    const regla = reglaDeTexto(reglaTexto);
    filas.push(m ? await filaDeMedicion(sql, m, p, version, regla, i.soporte_obligatorio === true, ahora) : filaSinMedicion(p, version, regla, ahora));
  }
  return filas;
}

function filaSinMedicion(p: Periodo, version: VersionDeCalculo, regla: Regla, ahora: Date): FilaDelAnio {
  return {
    periodo: p.clave,
    etiqueta: conMayuscula(p.etiqueta),
    medicionId: null,
    estado: p.hasta.getTime() >= ahora.getTime() ? "por_venir" : "sin_dato",
    vencida: false,
    vence: null,
    historica: false,
    noAplica: false,
    motivo: null,
    valores: version.calculo.letras.map((letra) => ({ letra, valor: null })),
    resultado: null,
    semaforo: null,
    meta: textoMeta(regla, version.unidad),
    cumple: null,
    frase: null,
    requiereAccion: false,
    repetido: false,
    corregida: false,
    metaTardia: false,
    sinAnalisis: false,
    analisis: null,
    causa: null,
    accionPropuesta: null,
  };
}

async function filaDeMedicion(
  sql: Cliente,
  m: Record<string, unknown>,
  p: Periodo,
  version: VersionDeCalculo,
  regla: Regla,
  soporteObligatorio: boolean,
  ahora: Date,
): Promise<FilaDelAnio> {
  const id = Number(m.id);
  const valores = await valoresPorLetra(sql, id, version);
  const resultado = typeof m.resultado_exacto === "string" ? deTexto(m.resultado_exacto) : null;
  const semaforo = (m.semaforo as Semaforo | null) ?? null;
  const historica = m.historica === true;
  const noAplica = m.no_aplica === true;
  const exigido = analisisExigido({ semaforo, repetido: m.incumplimiento_repetido === true, historica, noAplica });
  const conAnalisis =
    exigido === "ninguno" || (lleno(m.causa) && lleno(m.accion_propuesta)) || (exigido === "simple" && lleno(m.analisis));
  const datos = noAplica || resultado !== null;
  // Con los datos y el análisis, lo que deja abierta una medición es el soporte que falta: se muestra por reportar.
  const faltaSoporte = datos && conAnalisis && m.estado === "abierta" && soporteObligatorio && !historica && !noAplica;
  const vence = new Date(m.vence_en as string);
  const visible = estadoVisible(
    {
      estado: m.estado as EstadoMedicion,
      vence,
      historica,
      datosCompletos: datos && !faltaSoporte,
      faltaDatoAjeno: false,
      faltaAnalisis: datos && !conAnalisis,
    },
    ahora,
  );
  const motivo = (m.no_aplica_motivo as string | null) ?? null;
  return {
    periodo: p.clave,
    etiqueta: conMayuscula(p.etiqueta),
    medicionId: id,
    estado: visible.estado,
    vencida: visible.vencida,
    vence: diaEnPalabras(vence),
    historica,
    noAplica,
    motivo,
    valores: version.calculo.letras.map((letra) => ({ letra, valor: valores[letra] ? numeroEs(valores[letra], 4, "truncar") : null })),
    resultado: resultado ? textoValor(resultado, version.unidad, regla) : null,
    semaforo,
    meta: textoMeta(regla, version.unidad),
    cumple: resultado && semaforo ? semaforo === "bien" : null,
    frase: datos ? fraseDeResultado({ resultado, semaforo, noAplica, motivo }, regla, version.unidad) : null,
    requiereAccion: m.requiere_accion === true,
    repetido: m.incumplimiento_repetido === true,
    corregida: m.corregida === true,
    metaTardia: m.meta_tardia === true,
    sinAnalisis: m.sin_analisis === true,
    analisis: (m.analisis as string | null) ?? null,
    causa: (m.causa as string | null) ?? null,
    accionPropuesta: (m.accion_propuesta as string | null) ?? null,
  };
}
