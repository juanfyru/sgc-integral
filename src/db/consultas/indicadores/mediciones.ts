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
import { MESES, periodoDe, type Periodo } from "@/lib/indicadores-documentales/periodo";
import { calcular, variacionExcesiva } from "@/lib/indicadores/calculo";
import { analisisCompleto, analisisExigido, esRepetido, estadoVisible, type EstadoVisible } from "@/lib/indicadores/estados";
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

export const NO_EXISTE = "La medición no existe";
const CERRADA = "La medición está cerrada: pida al Administrador del SGC que la reabra";
const RETIRADO = "El indicador está retirado: ya no admite reportes";
const YA_REPORTADA = "La medición ya se reportó: corrija los datos y pulse «Reportar»";
const FICHA_CAMBIO = "La ficha del indicador cambió: recargue la página";
const OTRA_PERIODICIDAD = "Ese periodo ya no se mide: la ficha que lo rige es de otra periodicidad";
/** Un histórico entra solo por la tabla del año (`registrarHistoricos`, spec §8.8). */
const ES_HISTORICO = "Ese periodo es histórico: regístrelo en la tabla del año";

/**
 * Una medición abierta de la periodicidad vieja que quedó dentro del tramo de un cambio mayor de periodicidad (los meses
 * de un trimestre que ahora rige una ficha trimestral) no se mide ni se calcula con una ficha que no es la suya.
 */
export const esDeOtraPeriodicidad = (periodo: string, version: { periodicidad: Periodicidad | null }) =>
  periodicidadDe(periodo) !== version.periodicidad;

const texto = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));
/** El análisis guardado de una medición, para `analisisCompleto`. */
export const analisisDe = (m: Record<string, unknown>) => ({
  analisis: texto(m.analisis),
  causa: texto(m.causa),
  accionPropuesta: texto(m.accion_propuesta),
});
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

export type VersionDeCalculo = {
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
export async function versionesAprobadas(sql: Cliente, indicadorId: number): Promise<VersionDeCalculo[]> {
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
export async function reglaDelPeriodo(sql: Cliente, indicadorId: number, periodo: string, v: VersionDeCalculo): Promise<ReglaEnTexto> {
  const [p] = await sql`SELECT meta, meta_max FROM indicador_metas WHERE indicador_id = ${indicadorId} AND periodo = ${periodo}`;
  return p ? { ...v.regla, meta: texto(p.meta), metaMax: texto(p.meta_max) } : v.regla;
}

/** La primera versión aprobada: con su aprobación, lo que terminó antes es histórico (spec §8.8). */
export function primeraAprobada(versiones: readonly VersionDeCalculo[]): VersionDeCalculo | null {
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

/**
 * «Medición con datos» (alias `m`): cualquier cosa que ya es historia y no se puede quitar. Una medición que no está
 * abierta, con valores, análisis, causa o acción propuesta, eventos, observaciones o soportes (`archivos` no tiene FK
 * hacia la medición: quitarla dejaría la evidencia huérfana). Una sola definición para retirar, cambiar el inicio y
 * aprobar un cambio de periodicidad.
 */
export const conDatos = (sql: Cliente) => sql`(m.estado <> 'abierta' OR m.no_aplica
  OR coalesce(btrim(m.analisis), '') <> '' OR coalesce(btrim(m.causa), '') <> '' OR coalesce(btrim(m.accion_propuesta), '') <> ''
  OR EXISTS (SELECT 1 FROM medicion_valores mv WHERE mv.medicion_id = m.id)
  OR EXISTS (SELECT 1 FROM medicion_eventos me WHERE me.medicion_id = m.id)
  OR EXISTS (SELECT 1 FROM medicion_observaciones mo WHERE mo.medicion_id = m.id)
  OR EXISTS (SELECT 1 FROM archivos ar WHERE ar.contexto = 'medicion' AND ar.contexto_id = m.id))`;

/**
 * Al aprobar un cambio mayor que cambia la periodicidad: quita las mediciones abiertas y sin datos de otra periodicidad
 * que empiezan con su «rige desde» o después (no tienen historia y se pisarían con las nuevas). Las que tienen datos se
 * quedan y no se miden (`esDeOtraPeriodicidad`). Quien llama tiene el indicador `FOR UPDATE`. Devuelve cuántas quitó.
 */
export async function quitarMedicionesDeOtraPeriodicidad(tx: TransactionSql, indicadorId: number, rigeDesde: string): Promise<number> {
  const periodo = periodoDe(rigeDesde, zonaHoraria());
  const nueva = periodicidadDe(rigeDesde);
  if (!periodo || !nueva) return 0;
  const filas = await tx`SELECT m.id, m.periodo FROM mediciones m
    WHERE m.indicador_id = ${indicadorId} AND m.desde >= ${periodo.desde} AND NOT ${conDatos(tx)}`;
  const ids = filas.filter((f) => periodicidadDe(f.periodo as string) !== nueva).map((f) => Number(f.id));
  if (ids.length > 0) await tx`DELETE FROM mediciones WHERE id IN ${tx(ids)}`;
  return ids.length;
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
 * fila bloqueada calcula con la versión que rige el periodo y la meta programada (o la de la ficha), decide
 * `requiere_accion`, el incumplimiento repetido y el estado y deja el evento con el antes y el después. Solo con un dato
 * (resultado o «no aplica») congela la versión, la meta y el límite: sin él, la meta y el límite quedan nulos y la versión
 * sigue la que se puso al abrir el periodo (`version_id` no admite nulo). Llama `alRecalcular` solo si cambió una columna
 * calculada; si nada cambió, ni evento ni alertas.
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
  if (esDeOtraPeriodicidad(m.periodo as string, version)) throw new ErrorIndicador(OTRA_PERIODICIDAD);

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
  const conAnalisis = analisisCompleto(analisisExigido({ semaforo, repetido, historica, noAplica }), analisisDe(m));
  const conSoporte = m.soporte_obligatorio !== true || historica || noAplica || (await contarSoportes(tx, medicionId)) > 0;
  const conDato = noAplica || resultado !== null;
  const estado: EstadoMedicion = conDato && conAnalisis && conSoporte ? "reportada" : "abierta";
  const limite = conDato ? limiteDeCritico(regla) : null;

  const nuevo = {
    version_id: conDato ? version.id : Number(m.version_id),
    resultado_exacto: resultado ? aTexto(resultado) : null,
    resultado: resultado ? aDecimal(resultado, 10, "redondear") : null,
    semaforo,
    meta_aplicada: conDato ? reglaTexto.meta : null,
    meta_max_aplicada: conDato ? reglaTexto.metaMax : null,
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
  if (columnasCambiaron) await alRecalcular(tx, r, { ahora: c.ahora, actorId: c.actorId });
  return r;
}

// ─────────────────────────────────────────────────────────────────────────────
// Reportar, «no aplica» y corregir
// ─────────────────────────────────────────────────────────────────────────────

export type Contexto = {
  medicion: Record<string, unknown> & { id: number };
  indicador: { id: number; codigo: string; soporteObligatorio: boolean };
  capacidad: Capacidad;
  version: VersionDeCalculo;
  periodo: Periodo;
};

/** La condición de persona que exige tocar la medición (`puedeMedir`, `puedeAnalizar`, …), de `src/lib/alcance.ts`. */
export type CondicionDePersona = (indicadorId: number, sujeto: SujetoVisibilidad, opciones: { sql: Cliente }) => Promise<Capacidad>;

/**
 * Lo que debe cumplirse para tocar una medición: que la persona la vea (si no, «no existe»), que cumpla la condición de
 * persona (`exigir`; por omisión, poder medir el indicador), que este siga activo y que la medición no esté cerrada
 * (salvo con `admiteCerrada`, para leerla). Con `bloquear`, dentro de la transacción: el indicador `FOR SHARE` y la
 * medición `FOR UPDATE`, en ese orden.
 */
export async function contextoDeMedicion(
  sql: Cliente,
  sesion: SujetoVisibilidad,
  medicionId: number,
  bloquear: boolean,
  opciones?: { admiteCerrada?: boolean; exigir?: CondicionDePersona },
): Promise<Contexto> {
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
  const capacidad = await (opciones?.exigir ?? puedeMedir)(indicadorId, sesion, { sql });
  if (!capacidad.puede) throw new ErrorPermiso();
  if (i.estado !== "activo") throw new ErrorIndicador(i.estado === "retirado" ? RETIRADO : NO_EXISTE);
  if (m.estado === "cerrada" && opciones?.admiteCerrada !== true) throw new ErrorIndicador(CERRADA);
  const zona = zonaHoraria();
  const periodo = periodoDe(m.periodo as string, zona);
  const version = periodo ? versionQueRigeEntre(await versionesAprobadas(sql, indicadorId), periodo, zona) : null;
  if (!periodo || !version) throw new ErrorIndicador(NO_EXISTE);
  if (esDeOtraPeriodicidad(m.periodo as string, version)) throw new ErrorIndicador(OTRA_PERIODICIDAD);
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
 * los límites del resultado, la división por cero, el soporte obligatorio y la confirmación por variación. Lo comparten
 * `reportar` y `registrarHistoricos` (que no pide la confirmación, y a un histórico no se le exige el soporte).
 */
export async function planDeReporte(
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
export const resultadoEnTexto = (exacto: unknown, version: VersionDeCalculo, regla: Regla): string | null =>
  typeof exacto === "string" ? textoValor(deTexto(exacto), version.unidad, regla) : null;

export type ResultadoDeReporte = { ok: true; estado: EstadoMedicion; semaforo: Semaforo | null } | { ok: false; confirmar: string };

/** ¿La medición se reportó alguna vez? Lo dice su historial: un reporte, un «no aplica» o un registro histórico. */
async function seReportoAlgunaVez(tx: TransactionSql, medicionId: number): Promise<boolean> {
  const [e] = await tx`SELECT 1 AS hay FROM medicion_eventos
    WHERE medicion_id = ${medicionId} AND tipo IN ('reporte', 'no_aplica', 'historico') LIMIT 1`;
  return e !== undefined;
}

/** Lo que dejó `escribirReporte`: el recálculo, si era la primera vez y el antes y el después del evento. */
export type ReporteEscrito = { r: Recalculo; primera: boolean; detalle: { antes: Record<string, unknown>; despues: Record<string, unknown>; sinMedidor?: true } };

/**
 * Escribe un reporte ya validado por `planDeReporte`, con los candados de `contextoDeMedicion` tomados: los valores, la
 * marca de reportada (quién y cuándo, la primera vez) y, si estaba, quita «no aplica»; después recalcula. Deja el evento
 * `primerEvento` si la medición nunca se reportó y `correccion` si ya. Lo comparten `reportar` y `registrarHistoricos`.
 */
export async function escribirReporte(
  tx: TransactionSql,
  ctx: Contexto,
  valores: Readonly<Record<string, Fraccion | null>>,
  c: { usuarioId: number; ahora: Date; primerEvento: TipoEvento },
): Promise<ReporteEscrito> {
  const { medicion: m, version } = ctx;
  const antes = enTexto(version, await valoresPorLetra(tx, m.id, version));
  const despues = enTexto(version, valores);
  const primera = !(await seReportoAlgunaVez(tx, m.id));
  await escribirValores(tx, m.id, version, valores, c.usuarioId, c.ahora);
  if (m.reportada_en === null || m.no_aplica === true) {
    await tx`UPDATE mediciones SET reportada_por = coalesce(reportada_por, ${c.usuarioId}), reportada_en = coalesce(reportada_en, ${c.ahora}),
        no_aplica = false, no_aplica_motivo = NULL
      WHERE id = ${m.id}`;
  }
  const conMotivo = m.no_aplica === true ? { motivo: m.no_aplica_motivo as string | null } : {};
  const detalle = {
    antes: { ...antes, noAplica: m.no_aplica === true, ...conMotivo },
    despues: { ...despues, noAplica: false, ...(m.no_aplica === true ? { motivo: null } : {}) },
    ...(ctx.capacidad.sinMedidor ? { sinMedidor: true as const } : {}),
  };
  const r = await recalcularMedicion(tx, m.id, { ahora: c.ahora, actorId: c.usuarioId, evento: primera ? c.primerEvento : "correccion", detalle });
  return { r, primera, detalle };
}

/** Un histórico no se reporta ni se guarda por aquí: entra por la tabla del año (spec §8.8). */
function noHistorica(ctx: Contexto): Contexto {
  if (ctx.medicion.historica === true) throw new ErrorIndicador(ES_HISTORICO);
  return ctx;
}

/**
 * Reporta los datos de una medición, los guarda sin reportar (`parcial`) o los corrige antes del cierre (spec §8.2 y
 * §8.7). Un histórico no: entra por `registrarHistoricos`. Valida fuera de la transacción lo que puede y lo repite
 * dentro, con los candados, antes de escribir nada. Un
 * salto grande frente al periodo anterior con resultado no escribe y pide confirmación (`confirmado`). Un reporte deja el
 * evento `reporte` si la medición nunca se reportó y `correccion` si ya; lo mismo otra vez no deja nada. «Guardar sin
 * reportar» no calcula ni deja evento: solo los valores y su acción de bitácora (`medicion_guardada`).
 */
export async function reportar(sesion: SesionFlujo, d: DatosDeReportar, opciones?: Opciones): Promise<ResultadoDeReporte> {
  if (!puede(sesion, "indicadores.medir")) throw new ErrorPermiso();
  const sql = opciones?.sql ?? obtenerSql();
  const ahora = opciones?.ahora ?? new Date();
  const fuera = await planDeReporte(sql, noHistorica(await contextoDeMedicion(sql, sesion, d.medicionId, false)), d);
  if (fuera.confirmar) return { ok: false, confirmar: fuera.confirmar };

  return enTransaccion(sql, async (tx) => {
    const ctx = noHistorica(await contextoDeMedicion(tx, sesion, d.medicionId, true));
    const plan = await planDeReporte(tx, ctx, d);
    if (plan.confirmar) return { ok: false as const, confirmar: plan.confirmar };
    const { medicion: m, version } = ctx;
    const base = { codigo: ctx.indicador.codigo, indicadorId: ctx.indicador.id, periodo: m.periodo };
    if (d.parcial) {
      const antes = enTexto(version, await valoresPorLetra(tx, m.id, version));
      const despues = enTexto(version, plan.valores);
      if (JSON.stringify(antes) !== JSON.stringify(despues)) {
        await escribirValores(tx, m.id, version, plan.valores, sesion.usuarioId, ahora);
        await registrarAuditoria(tx, {
          usuarioId: sesion.usuarioId,
          accion: "medicion_guardada",
          entidad: "medicion",
          entidadId: m.id,
          detalle: { ...base, antes, despues, ...(ctx.capacidad.sinMedidor ? { sinMedidor: true } : {}) },
        });
      }
      return { ok: true as const, estado: m.estado as EstadoMedicion, semaforo: (m.semaforo as Semaforo | null) ?? null };
    }

    const { r, primera, detalle } = await escribirReporte(tx, ctx, plan.valores, { usuarioId: sesion.usuarioId, ahora, primerEvento: "reporte" });
    if (r.cambio) {
      const regla = reglaDeTexto(await reglaDelPeriodo(tx, ctx.indicador.id, m.periodo as string, version));
      await registrarAuditoria(tx, {
        usuarioId: sesion.usuarioId,
        accion: primera ? "medicion_reportada" : "medicion_corregida",
        entidad: "medicion",
        entidadId: m.id,
        detalle: {
          ...base,
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
export function motivoValido(motivo: string): string {
  const m = typeof motivo === "string" ? motivo.trim() : "";
  if (m.length < 5) throw new ErrorIndicador("El motivo debe tener al menos 5 caracteres");
  if (m.length > 500) throw new ErrorIndicador("El motivo no puede pasar de 500 caracteres");
  return m;
}

/**
 * Marca «no aplica» con su motivo ya validado, con los candados de `contextoDeMedicion` tomados: cuenta como reportado
 * (quién y cuándo, la primera vez), conserva lo digitado y recalcula con el evento que diga `evento` (según si la medición
 * se reportaba por primera vez). `null` si ya estaba marcada con el mismo motivo (no deja nada). Lo comparten
 * `marcarNoAplica` y `registrarHistoricos`.
 */
export async function escribirNoAplica(
  tx: TransactionSql,
  ctx: Contexto,
  motivo: string,
  c: { usuarioId: number; ahora: Date; evento: (primera: boolean) => TipoEvento },
): Promise<ReporteEscrito | null> {
  const m = ctx.medicion;
  if (m.no_aplica === true && m.no_aplica_motivo === motivo) return null;
  const primera = !(await seReportoAlgunaVez(tx, m.id));
  await tx`UPDATE mediciones SET no_aplica = true, no_aplica_motivo = ${motivo},
      reportada_por = coalesce(reportada_por, ${c.usuarioId}), reportada_en = coalesce(reportada_en, ${c.ahora})
    WHERE id = ${m.id}`;
  const detalle = {
    antes: { noAplica: m.no_aplica === true, motivo: (m.no_aplica_motivo as string | null) ?? null },
    despues: { noAplica: true, motivo },
    ...(ctx.capacidad.sinMedidor ? { sinMedidor: true as const } : {}),
  };
  const r = await recalcularMedicion(tx, m.id, { ahora: c.ahora, actorId: c.usuarioId, evento: c.evento(primera), detalle });
  return { r, primera, detalle };
}

/**
 * «No aplica en este periodo» (spec §8.2): con motivo, cuenta como reportado, queda en gris y no pide análisis ni
 * soporte. Conserva lo digitado. Marcar lo mismo otra vez no deja nada. Un histórico no: se marca en la tabla del año.
 */
export async function marcarNoAplica(sesion: SesionFlujo, d: { medicionId: number; motivo: string }, opciones?: Opciones): Promise<void> {
  if (!puede(sesion, "indicadores.medir")) throw new ErrorPermiso();
  const motivo = motivoValido(d.motivo);
  const sql = opciones?.sql ?? obtenerSql();
  const ahora = opciones?.ahora ?? new Date();
  noHistorica(await contextoDeMedicion(sql, sesion, d.medicionId, false));
  await enTransaccion(sql, async (tx) => {
    const ctx = noHistorica(await contextoDeMedicion(tx, sesion, d.medicionId, true));
    const m = ctx.medicion;
    const escrito = await escribirNoAplica(tx, ctx, motivo, { usuarioId: sesion.usuarioId, ahora, evento: () => "no_aplica" });
    if (!escrito?.r.cambio) return;
    const { detalle } = escrito;
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
 * digitado. Un histórico no: se corrige en la tabla del año.
 */
export async function quitarNoAplica(sesion: SesionFlujo, medicionId: number, opciones?: Opciones): Promise<void> {
  if (!puede(sesion, "indicadores.medir")) throw new ErrorPermiso();
  const sql = opciones?.sql ?? obtenerSql();
  const ahora = opciones?.ahora ?? new Date();
  const sinMarca = (m: Record<string, unknown>) => {
    if (m.no_aplica !== true) throw new ErrorIndicador("La medición no está marcada «No aplica»");
  };
  sinMarca(noHistorica(await contextoDeMedicion(sql, sesion, medicionId, false)).medicion);
  await enTransaccion(sql, async (tx) => {
    const ctx = noHistorica(await contextoDeMedicion(tx, sesion, medicionId, true));
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

/** «10 de octubre de 2026», el día en la zona de la instalación. */
function diaEnPalabras(d: Date): string {
  const [anio, mes, dia] = fechaEnZona(d, zonaHoraria()).split("-").map(Number);
  return `${dia} de ${MESES[mes - 1]} de ${anio}`;
}

export const conMayuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

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
    // Una medición cerrada se muestra (sin formulario) a quien podría medirla; lo demás no existe para la persona.
    ctx = await contextoDeMedicion(sql, sesion, Number(m.id), false, { admiteCerrada: true });
  } catch (err) {
    if (err instanceof ErrorIndicador || err instanceof ErrorPermiso) return null;
    throw err;
  }
  return datosDeReporte(sql, ctx, ahora);
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
  const filas = await sql`SELECT periodo FROM mediciones
    WHERE indicador_id = ${indicadorId} AND estado = 'abierta' AND NOT historica AND NOT no_aplica AND reportada_en IS NULL
    ORDER BY desde`;
  const zona = zonaHoraria();
  const versiones = filas.length > 0 ? await versionesAprobadas(sql, indicadorId) : [];
  for (const f of filas) {
    const clave = f.periodo as string;
    const periodo = periodoDe(clave, zona);
    const version = periodo ? versionQueRigeEntre(versiones, periodo, zona) : null;
    if (periodo && version && !esDeOtraPeriodicidad(clave, version)) return { periodo: clave, etiqueta: periodo.etiqueta };
  }
  return null;
}

/**
 * Los periodos de `anio` que se miden: los de la periodicidad que rige cada tramo, desde el inicio de medición. Lo usan la
 * tabla del año y las metas por periodo.
 */
export function periodosDelAnio(versiones: readonly VersionDeCalculo[], inicioMedicion: string, anio: number, zona: string): Periodo[] {
  if (!periodoDe(inicioMedicion, zona)) return [];
  const periodos: Periodo[] = [];
  for (const t of tramos(versiones, inicioMedicion, zona)) {
    for (const clave of clavesDelAnio(t.periodicidad, anio)) {
      const p = periodoDe(clave, zona)!;
      if (p.desde.getTime() >= t.desde && p.desde.getTime() < t.hasta) periodos.push(p);
    }
  }
  return periodos;
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
  /** Por letra de la versión que rige el periodo, con el nombre que tiene en ella y coma decimal; `null` si no hay. */
  valores: { letra: string; nombre: string; valor: string | null }[];
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
  const periodos = periodosDelAnio(versiones, i.inicio_medicion as string, anio, zona);
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
    valores: version.variables.map((v) => ({ letra: v.letra, nombre: v.nombre, valor: null })),
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
  const conAnalisis = analisisCompleto(
    analisisExigido({ semaforo, repetido: m.incumplimiento_repetido === true, historica, noAplica }),
    analisisDe(m),
  );
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
    valores: version.variables.map((v) => ({
      letra: v.letra,
      nombre: v.nombre,
      valor: valores[v.letra] ? numeroEs(valores[v.letra], 4, "truncar") : null,
    })),
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
