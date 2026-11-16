/**
 * Los periodos de un dato compartido (anexo 14C, §4.3 y §4.4): una fila de `variable_valores` por periodo del dato, que su
 * responsable reporta una sola vez y que cada indicador que lo usa toma (la propagación, Tarea 11).
 *
 * - **Cuándo se abren** (`asegurarPeriodosDeDatos`, como las constancias de la 14B): solos, en la pasada y en las páginas
 *   del dato. Se pide cada periodo **terminado** del dato que cae dentro de un periodo ordinario (no histórico) y sin cerrar
 *   de un indicador activo cuya **versión que rige ese periodo** cita el dato, también el periodo del indicador que sigue en
 *   curso y aún no tiene medición: un anual aprobado en noviembre pide los meses del año. No nacen vencidos: si su fecha
 *   límite ya pasó al abrirlo, el plazo cuenta desde ese día. Con dimensión, el periodo fija su lista de categorías. Los
 *   pendientes sin eventos ni soportes que ya nadie pide se quitan; los que se conservan quedan con `se_pide` en falso y
 *   vuelven a pedirse (sin nacer vencidos) si otra versión vuelve a citar el dato.
 * - **Quién reporta y corrige** (`reportarDato`): el permiso `indicadores.medir` más `puedeReportarDato`, comprobado dentro de
 *   la transacción. Corregir antes del cierre no pide justificación; cada cambio deja su antes y su después en el historial
 *   (`variable_eventos`, de solo inserción).
 * - **Su tarea** (`tareasDeDatos`) y sus recordatorios (`datos-vencidos.ts`) miran lo mismo: lo que se pide
 *   (`periodoQueSePide`).
 *
 * Candados: el dato `FOR SHARE` y después el periodo `FOR UPDATE` (o, al abrir, las filas del maestro `FOR KEY SHARE`), en
 * una transacción por dato: los indicadores que lo usan se leen sin candado, porque una transacción no bloquea más de un
 * indicador. Quien edita el dato (`datos.ts`) lo toma `FOR UPDATE`.
 *
 * Módulo liviano: lo importan `tareas.ts`, `vencimientos.ts`, `datos-vencidos.ts`, la propagación y el cierre, así que no
 * importa `lectura`, `fichas`, `aprobacion`, `operacion`, `tareas` ni `constancias`.
 */
import type { TransactionSql } from "postgres";
import { obtenerSql, type Cliente } from "@/db/cliente";
import { registrarAuditoria } from "@/db/consultas/admin";
import { enTransaccion, type SesionFlujo } from "@/db/consultas/flujo/contrato";
import { puedeReportarDato, puedeVerDato, responsabilidadEnDato, type SujetoVisibilidad } from "@/lib/alcance";
import { periodoDe, type Periodo } from "@/lib/indicadores-documentales/periodo";
import { variacionExcesiva } from "@/lib/indicadores/calculo";
import { listaDelPeriodo, type CategoriaDeMedicion } from "@/lib/indicadores/categorias";
import { CERO, comparar, esNegativa, fraccion, restar, sumar, type Fraccion } from "@/lib/indicadores/formula/fraccion";
import {
  clavesFinas,
  contiene,
  fechaLimiteDeReporte,
  periodicidadDe,
  periodoQueContiene,
  periodosTerminados,
  versionQueRigeEntre,
} from "@/lib/indicadores/periodos";
import { leerValor, valorEnTexto, type VariableDeCaptura } from "@/lib/indicadores/reporte";
import { numeroExacto } from "@/lib/indicadores/semaforo";
import { ErrorIndicador, SIN_RESPONSABLE, type Periodicidad } from "@/lib/indicadores/tipos";
import { ErrorPermiso, puede } from "@/lib/permisos";
import type { Tarea } from "@/lib/tareas";
import { fechaLimite } from "@/lib/tramites/plazos";
import { zonaHoraria } from "@/lib/zona-horaria";
import { maestroDeCategorias } from "./dimensiones";
import { obtenerParametros } from "./maestros";
import { primeraAprobada, texto, tramos, versionesAprobadasDe, type VersionDeCalculo } from "./mediciones";

type Opciones = { sql?: Cliente; ahora?: Date };

export type PeriodoDeDato = {
  id: number;
  datoId: number;
  periodo: string;
  desde: Date;
  hasta: Date;
  venceEn: Date;
  estado: "pendiente" | "reportado" | "cerrado";
  /** Con dimensión, la suma de las categorías. */
  valor: string | null;
  /** `{ "<categoriaId>": "<valor>" }`, si el periodo se reporta por categoría. */
  porCategoria: Record<string, string> | null;
  /** Las categorías que pide el periodo, fijadas al abrirlo; `null` sin dimensión. */
  categorias: CategoriaDeMedicion[] | null;
  /** Quien lo reportó la primera vez: quien lo corrigió queda en el historial. */
  reporto: string | null;
  reportadoEn: Date | null;
  corregido: boolean;
  /** Pendiente y se pide (`periodoQueSePide`): uno que ya nadie pide no es tarea de nadie ni está «por reportar». */
  sePide: boolean;
};

export const PERIODO_NO_EXISTE = "El periodo del dato no existe";
const CERRADO = "El periodo está cerrado: lo reabre el Administrador del SGC";
const SIN_CAMBIOS = "No hay cambios que corregir";
const FORMULARIO_CAMBIO = "El formulario no corresponde a este periodo: recargue la página";

/**
 * Lo que se pide de un dato, para un `WHERE` sobre `variable_valores vv` (anexo 14C, §4.3): un periodo pendiente que alguna
 * medición necesita. Lo sabe `loQuePiden` y lo deja escrito `asegurarDe` en `se_pide`: el pendiente que ya ningún indicador
 * necesita y que se conserva solo porque tiene historial o un soporte sigue existiendo, pero no se pide, como la constancia
 * de la 14B (`constanciaQueSePide`). Lo comparten la tarea, sus recordatorios (`datos-vencidos.ts`), el número de la pestaña
 * y el estado de la lista y de la página del dato.
 */
export const periodoQueSePide = (sql: Cliente) => sql`(vv.estado = 'pendiente' AND vv.se_pide)`;

// ─────────────────────────────────────────────────────────────────────────────
// Cuándo se abren
// ─────────────────────────────────────────────────────────────────────────────

/** Lo que se sabe de un indicador que cita el dato: su inicio, sus versiones aprobadas y sus mediciones. */
type IndicadorQueCita = {
  inicio: string;
  versiones: VersionDeCalculo[];
  mediciones: Map<string, { cerrada: boolean; historica: boolean }>;
};

/**
 * Los periodos del dato que pide un indicador (anexo 14C, §4.3): por cada periodo de sus tramos que ya empezó (los
 * terminados y el que sigue en curso), ordinario y sin cerrar, cuya versión que rige cita el dato, los periodos del dato que
 * lo forman y ya terminaron. Un periodo sin medición es histórico con la regla de `abrirPeriodos`: terminó antes de la
 * primera aprobación. No consulta nada.
 */
function periodosQuePide(ind: IndicadorQueCita, dato: { id: number; periodicidad: Periodicidad }, ahora: Date, zona: string): Periodo[] {
  const aprobada = primeraAprobada(ind.versiones)?.aprobadaEn ?? null;
  const salida: Periodo[] = [];
  for (const t of tramos(ind.versiones, ind.inicio, zona)) {
    const enCurso = periodoQueContiene(t.periodicidad, ahora, zona);
    const empezados = periodosTerminados(t.periodicidad, t.primero.clave, ahora, zona);
    if (enCurso.desde.getTime() >= t.primero.desde.getTime()) empezados.push(enCurso);
    for (const periodo of empezados) {
      if (periodo.desde.getTime() >= t.hasta) break;
      const m = ind.mediciones.get(periodo.clave);
      const historica = m ? m.historica : aprobada !== null && periodo.hasta.getTime() < aprobada.getTime();
      if (historica || m?.cerrada) continue;
      const version = versionQueRigeEntre(ind.versiones, periodo, zona);
      if (!version?.variables.some((v) => v.datoId === dato.id) || !contiene(t.periodicidad, dato.periodicidad)) continue;
      for (const clave of clavesFinas(periodo.clave, dato.periodicidad)) {
        const fino = periodoDe(clave, zona)!;
        if (fino.hasta.getTime() < ahora.getTime()) salida.push(fino);
      }
    }
  }
  return salida;
}

/**
 * Lo que piden del dato los indicadores activos con inicio de medición que alguna versión aprobada suya lo cita, leídos sin
 * candado. `completo` es falso si alguno no se pudo leer: entonces no se quita nada.
 */
async function loQuePiden(
  tx: TransactionSql,
  dato: { id: number; periodicidad: Periodicidad },
  ahora: Date,
  zona: string,
): Promise<{ pedidos: Map<string, Periodo>; completo: boolean }> {
  const indicadores = await tx`SELECT DISTINCT i.id, i.inicio_medicion FROM indicadores i
    JOIN indicador_versiones v ON v.indicador_id = i.id AND v.estado = 'aprobada'
    JOIN indicador_variables iv ON iv.version_id = v.id AND iv.variable_compartida_id = ${dato.id}
    WHERE i.estado = 'activo' AND i.inicio_medicion IS NOT NULL
    ORDER BY i.id`;
  const pedidos = new Map<string, Periodo>();
  if (indicadores.length === 0) return { pedidos, completo: true };
  const ids = indicadores.map((i) => Number(i.id));
  const versiones = await versionesAprobadasDe(tx, ids);
  const mediciones = new Map<number, IndicadorQueCita["mediciones"]>();
  for (const m of await tx`SELECT indicador_id, periodo, estado, historica FROM mediciones WHERE indicador_id IN ${tx(ids)}`) {
    const id = Number(m.indicador_id);
    const deEste = mediciones.get(id) ?? new Map();
    deEste.set(m.periodo as string, { cerrada: m.estado === "cerrada", historica: m.historica === true });
    mediciones.set(id, deEste);
  }
  let completo = true;
  for (const i of indicadores) {
    const id = Number(i.id);
    try {
      const ind = { inicio: i.inicio_medicion as string, versiones: versiones.get(id) ?? [], mediciones: mediciones.get(id) ?? new Map() };
      for (const p of periodosQuePide(ind, dato, ahora, zona)) pedidos.set(p.clave, p);
    } catch (err) {
      completo = false;
      console.error(`No se pudo saber qué periodos del dato compartido ${dato.id} pide el indicador ${id}:`, err);
    }
  }
  return { pedidos, completo };
}

/**
 * Un dato en su transacción, tomado `FOR SHARE`: abre (idempotente) los periodos que se piden y quita los pendientes que ya
 * nadie pide, sin eventos ni soportes; el que se conserva (con historia o soporte) queda con `se_pide` en falso, y el que
 * vuelve a pedirse, en verdadero, sin nacer vencido: si su fecha límite ya pasó, cuenta desde hoy con el plazo del dato y sus
 * avisos empiezan otra vez. Si no se pudo saber qué pide algún indicador (`completo` falso), solo abre: no quita ni marca.
 * Con dimensión, la lista de cada periodo nuevo sale del maestro leído `FOR KEY SHARE` en esta misma transacción
 * (`maestroDeCategorias`).
 */
function asegurarDe(sql: Cliente, datoId: number, ahora: Date): Promise<{ abiertos: number; quitados: number }> {
  return enTransaccion(sql, async (tx) => {
    const [d] = await tx`SELECT id, periodicidad, plazo_reporte_dias, dimension_id FROM variables_compartidas WHERE id = ${datoId} FOR SHARE`;
    if (!d) return { abiertos: 0, quitados: 0 };
    const zona = zonaHoraria();
    const dato = { id: Number(d.id), periodicidad: d.periodicidad as Periodicidad };
    const { pedidos, completo } = await loQuePiden(tx, dato, ahora, zona);

    const existentes = new Set((await tx`SELECT periodo FROM variable_valores WHERE variable_id = ${dato.id}`).map((f) => f.periodo as string));
    const nuevos = [...pedidos.values()].filter((p) => !existentes.has(p.clave)).sort((a, b) => a.desde.getTime() - b.desde.getTime());
    let abiertos = 0;
    const plazo = Number(d.plazo_reporte_dias);
    if (nuevos.length > 0) {
      const maestro = d.dimension_id === null ? null : await maestroDeCategorias(tx, Number(d.dimension_id), { bloquear: true });
      for (const p of nuevos) {
        const limite = fechaLimiteDeReporte(p, plazo, zona);
        const vence = limite.getTime() < ahora.getTime() ? fechaLimite(ahora, plazo, zona) : limite;
        const categorias = maestro === null ? null : listaDelPeriodo(maestro, p);
        const creada = await tx`INSERT INTO variable_valores (variable_id, periodo, desde, hasta, vence_en, categorias, creado_en)
          VALUES (${dato.id}, ${p.clave}, ${p.desde}, ${p.hasta}, ${vence}, ${categorias === null ? null : tx.json(categorias as never)}, ${ahora})
          ON CONFLICT DO NOTHING
          RETURNING id`;
        abiertos += creada.length;
      }
    }
    if (!completo) return { abiertos, quitados: 0 };
    const claves = [...pedidos.keys()];
    // `archivos` no tiene llave foránea hacia el periodo: quitar uno con soporte dejaría la evidencia huérfana.
    const quitados = await tx`DELETE FROM variable_valores vv
      WHERE vv.variable_id = ${dato.id} AND vv.estado = 'pendiente' AND NOT (vv.periodo = ANY(${claves}::text[]))
        AND NOT EXISTS (SELECT 1 FROM variable_eventos ve WHERE ve.valor_id = vv.id)
        AND NOT EXISTS (SELECT 1 FROM archivos ar WHERE ar.contexto = 'dato_compartido' AND ar.contexto_id = vv.id)
      RETURNING vv.id`;
    // El que se conserva sin que nadie lo pida deja de ser tarea, aviso y número de la pestaña.
    await tx`UPDATE variable_valores SET se_pide = false
      WHERE variable_id = ${dato.id} AND estado = 'pendiente' AND se_pide AND NOT (periodo = ANY(${claves}::text[]))`;
    // El que vuelve a pedirse no nace vencido (los SET leen la fila de antes: todos miran el `vence_en` viejo).
    const desdeHoy = fechaLimite(ahora, plazo, zona);
    await tx`UPDATE variable_valores SET se_pide = true,
        vence_en = CASE WHEN vence_en < ${ahora} THEN ${desdeHoy} ELSE vence_en END,
        aviso_previo_en = CASE WHEN vence_en < ${ahora} THEN NULL ELSE aviso_previo_en END,
        aviso_vencido_en = CASE WHEN vence_en < ${ahora} THEN NULL ELSE aviso_vencido_en END,
        escalado_en = CASE WHEN vence_en < ${ahora} THEN NULL ELSE escalado_en END
      WHERE variable_id = ${dato.id} AND estado = 'pendiente' AND NOT se_pide AND periodo = ANY(${claves}::text[])`;
    return { abiertos, quitados: quitados.length };
  });
}

/**
 * Abre los periodos que se piden de cada dato (o solo de `datoIds`) y quita los pendientes que ya nadie pide (anexo 14C,
 * §4.3); devuelve cuántos abrió y cuántos quitó. Sin `datoIds`, los datos que cita alguna versión aprobada de un indicador
 * activo con inicio de medición y los que tienen algún pendiente. Cada dato en su transacción: el que falla se registra y
 * los demás siguen. La llaman la pasada de vencimientos (antes de la propagación) y las páginas de «Datos compartidos».
 */
export async function asegurarPeriodosDeDatos(opciones?: {
  sql?: Cliente;
  ahora?: Date;
  datoIds?: readonly number[];
}): Promise<{ abiertos: number; quitados: number }> {
  const sql = opciones?.sql ?? obtenerSql();
  const ahora = opciones?.ahora ?? new Date();
  const ids = opciones?.datoIds
    ? [...new Set(opciones.datoIds)].filter((id) => Number.isInteger(id) && id > 0)
    : (
        await sql`SELECT iv.variable_compartida_id AS id FROM indicador_variables iv
            JOIN indicador_versiones v ON v.id = iv.version_id AND v.estado = 'aprobada'
            JOIN indicadores i ON i.id = v.indicador_id AND i.estado = 'activo' AND i.inicio_medicion IS NOT NULL
            WHERE iv.variable_compartida_id IS NOT NULL
          UNION
          SELECT variable_id FROM variable_valores WHERE estado = 'pendiente'
          ORDER BY id`
      ).map((f) => Number(f.id));
  const total = { abiertos: 0, quitados: 0 };
  for (const id of ids) {
    try {
      const r = await asegurarDe(sql, id, ahora);
      total.abiertos += r.abiertos;
      total.quitados += r.quitados;
    } catch (err) {
      console.error(`No se pudieron abrir los periodos del dato compartido ${id}:`, err);
    }
  }
  return total;
}

// ─────────────────────────────────────────────────────────────────────────────
// Lecturas
// ─────────────────────────────────────────────────────────────────────────────

function aPeriodo(f: Record<string, unknown>): PeriodoDeDato {
  return {
    id: Number(f.id),
    datoId: Number(f.variable_id),
    periodo: f.periodo as string,
    desde: f.desde as Date,
    hasta: f.hasta as Date,
    venceEn: f.vence_en as Date,
    estado: f.estado as PeriodoDeDato["estado"],
    valor: texto(f.valor),
    porCategoria: (f.por_categoria as Record<string, string> | null) ?? null,
    categorias: (f.categorias as CategoriaDeMedicion[] | null) ?? null,
    reporto: texto(f.reporto),
    reportadoEn: (f.reportado_en as Date | null) ?? null,
    corregido: f.corregido === true,
    // El alias calculado, no la columna cruda `se_pide`: un periodo reportado tiene la columna en verdadero.
    sePide: f.pedido === true,
  };
}

/** Los periodos del dato, del más reciente al más viejo; `null` si la persona no ve el dato: para ella no existe. */
export async function periodosDeDato(
  sesion: SujetoVisibilidad,
  datoId: number,
  opciones?: { sql?: Cliente },
): Promise<PeriodoDeDato[] | null> {
  const sql = opciones?.sql ?? obtenerSql();
  if (!Number.isInteger(datoId) || datoId <= 0 || !(await puedeVerDato(datoId, sesion, { sql }))) return null;
  const filas = await sql`SELECT vv.*, u.nombre AS reporto, ${periodoQueSePide(sql)} AS pedido
    FROM variable_valores vv LEFT JOIN usuarios u ON u.id = vv.reportado_por
    WHERE vv.variable_id = ${datoId}
    ORDER BY vv.desde DESC, vv.id DESC`;
  return filas.map(aPeriodo);
}

/** Un evento del historial de un periodo del dato: qué pasó, quién (`null` si fue el sistema), cuándo y su detalle. */
export type EventoDeDato = { tipo: string; quien: string | null; cuando: Date; detalle: Record<string, unknown> };

const aEvento = (f: Record<string, unknown>): EventoDeDato => ({
  tipo: f.tipo as string,
  quien: texto(f.nombre),
  cuando: f.creado_en as Date,
  detalle: (f.detalle as Record<string, unknown> | null) ?? {},
});

/**
 * El historial de un periodo del dato (anexo 14C, §4.7), en orden de llegada. `null` si el periodo no existe o la persona no
 * ve el dato.
 */
export async function historialDeDato(sesion: SujetoVisibilidad, periodoId: number, opciones?: { sql?: Cliente }): Promise<EventoDeDato[] | null> {
  const sql = opciones?.sql ?? obtenerSql();
  if (!Number.isInteger(periodoId) || periodoId <= 0) return null;
  const [p] = await sql`SELECT variable_id FROM variable_valores WHERE id = ${periodoId}`;
  if (!p || !(await puedeVerDato(Number(p.variable_id), sesion, { sql }))) return null;
  const filas = await sql`SELECT e.tipo, e.creado_en, e.detalle, u.nombre FROM variable_eventos e
    LEFT JOIN usuarios u ON u.id = e.usuario_id
    WHERE e.valor_id = ${periodoId}
    ORDER BY e.creado_en, e.id`;
  return filas.map(aEvento);
}

/** El historial de todos los periodos del dato en una lectura, por periodo (la página del dato); `null` si no lo ve. */
export async function historialesDeDato(
  sesion: SujetoVisibilidad,
  datoId: number,
  opciones?: { sql?: Cliente },
): Promise<Map<number, EventoDeDato[]> | null> {
  const sql = opciones?.sql ?? obtenerSql();
  if (!Number.isInteger(datoId) || datoId <= 0 || !(await puedeVerDato(datoId, sesion, { sql }))) return null;
  const filas = await sql`SELECT e.valor_id, e.tipo, e.creado_en, e.detalle, u.nombre FROM variable_eventos e
    JOIN variable_valores vv ON vv.id = e.valor_id
    LEFT JOIN usuarios u ON u.id = e.usuario_id
    WHERE vv.variable_id = ${datoId}
    ORDER BY e.creado_en, e.id`;
  const porPeriodo = new Map<number, EventoDeDato[]>();
  for (const f of filas) {
    const id = Number(f.valor_id);
    porPeriodo.set(id, [...(porPeriodo.get(id) ?? []), aEvento(f)]);
  }
  return porPeriodo;
}

// ─────────────────────────────────────────────────────────────────────────────
// Reportar y corregir
// ─────────────────────────────────────────────────────────────────────────────

export type PeriodoBloqueado = {
  id: number;
  datoId: number;
  nombre: string;
  periodo: string;
  desde: Date;
  estado: PeriodoDeDato["estado"];
  guardado: Guardado | null;
  categorias: CategoriaDeMedicion[] | null;
  captura: Omit<VariableDeCaptura, "letra" | "nombre">;
  sinMedidor: boolean;
};

/** El valor como se guarda y va en el historial: el total y, por categoría, cada uno. */
type Guardado = { valor: string; porCategoria?: Record<string, string> };

/**
 * El periodo con sus candados (el dato `FOR SHARE` y el periodo `FOR UPDATE`, en ese orden) y lo que exige tocarlo: quien
 * no ve el dato recibe «no existe»; quien lo ve y no puede reportarlo, `ErrorPermiso`. Lo usan también la subida y la quitada
 * de un soporte (`datos-soporte.ts`).
 */
export async function periodoBloqueado(tx: TransactionSql, sesion: SujetoVisibilidad, periodoId: number): Promise<PeriodoBloqueado> {
  if (!Number.isInteger(periodoId) || periodoId <= 0) throw new ErrorIndicador(PERIODO_NO_EXISTE);
  const [d] = await tx`SELECT id, nombre, captura_min, captura_max, admite_negativos FROM variables_compartidas
    WHERE id = (SELECT variable_id FROM variable_valores WHERE id = ${periodoId}) FOR SHARE`;
  const [p] = await tx`SELECT * FROM variable_valores WHERE id = ${periodoId} FOR UPDATE`;
  if (!d || !p || Number(p.variable_id) !== Number(d.id) || !(await puedeVerDato(Number(d.id), sesion, { sql: tx }))) {
    throw new ErrorIndicador(PERIODO_NO_EXISTE);
  }
  const capacidad = await puedeReportarDato(Number(d.id), sesion, { sql: tx });
  if (!capacidad.puede) throw new ErrorPermiso();
  const porCategoria = (p.por_categoria as Record<string, string> | null) ?? null;
  return {
    id: Number(p.id),
    datoId: Number(d.id),
    nombre: d.nombre as string,
    periodo: p.periodo as string,
    desde: p.desde as Date,
    estado: p.estado as PeriodoDeDato["estado"],
    guardado:
      p.valor === null ? null : { valor: normal(String(p.valor)), ...(porCategoria ? { porCategoria: normales(porCategoria) } : {}) },
    categorias: (p.categorias as CategoriaDeMedicion[] | null) ?? null,
    captura: { capturaMin: texto(d.captura_min), capturaMax: texto(d.captura_max), admiteNegativos: d.admite_negativos === true },
    sinMedidor: capacidad.sinMedidor,
  };
}

const normal = (t: string) => valorEnTexto(fraccion(t)!);
const normales = (r: Record<string, string>) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, normal(v)]));

/** Un valor digitado, con las validaciones de una variable (spec §7.4); vacío, «falta». */
function leer(textoDigitado: string, v: VariableDeCaptura): Fraccion {
  const r = leerValor(textoDigitado, v);
  if (!r.ok) throw new ErrorIndicador(r.error);
  if (r.valor === null) throw new ErrorIndicador(`Falta el valor de «${v.nombre}»`);
  return r.valor;
}

/**
 * Lo que la persona reporta: un valor o, si el periodo pide categorías, uno por cada una de su lista (ni más ni menos) y su
 * suma como total.
 */
function leerReporte(p: PeriodoBloqueado, d: { valor?: string; porCategoria?: Record<string, string> }): { total: Fraccion; guardado: Guardado } {
  const porCategoria = d.porCategoria ?? {};
  const captura = (nombre: string): VariableDeCaptura => ({ letra: "A", nombre, ...p.captura });
  if (p.categorias === null) {
    if (Object.keys(porCategoria).length > 0) throw new ErrorIndicador(FORMULARIO_CAMBIO);
    const total = leer(d.valor ?? "", captura(p.nombre));
    return { total, guardado: { valor: valorEnTexto(total) } };
  }
  const pedidas = new Set(p.categorias.map((c) => String(c.id)));
  if ((d.valor ?? "").trim() !== "" || Object.keys(porCategoria).some((id) => !pedidas.has(id))) throw new ErrorIndicador(FORMULARIO_CAMBIO);
  let total = CERO;
  const guardado: Record<string, string> = {};
  for (const c of p.categorias) {
    const v = leer(porCategoria[String(c.id)] ?? "", captura(c.nombre));
    total = sumar(total, v);
    guardado[String(c.id)] = valorEnTexto(v);
  }
  return { total, guardado: { valor: valorEnTexto(total), porCategoria: guardado } };
}

/** Dos valores guardados son el mismo: el total y el de cada categoría. */
const mismo = (a: Guardado, b: Guardado) =>
  a.valor === b.valor &&
  JSON.stringify(Object.entries(a.porCategoria ?? {}).sort()) === JSON.stringify(Object.entries(b.porCategoria ?? {}).sort());

/**
 * La confirmación que pide un valor que se aleja del periodo anterior con valor más que `ind_variacion_confirmar_pct`: «El
 * valor sube 1000 frente a septiembre de 2026. ¿Es correcto?». Un mes o un año van sin artículo; los demás, con «al».
 */
async function confirmacion(tx: TransactionSql, p: PeriodoBloqueado, total: Fraccion): Promise<string | null> {
  const [a] = await tx`SELECT periodo, valor FROM variable_valores
    WHERE variable_id = ${p.datoId} AND hasta < ${p.desde} AND valor IS NOT NULL
    ORDER BY hasta DESC LIMIT 1`;
  if (!a) return null;
  const anterior = fraccion(String(a.valor))!;
  const { variacionConfirmarPct } = await obtenerParametros({ sql: tx });
  if (!variacionExcesiva(total, anterior, variacionConfirmarPct)) return null;
  const clave = a.periodo as string;
  const etiqueta = periodoDe(clave, zonaHoraria())?.etiqueta ?? clave;
  const periodicidad = periodicidadDe(clave);
  const frente = periodicidad === "mensual" || periodicidad === "anual" || periodicidad === null ? `a ${etiqueta}` : `al ${etiqueta}`;
  const diferencia = restar(total, anterior);
  const cuanto = numeroExacto(esNegativa(diferencia) ? restar(CERO, diferencia) : diferencia, 0);
  return `El valor ${comparar(total, anterior) > 0 ? "sube" : "baja"} ${cuanto} frente ${frente}. ¿Es correcto?`;
}

/**
 * Reporta un periodo pendiente del dato o lo corrige si ya estaba reportado (anexo 14C, §4.4): el permiso
 * `indicadores.medir` más `puedeReportarDato`, dentro de la transacción con el periodo bloqueado. Valida como una variable
 * (límites de captura, negativos, cuatro decimales) y, sin `confirmado`, no escribe nada y pide confirmar un valor que se
 * aleja del periodo anterior. Un periodo cerrado no se toca: lo reabre el Administrador del SGC. El primer reporte deja
 * quién y cuándo y el evento `reporte`; una corrección (sin justificación) deja el evento `correccion` con el antes y el
 * después y marca el periodo corregido; el mismo valor otra vez no es una corrección. Sin responsable ni líder activos
 * (`sinMedidor`), el evento lo marca (`sinResponsable`).
 */
export async function reportarDato(
  sesion: SesionFlujo,
  d: { periodoId: number; valor?: string; porCategoria?: Record<string, string>; confirmado?: boolean },
  opciones?: Opciones,
): Promise<{ ok: true; corregido: boolean } | { ok: false; confirmar: string }> {
  if (!puede(sesion, "indicadores.medir")) throw new ErrorPermiso();
  const ahora = opciones?.ahora ?? new Date();
  return enTransaccion(opciones?.sql ?? obtenerSql(), async (tx) => {
    const p = await periodoBloqueado(tx, sesion, d.periodoId);
    if (p.estado === "cerrado") throw new ErrorIndicador(CERRADO);
    const { total, guardado } = leerReporte(p, d);
    const antes = p.estado === "reportado" ? p.guardado : null;
    if (antes && mismo(antes, guardado)) throw new ErrorIndicador(SIN_CAMBIOS);
    if (d.confirmado !== true) {
      const confirmar = await confirmacion(tx, p, total);
      if (confirmar) return { ok: false as const, confirmar };
    }

    const porCategoria = guardado.porCategoria ? tx.json(guardado.porCategoria) : null;
    const marca = p.sinMedidor ? { sinResponsable: true as const } : {};
    if (antes) {
      await tx`UPDATE variable_valores SET valor = ${guardado.valor}, por_categoria = ${porCategoria}, corregido = true WHERE id = ${p.id}`;
    } else {
      await tx`UPDATE variable_valores SET estado = 'reportado', valor = ${guardado.valor}, por_categoria = ${porCategoria},
          reportado_por = ${sesion.usuarioId}, reportado_en = ${ahora}
        WHERE id = ${p.id}`;
    }
    const detalle = antes ? { antes, despues: guardado, ...marca } : { ...guardado, ...marca };
    await tx`INSERT INTO variable_eventos (valor_id, tipo, usuario_id, detalle, creado_en)
      VALUES (${p.id}, ${antes ? "correccion" : "reporte"}, ${sesion.usuarioId}, ${tx.json(detalle)}, ${ahora})`;
    const base = { nombre: p.nombre, periodo: p.periodo, periodoId: p.id };
    await registrarAuditoria(tx, {
      usuarioId: sesion.usuarioId,
      accion: antes ? "dato_corregido" : "dato_reportado",
      entidad: "dato_compartido",
      entidadId: p.datoId,
      detalle: antes ? { ...base, antes: antes.valor, despues: guardado.valor, ...marca } : { ...base, valor: guardado.valor, ...marca },
    });
    return { ok: true as const, corregido: antes !== null };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// La tarea
// ─────────────────────────────────────────────────────────────────────────────

/**
 * «Reportar el dato Total facturado en el mes, noviembre de 2026»: una tarea por periodo que se pide del dato, para quien
 * está en `responsablesDeDato` (`responsabilidadEnDato`: sus responsables; sin ellos, los líderes del proceso dueño; sin
 * ellos, el Admin SGC, con «sin responsable»), con su fecha límite y el enlace a la página del dato. Solo lee.
 */
export async function tareasDeDatos(sql: Cliente, sesion: SujetoVisibilidad): Promise<Tarea[]> {
  if (!puede(sesion, "indicadores.medir")) return [];
  const filas = await sql`SELECT * FROM (
      SELECT vv.id, vv.variable_id, vv.periodo, vv.vence_en, d.nombre, p.nombre AS proceso,
        ${responsabilidadEnDato(sql, sesion)} AS responde
      FROM variable_valores vv JOIN variables_compartidas d ON d.id = vv.variable_id JOIN procesos p ON p.id = d.proceso_id
      WHERE ${periodoQueSePide(sql)}
    ) x
    WHERE x.responde IS NOT NULL
    ORDER BY x.vence_en, x.id`;
  const zona = zonaHoraria();
  return filas.map((f) => ({
    id: `dato:${Number(f.id)}`,
    modulo: "indicadores" as const,
    titulo: `Reportar el dato ${f.nombre as string}, ${periodoDe(f.periodo as string, zona)?.etiqueta ?? (f.periodo as string)}`,
    detalle: f.responde === "respaldo" ? SIN_RESPONSABLE : (f.proceso as string),
    vence: new Date(f.vence_en as string),
    enlace: `/indicadores/datos/${Number(f.variable_id)}`,
  }));
}
