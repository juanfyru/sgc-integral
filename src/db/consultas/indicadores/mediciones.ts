/**
 * Las mediciones de un indicador (spec 14 §8, Tarea 9 de la 14A): abrir los periodos terminados, el único camino de
 * cálculo (`recalcularMedicion`), reportar, guardar sin reportar, «no aplica» y corregir antes del cierre. Las lecturas
 * (la pantalla de reporte, la tabla del año, la lista, la matriz) viven en `lectura.ts`, que importa de aquí.
 *
 * Candados de toda escritura: el indicador `FOR SHARE` (y se vuelve a exigir que esté activo: hay carrera con
 * `retirar`), después la medición `FOR UPDATE` y por último sus filas hijas: los triggers de la 0011 leen la medición con
 * `FOR SHARE`, y escribir hijas antes de bloquearla interbloquea dos pestañas (40P01).
 *
 * «Reportada» es un hecho guardado (`reportada_en`): «Guardar sin reportar» conserva lo digitado sin calcular aunque esté
 * completo. Los valores se leen por la letra de la variable en la versión que rige: un cambio menor da otros ids a las
 * mismas letras.
 *
 * Quién pone cada variable (anexo 14C, §3.1): la persona digita las propias; las ajenas (un dato compartido o el resultado
 * de otro indicador) las copia el sistema, y la persona no las digita ni las borra. En un histórico se digitan todas
 * (§3.6). Reportar lo propio pone `reportada_en` aunque falte lo ajeno: la medición queda en «Falta un dato» y el resultado
 * sale cuando llega. Un indicador sin variables propias no lo mide nadie (`mide`), como un automático.
 *
 * Una medición desagregada (anexo 14C, §5) guarda su lista de categorías (`categorias`), que se fija al abrirla con el maestro
 * leído con candado; una histórica no la lleva (se digita el total, §3.6). Se reporta una rejilla: una celda por categoría y
 * variable (`medicion_valores` con `categoria_id`), y el «No aplica» de cada fila vive en la lista. El total de cada letra, la
 * fila sin categoría, lo escribe solo el sistema (`escribirTotal`, sin usuario) al reportar o al propagar; la persona nunca lo
 * digita ni lo borra. Con él calcula `recalcularMedicion`, como en cualquier indicador.
 */
import type { TransactionSql } from "postgres";
import { obtenerSql, type Cliente } from "@/db/cliente";
import { registrarAuditoria } from "@/db/consultas/admin";
import { enTransaccion, type SesionFlujo } from "@/db/consultas/flujo/contrato";
import { puedeMedir, puedeVerIndicador, type Capacidad, type SujetoVisibilidad } from "@/lib/alcance";
import { periodoDe, type Periodo } from "@/lib/indicadores-documentales/periodo";
import { calcular, variacionExcesiva, type FichaDeCalculo } from "@/lib/indicadores/calculo";
import { estadoDeFila, listaDelPeriodo, resultadoDeCategoria, totalDeCategorias, type CategoriaDeMedicion } from "@/lib/indicadores/categorias";
import { analisisCompleto, analisisExigido, cumpleDeFila, esRepetido } from "@/lib/indicadores/estados";
import { aDecimal, aTexto, comparar, deTexto, fraccion, type Fraccion } from "@/lib/indicadores/formula/fraccion";
import { alguienMide, esAjena, letrasAjenas } from "@/lib/indicadores/origen";
import { laFuenteMueveElPlazo } from "@/lib/indicadores/propagacion";
import {
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
  leerValor,
  leerValores,
  reglaDeTexto,
  valorEnTexto,
  type CalculoEnTexto,
  type ReglaEnTexto,
} from "@/lib/indicadores/reporte";
import type { RangosEnTexto } from "@/lib/indicadores/rangos";
import { limiteDeCritico, type Regla } from "@/lib/indicadores/semaforo";
import { fraseDeVariacion, textoValor, type Unidad } from "@/lib/indicadores/textos";
import {
  ErrorIndicador,
  MOTIVO_TODAS_NO_APLICAN,
  MOTIVOS_DEL_SISTEMA,
  type Consolidacion,
  type EstadoMedicion,
  type ModoSemaforo,
  type OrigenDato,
  type OrigenVariable,
  type Periodicidad,
  type Semaforo,
  type Tendencia,
  type TipoEvento,
  type Toma,
} from "@/lib/indicadores/tipos";
import { ErrorPermiso, puede } from "@/lib/permisos";
import { zonaHoraria } from "@/lib/zona-horaria";
import { alRecalcular } from "./alertas";
import { maestroDeCategorias } from "./dimensiones";
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
/** Nadie mide un automático (anexo 14B, §4): lo que digita rechaza la medición cuya versión que rige el periodo lo es. */
export const NO_SE_DIGITA = "Este indicador lo calcula el sistema: sus datos no se digitan";
/** Ni un indicador sin variables propias (anexo 14C, §3.1): sus datos llegan de datos compartidos o de otros indicadores. */
export const NADIE_LO_MIDE = "Este indicador no tiene datos propios: nadie lo digita";
/** El valor de una variable ajena no se digita: lo pone el sistema (anexo 14C, §3.1). */
export const noSeDigitaDesdeAqui = (nombre: string) => `«${nombre}» no se digita desde aquí: llega de otra fuente`;
/**
 * Lo mismo para cualquier variable ajena: la tomada de otro indicador se dice por su letra, porque su nombre puede nombrar a
 * un componente que quien reporta no ve (anexo 14C, §6.5).
 */
const noSeDigita = (v: { letra: string; nombre: string; origen: string }) =>
  v.origen === "indicador" ? `La variable ${v.letra} no se digita desde aquí: llega de otro indicador` : noSeDigitaDesdeAqui(v.nombre);
/** Un motivo de «no aplica» que es el de uno que pone el sistema (`motivoValido`). */
export const MOTIVO_RESERVADO = "Ese motivo lo usa el sistema: escriba el suyo con otras palabras";
/** El «No aplica» que puso el sistema no lo quita una persona: lo quita la propagación cuando deja de ser cierto (`quitarNoAplica`). */
export const NO_APLICA_DEL_SISTEMA = "Este «No aplica» lo puso el sistema: se quita solo cuando cambie el dato";
/** Reportar una rejilla exige todas sus filas completas, «Sin casos» o «No aplica» (anexo 14C, §5.4). */
export const faltanCategorias = (nombres: readonly string[]) => `Faltan categorías por completar: ${nombres.join(", ")}`;
/** Una medición desagregada que nació sin categorías (ninguna existía en su periodo): no se reporta vacía. */
const SIN_CATEGORIAS = "Esta medición no tiene categorías: pida al Administrador del SGC que las actualice";

/**
 * Una medición abierta de la periodicidad vieja que quedó dentro del tramo de un cambio mayor de periodicidad (los meses
 * de un trimestre que ahora rige una ficha trimestral) no se mide ni se calcula con una ficha que no es la suya.
 */
export const esDeOtraPeriodicidad = (periodo: string, version: { periodicidad: Periodicidad | null }) =>
  periodicidadDe(periodo) !== version.periodicidad;

/** Un valor de una fila en texto, o `null`. */
export const texto = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));
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
  /** Cómo se junta en el acumulado del año (spec §8.10). */
  consolidacion: Consolidacion;
  /** Quién la pone (anexo 14C, §3.1): la persona (`propia`), un dato compartido, otro indicador o el cálculo del sistema. */
  origen: OrigenVariable;
  /** El dato compartido que cita y la periodicidad firmada del dato; `null` si no es un dato. */
  datoId: number | null;
  datoPeriodicidad: Periodicidad | null;
  /** El indicador del que sale y lo que toma de él; `null` si no sale de otro indicador. */
  indicadorOrigenId: number | null;
  toma: Toma | null;
};

export type VersionDeCalculo = {
  id: number;
  numero: number;
  tipoCambio: string;
  rigeDesde: string | null;
  aprobadaEn: Date | null;
  periodicidad: Periodicidad | null;
  nombre: string | null;
  /** De dónde sale el dato (anexo 14B, §5.3): lo digita una persona o lo calcula el sistema. */
  origenDato: OrigenDato;
  /**
   * El cálculo que hace el sistema y su alcance, en una versión automática; `null` en una manual. No se llama `calculo`:
   * ese nombre ya es el de la fórmula y sus letras.
   */
  calculoAutomatico: { clave: string; alcance: string } | null;
  calculo: CalculoEnTexto;
  /** La regla de la ficha; la meta programada del periodo la reemplaza (`reglaDelPeriodo`). */
  regla: ReglaEnTexto;
  unidad: Unidad;
  variables: VariableDeVersion[];
  /** La dimensión por la que se desagrega (anexo 14C, §5.2) y el nombre con que se firmó; `null` sin desagregación. */
  dimensionId: number | null;
  dimensionNombre: string | null;
};

/** ¿Alguien digita algo en esta versión? Una ficha manual con alguna variable propia (anexo 14C, §3.1; `alguienMide`). */
export const mide = (v: VersionDeCalculo): boolean => alguienMide(v);

/** Las letras ajenas de la versión que aún no tienen valor en la medición. */
const faltanAjenas = (v: VersionDeCalculo, valores: Readonly<Record<string, Fraccion>>) => letrasAjenas(v.variables).some((l) => !valores[l]);

/**
 * Las variables que la persona digita en la medición: en un histórico, todas, también las ajenas (anexo 14C, §3.6: la
 * historia no se propaga); si no, solo las propias.
 */
const variablesQueDigita = (v: VersionDeCalculo, historica: boolean): VariableDeVersion[] =>
  historica ? v.variables : v.variables.filter((x) => x.origen === "propia");

/** Las versiones aprobadas del indicador, de mayor a menor número (el orden de `versionQueRigeEntre`). */
export async function versionesAprobadas(sql: Cliente, indicadorId: number): Promise<VersionDeCalculo[]> {
  return (await versionesAprobadasDe(sql, [indicadorId])).get(indicadorId) ?? [];
}

/**
 * Las versiones aprobadas de varios indicadores en dos lecturas (la lista y la matriz), por indicador y de mayor a menor
 * número. Un indicador sin versión aprobada no aparece.
 */
export async function versionesAprobadasDe(sql: Cliente, indicadorIds: readonly number[]): Promise<Map<number, VersionDeCalculo[]>> {
  const salida = new Map<number, VersionDeCalculo[]>();
  if (indicadorIds.length === 0) return salida;
  const filas = await sql`SELECT id, indicador_id, numero, tipo_cambio, rige_desde, aprobada_en, periodicidad, nombre, origen_dato, calculo,
      calculo_alcance, formula, resultado_min, resultado_max, tendencia, meta, meta_max, semaforo_modo, umbral_atencion_pct, limite_critico,
      tolerancia, rangos, unidad_sufijo, decimales, dimension_id, dimension_nombre
    FROM indicador_versiones WHERE indicador_id IN ${sql([...new Set(indicadorIds)])} AND estado = 'aprobada'
    ORDER BY indicador_id, numero DESC`;
  if (filas.length === 0) return salida;
  const variables = await sql`SELECT id, version_id, letra, nombre, descripcion, fuente, captura_min, captura_max, admite_negativos, consolidacion,
      origen, variable_compartida_id, dato_periodicidad, indicador_origen_id, toma
    FROM indicador_variables WHERE version_id IN ${sql(filas.map((f) => Number(f.id)))} ORDER BY orden, letra`;
  const porVersion = new Map<number, (typeof variables)[number][]>();
  for (const v of variables) {
    const lista = porVersion.get(Number(v.version_id));
    if (lista) lista.push(v);
    else porVersion.set(Number(v.version_id), [v]);
  }
  for (const f of filas) {
    const deLaVersion = (porVersion.get(Number(f.id)) ?? [])
      .map((v) => ({
        id: Number(v.id),
        letra: v.letra as string,
        nombre: (v.nombre as string | null) ?? (v.letra as string),
        descripcion: texto(v.descripcion),
        fuente: texto(v.fuente),
        capturaMin: texto(v.captura_min),
        capturaMax: texto(v.captura_max),
        admiteNegativos: v.admite_negativos === true,
        consolidacion: ((v.consolidacion as Consolidacion | null) ?? "suma") as Consolidacion,
        origen: ((v.origen as OrigenVariable | null) ?? "propia") as OrigenVariable,
        datoId: v.variable_compartida_id === null ? null : Number(v.variable_compartida_id),
        datoPeriodicidad: (v.dato_periodicidad as Periodicidad | null) ?? null,
        indicadorOrigenId: v.indicador_origen_id === null ? null : Number(v.indicador_origen_id),
        toma: (v.toma as Toma | null) ?? null,
      }));
    const version: VersionDeCalculo = {
      id: Number(f.id),
      numero: Number(f.numero),
      tipoCambio: f.tipo_cambio as string,
      rigeDesde: texto(f.rige_desde),
      aprobadaEn: f.aprobada_en ? new Date(f.aprobada_en as string) : null,
      periodicidad: (f.periodicidad as Periodicidad | null) ?? null,
      nombre: texto(f.nombre),
      origenDato: f.origen_dato === "automatico" ? "automatico" : "manual",
      calculoAutomatico:
        f.origen_dato === "automatico" && f.calculo !== null && f.calculo_alcance !== null
          ? { clave: f.calculo as string, alcance: f.calculo_alcance as string }
          : null,
      calculo: {
        formula: (f.formula as string | null) ?? "",
        letras: deLaVersion.map((v) => v.letra),
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
        rangos: (f.rangos as RangosEnTexto | null) ?? null,
      },
      unidad: { sufijo: (f.unidad_sufijo as string | null) ?? "", decimales: f.decimales === null ? 0 : Number(f.decimales) },
      variables: deLaVersion,
      dimensionId: f.dimension_id === null ? null : Number(f.dimension_id),
      dimensionNombre: texto(f.dimension_nombre),
    };
    const id = Number(f.indicador_id);
    salida.set(id, [...(salida.get(id) ?? []), version]);
  }
  return salida;
}

/**
 * La versión aprobada que rige el periodo `periodo` del indicador (`versionQueRigeEntre`), o `null`: la que dice si una
 * medición es automática (anexo 14B, §4), no la ficha vigente.
 */
export async function versionDelPeriodo(sql: Cliente, indicadorId: number, periodo: string): Promise<VersionDeCalculo | null> {
  const zona = zonaHoraria();
  const p = periodoDe(periodo, zona);
  return p ? versionQueRigeEntre(await versionesAprobadas(sql, indicadorId), p, zona) : null;
}

/**
 * La regla con que se muestra el resultado de una medición leída junto con su meta programada (la columna `programada`,
 * `{ meta, metaMax }` en texto, de `indicador_metas`): la meta congelada en la medición; si no la tiene, la programada del
 * periodo si la versión que lo rige tiene meta (como `reglaDelPeriodo`); si no, la de esa versión. Con ella `textoValor`
 * redondea sin contradecir el semáforo. La usan la lista y la página «Objetivos».
 */
export function reglaMostrada(m: Record<string, unknown>, v: VersionDeCalculo): Regla {
  const programada = m.programada as { meta: string | null; metaMax: string | null } | null;
  return reglaDeTexto(
    m.meta_aplicada !== null
      ? { ...v.regla, meta: texto(m.meta_aplicada), metaMax: texto(m.meta_max_aplicada) }
      : programada && v.regla.meta !== null
        ? { ...v.regla, meta: programada.meta, metaMax: programada.metaMax }
        : v.regla,
  );
}

/** La meta programada del periodo (spec §8.9) reemplaza la de la ficha, si la versión que calcula tiene meta. */
export async function reglaDelPeriodo(sql: Cliente, indicadorId: number, periodo: string, v: VersionDeCalculo): Promise<ReglaEnTexto> {
  const [p] = await sql`SELECT meta, meta_max FROM indicador_metas WHERE indicador_id = ${indicadorId} AND periodo = ${periodo}`;
  return p && v.regla.meta !== null ? { ...v.regla, meta: texto(p.meta), metaMax: texto(p.meta_max) } : v.regla;
}

/** La primera versión aprobada: con su aprobación, lo que terminó antes es histórico (spec §8.8). */
export function primeraAprobada(versiones: readonly VersionDeCalculo[]): VersionDeCalculo | null {
  return versiones.find((v) => v.tipoCambio === "inicial") ?? versiones[versiones.length - 1] ?? null;
}

export type Tramo = { desde: number; hasta: number; version: VersionDeCalculo; periodicidad: Periodicidad; primero: Periodo };

const despuesDe = (p: Periodicidad, periodo: Periodo, zona: string) => periodoQueContiene(p, new Date(periodo.hasta.getTime() + 1), zona);

/**
 * Desde el inicio de medición, un tramo por cada «rige desde» posterior: en cada uno rige una versión, con su
 * periodicidad, hasta donde empieza el siguiente. El primer periodo de un tramo es el primero de esa periodicidad que
 * empieza con el tramo o después.
 */
export function tramos(versiones: readonly VersionDeCalculo[], inicio: string, zona: string): Tramo[] {
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
 * hacia la medición: quitarla dejaría la evidencia huérfana), o que cita un hallazgo de mejoramiento (su llave foránea
 * impediría quitarla con un `23503`). Una sola definición para retirar, cambiar el inicio y aprobar un cambio de
 * periodicidad.
 */
export const conDatos = (sql: Cliente) => sql`(m.estado <> 'abierta' OR m.no_aplica
  OR coalesce(btrim(m.analisis), '') <> '' OR coalesce(btrim(m.causa), '') <> '' OR coalesce(btrim(m.accion_propuesta), '') <> ''
  OR EXISTS (SELECT 1 FROM medicion_valores mv WHERE mv.medicion_id = m.id)
  OR EXISTS (SELECT 1 FROM medicion_eventos me WHERE me.medicion_id = m.id)
  OR EXISTS (SELECT 1 FROM medicion_observaciones mo WHERE mo.medicion_id = m.id)
  OR EXISTS (SELECT 1 FROM archivos ar WHERE ar.contexto = 'medicion' AND ar.contexto_id = m.id)
  OR EXISTS (SELECT 1 FROM mejora_hallazgos mh WHERE mh.medicion_id = m.id))`;

/**
 * Un hallazgo de mejoramiento cita al indicador (alias `i`): como su indicador, por una de sus mediciones o como el
 * indicador de eficacia de una ronda (spec 15 §19.4). Sus llaves foráneas impedirían borrarlo con un `23503`: lo comparten
 * deshacer un lote de importación y borrar un borrador.
 */
export const citadoEnMejoramiento = (sql: Cliente) => sql`(
  EXISTS (SELECT 1 FROM mejora_hallazgos mh WHERE mh.indicador_id = i.id)
  OR EXISTS (SELECT 1 FROM mejora_hallazgos mh JOIN mediciones mhm ON mhm.id = mh.medicion_id WHERE mhm.indicador_id = i.id)
  OR EXISTS (SELECT 1 FROM mejora_rondas mr WHERE mr.indicador_eficacia_id = i.id))`;

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
 * antes de aprobarse la primera versión (§8.8). Devuelve cuántas creó. Con `indicadorId` abre solo ese; con `indicadorIds`,
 * solo esos, y uno que falla no impide los demás.
 */
export async function asegurarMediciones(opciones?: { sql?: Cliente; ahora?: Date; indicadorId?: number; indicadorIds?: number[] }): Promise<number> {
  const sql = opciones?.sql ?? obtenerSql();
  const ahora = opciones?.ahora ?? new Date();
  if (opciones?.indicadorIds) {
    // Solo los indicadores que la lectura va a mostrar, cada uno en su transacción: uno que falla se registra y se salta.
    let abiertas = 0;
    for (const id of opciones.indicadorIds) {
      try {
        abiertas += await abrirPeriodos(sql, id, ahora);
      } catch (error) {
        console.error(`No se pudieron abrir los periodos del indicador ${id}:`, error);
      }
    }
    return abiertas;
  }
  const ids =
    opciones?.indicadorId !== undefined
      ? [opciones.indicadorId]
      : (await sql`SELECT id FROM indicadores WHERE estado = 'activo' AND inicio_medicion IS NOT NULL ORDER BY id`).map((f) => Number(f.id));
  let creadas = 0;
  for (const id of ids) creadas += await abrirPeriodos(sql, id, ahora);
  return creadas;
}

/**
 * Un indicador en su transacción, tomado `FOR SHARE` con el estado releído: no abre nada en uno que se acaba de retirar. Una
 * medición ordinaria cuya versión que rige se desagrega nace con su lista de categorías (`listaDelPeriodo`, anexo 14C §5.3),
 * del maestro leído `FOR KEY SHARE` en esta misma transacción (`maestroDeCategorias`: el `jsonb` no tiene llave foránea y
 * `borrarCategoria` espera a que la lista quede guardada). Una histórica no lleva lista: se digita el total (§3.6).
 *
 * Mientras el indicador exige soporte, la ordinaria nace debiéndolo (`debe_soporte`, anexo del complemento de la 14C §4.2),
 * con «soporte obligatorio» leído bajo el mismo candado que `cambiarOperacion` toma `FOR UPDATE` para cambiarlo; una
 * histórica nunca.
 */
function abrirPeriodos(sql: Cliente, indicadorId: number, ahora: Date): Promise<number> {
  return enTransaccion(sql, async (tx) => {
    const [i] = await tx`SELECT inicio_medicion, plazo_reporte_dias, soporte_obligatorio FROM indicadores
      WHERE id = ${indicadorId} AND estado = 'activo' FOR SHARE`;
    if (!i?.inicio_medicion) return 0;
    const zona = zonaHoraria();
    const versiones = await versionesAprobadas(tx, indicadorId);
    const aprobada = primeraAprobada(versiones)?.aprobadaEn ?? null;
    const existentes = new Set((await tx`SELECT periodo FROM mediciones WHERE indicador_id = ${indicadorId}`).map((f) => f.periodo as string));
    const nuevos: { periodo: Periodo; version: VersionDeCalculo; historica: boolean }[] = [];
    for (const t of tramos(versiones, i.inicio_medicion as string, zona)) {
      for (const periodo of periodosTerminados(t.periodicidad, t.primero.clave, ahora, zona)) {
        if (periodo.desde.getTime() >= t.hasta) break;
        if (existentes.has(periodo.clave)) continue;
        const historica = aprobada !== null && periodo.hasta.getTime() < aprobada.getTime();
        nuevos.push({ periodo, version: versionQueRigeEntre(versiones, periodo, zona)!, historica });
      }
    }
    if (nuevos.length === 0) return 0;
    const listas = await listasDeCategorias(tx, nuevos.map((n) => ({ dimensionId: n.historica ? null : n.version.dimensionId, periodo: n.periodo })));
    const plazo = Number(i.plazo_reporte_dias);
    const conSoporte = i.soporte_obligatorio === true;
    const iso = (d: Date) => d.toISOString();
    const creadas = await tx`INSERT INTO mediciones (indicador_id, version_id, periodo, desde, hasta, vence_en, historica, categorias, debe_soporte)
      SELECT ${indicadorId}, x.version_id, x.periodo, x.desde, x.hasta, x.vence_en, x.historica, x.categorias::jsonb, x.debe_soporte
      FROM unnest(
        ${tx.array(nuevos.map((n) => n.version.id))}::bigint[],
        ${tx.array(nuevos.map((n) => n.periodo.clave))}::text[],
        ${tx.array(nuevos.map((n) => iso(n.periodo.desde)))}::timestamptz[],
        ${tx.array(nuevos.map((n) => iso(n.periodo.hasta)))}::timestamptz[],
        ${tx.array(nuevos.map((n) => iso(fechaLimiteDeReporte(n.periodo, plazo, zona))))}::timestamptz[],
        ${tx.array(nuevos.map((n) => n.historica))}::boolean[],
        ${tx.array(listas.map((l) => (l === null ? null : JSON.stringify(l))) as string[])}::text[],
        ${tx.array(nuevos.map((n) => conSoporte && !n.historica))}::boolean[]
      ) AS x(version_id, periodo, desde, hasta, vence_en, historica, categorias, debe_soporte)
      ON CONFLICT (indicador_id, periodo) DO NOTHING
      RETURNING id`;
    return creadas.length;
  });
}

/**
 * La lista de categorías de cada periodo pedido (`null` sin dimensión), con el maestro de cada dimensión leído una vez y
 * `FOR KEY SHARE`, dentro de la transacción que guarda la lista.
 */
export async function listasDeCategorias(
  tx: TransactionSql,
  pedidos: readonly { dimensionId: number | null; periodo: Periodo }[],
): Promise<(CategoriaDeMedicion[] | null)[]> {
  const maestros = new Map<number, Awaited<ReturnType<typeof maestroDeCategorias>>>();
  const salida: (CategoriaDeMedicion[] | null)[] = [];
  for (const p of pedidos) {
    if (p.dimensionId === null) {
      salida.push(null);
      continue;
    }
    if (!maestros.has(p.dimensionId)) maestros.set(p.dimensionId, await maestroDeCategorias(tx, p.dimensionId, { bloquear: true }));
    salida.push(listaDelPeriodo(maestros.get(p.dimensionId)!, p.periodo));
  }
  return salida;
}

// ─────────────────────────────────────────────────────────────────────────────
// El cálculo único
// ─────────────────────────────────────────────────────────────────────────────

export type Recalculo = {
  medicionId: number;
  indicadorId: number;
  antes: Semaforo | null;
  despues: Semaforo | null;
  /** Si cumplía antes (`cumpleDeFila`: una fila anterior a la 0012 se lee por su semáforo). */
  cumpleAntes: boolean | null;
  /** Si el resultado alcanza la meta (spec 14A §3.1); `null` sin resultado o sin meta. */
  cumple: boolean | null;
  estado: EstadoMedicion;
  resultado: Fraccion | null;
  repetido: boolean;
  historica: boolean;
  /** Algo cambió (y quedó el evento); `false` si todo quedó como estaba. */
  cambio: boolean;
  /**
   * En una medición desagregada (anexo 14C, §5.6), cuántas categorías quedan en Crítico y cuántas había (`categorias_en_critico`)
   * y cuáles, con su cifra; `null` y vacía si no se desagrega.
   */
  enCritico: number | null;
  enCriticoAntes: number | null;
  criticas: { nombre: string; resultado: string }[];
};

/** Los soportes de la medición: filas de `archivos` con contexto `medicion`. */
export async function contarSoportes(sql: Cliente, medicionId: number): Promise<number> {
  const [f] = await sql`SELECT count(*)::int AS n FROM archivos WHERE contexto = 'medicion' AND contexto_id = ${medicionId}`;
  return Number(f.n);
}

/**
 * ¿La medición debe su soporte obligatorio? (anexo del complemento de la 14C, §4.2): el indicador lo exige y la medición quedó
 * marcada (`debe_soporte`), salvo la histórica, la «No aplica» y la de una versión que nadie mide (un automático o sin
 * variables propias: nadie podría adjuntarlo). `debe_soporte` se decide una vez, al nacer la medición (`abrirPeriodos`) o al
 * activarse el soporte (`recalcularPorSoporte`), y nada más lo cambia: ni el plazo, ni una fuente que llega, ni la racha, ni
 * un análisis, ni una corrección. Es la regla única de `recalcularMedicion` y del rechazo de un reporte sin soporte.
 */
export const seDebeElSoporte = (d: { soporteObligatorio: boolean; marcada: boolean; historica: boolean; noAplica: boolean; mide: boolean }): boolean =>
  d.soporteObligatorio && d.marcada && !d.historica && !d.noAplica && d.mide;

/**
 * Una fila de `medicion_valores` con la letra y el origen de su variable, la que leen `valoresPorLetra` y `elegirValores`;
 * `valor_exacto` es la fracción («n/d») que el sistema guarda cuando el valor no cabe en cuatro decimales (anexo 14C, §3.2).
 */
export type ValorGuardado = {
  variable_id: unknown;
  letra: unknown;
  origen: unknown;
  /** De dónde sale la variable de la fila: el dato compartido, o el indicador y lo que se toma de él; nulos si no es ajena. */
  variable_compartida_id: unknown;
  indicador_origen_id: unknown;
  toma: unknown;
  valor: unknown;
  valor_exacto: unknown;
  reportado_en: unknown;
  id: unknown;
};

/**
 * ¿La fila salió de la misma fuente que la variable `x` (ajena) de la versión? El mismo dato, o el mismo componente y lo
 * mismo que se toma de él (su valor o su cumplimiento).
 */
const mismaFuente = (f: ValorGuardado, x: VariableDeVersion): boolean =>
  x.origen === "compartida"
    ? f.origen === "compartida" && f.variable_compartida_id !== null && Number(f.variable_compartida_id) === x.datoId
    : f.origen === "indicador" && f.indicador_origen_id !== null && Number(f.indicador_origen_id) === x.indicadorOrigenId && f.toma === x.toma;

/** ¿La fila, que es de una variable de otra versión, no sirve para la letra en `v` porque allí la letra sale de otra fuente? */
function esDeOtraFuente(f: ValorGuardado, v: VersionDeCalculo, deLaVersion: ReadonlySet<number>): boolean {
  if (deLaVersion.has(Number(f.variable_id)) || !esAjena(f.origen)) return false;
  const x = v.variables.find((y) => y.letra === f.letra);
  return x !== undefined && esAjena(x.origen) && !mismaFuente(f, x);
}

/**
 * Los valores de una medición por letra de la versión dada, de sus filas guardadas: primero los de las variables de esa
 * versión; si no, los de otra versión (un cambio menor da otros ids a las mismas letras), el más reciente. Cada valor con
 * su fracción exacta, si la tiene (`valor_exacto`), y si no, la de `valor`. Una letra ajena en la versión solo toma filas
 * de variables ajenas, y una que no lo es, solo de las que no lo son (anexo 14C, §3.1): el valor que la persona guardó
 * cuando la letra era suya no entra cuando un cambio mayor la vuelve un dato, ni el que copió el sistema cuando la letra
 * era ajena entra cuando la vuelve propia. Y lo que el sistema copió en otra versión solo sirve si salió de **la misma
 * fuente** (`mismaFuente`): el valor de un componente no se lee como el del dato, ni como el de otro componente, que un
 * cambio mayor puso en su letra (para quien lee, esa letra pudo estar oculta en la versión anterior y ya no estarlo: anexo
 * 14C, §6.5). Esas filas las quita la propagación (`filasDeOtraFuente`).
 */
export function elegirValores(filas: readonly ValorGuardado[], v: VersionDeCalculo): Record<string, Fraccion> {
  const deLaVersion = new Set(v.variables.map((x) => x.id));
  const ajenas = new Set(letrasAjenas(v.variables));
  const instante = (f: ValorGuardado) => (f.reportado_en === null || f.reportado_en === undefined ? -Infinity : new Date(f.reportado_en as string).getTime());
  const ordenadas = [...filas].sort(
    (a, b) =>
      Number(deLaVersion.has(Number(b.variable_id))) - Number(deLaVersion.has(Number(a.variable_id))) ||
      instante(b) - instante(a) ||
      Number(b.id) - Number(a.id),
  );
  const salida: Record<string, Fraccion> = {};
  for (const f of ordenadas) {
    const letra = f.letra as string;
    if (!v.calculo.letras.includes(letra) || Object.hasOwn(salida, letra) || esAjena(f.origen) !== ajenas.has(letra)) continue;
    if (esDeOtraFuente(f, v, deLaVersion)) continue;
    const valor = typeof f.valor_exacto === "string" ? deTexto(f.valor_exacto) : fr(f.valor);
    if (valor) salida[letra] = valor;
  }
  return salida;
}

/**
 * De `filas` (las de la medición, sin categoría), los ids de las que el sistema copió en otra versión para una letra que en
 * `v` sale de otra fuente: `elegirValores` no las lee, y la propagación las quita sin dejar su cifra en ningún evento.
 */
export function filasDeOtraFuente(filas: readonly ValorGuardado[], v: VersionDeCalculo): number[] {
  const deLaVersion = new Set(v.variables.map((x) => x.id));
  return filas.filter((f) => esDeOtraFuente(f, v, deLaVersion)).map((f) => Number(f.id));
}

/** Las columnas de `medicion_valores mv` e `indicador_variables iv` que lee `elegirValores`. */
export const columnasDeValor = (sql: Cliente) =>
  sql`mv.id, mv.variable_id, iv.letra, iv.origen, iv.variable_compartida_id, iv.indicador_origen_id, iv.toma, mv.valor, mv.valor_exacto, mv.reportado_en`;

/** Las filas con valor de la medición, sin categoría (los valores de una sin desagregar, o el total), como las lee `elegirValores`. */
export async function filasDeValores(sql: Cliente, medicionId: number): Promise<ValorGuardado[]> {
  const filas = await sql`SELECT ${columnasDeValor(sql)}
    FROM medicion_valores mv JOIN indicador_variables iv ON iv.id = mv.variable_id
    WHERE mv.medicion_id = ${medicionId} AND mv.categoria_id IS NULL AND mv.valor IS NOT NULL`;
  return filas as unknown as ValorGuardado[];
}

/** Los valores de la medición por letra de la versión dada (`elegirValores`). */
export async function valoresPorLetra(sql: Cliente, medicionId: number, v: VersionDeCalculo): Promise<Record<string, Fraccion>> {
  return elegirValores(await filasDeValores(sql, medicionId), v);
}

/** Los valores en el texto de los eventos, uno por letra de la versión («5», `null` si no hay). */
function enTexto(v: VersionDeCalculo, valores: Readonly<Record<string, Fraccion | null | undefined>>): Record<string, string | null> {
  return Object.fromEntries(v.calculo.letras.map((l) => [l, valores[l] ? valorEnTexto(valores[l]!) : null]));
}

// ─────────────────────────────────────────────────────────────────────────────
// La rejilla de un desagregado (anexo 14C, §5)
// ─────────────────────────────────────────────────────────────────────────────

/** La lista de categorías de la medición (anexo 14C, §5.3), con los nombres de entonces; `null` si no se desagrega. */
export function listaDe(m: Record<string, unknown>): CategoriaDeMedicion[] | null {
  if (!Array.isArray(m.categorias)) return null;
  return (m.categorias as Record<string, unknown>[]).map((c) => ({
    id: Number(c.id),
    nombre: String(c.nombre),
    orden: Number(c.orden),
    noAplica: typeof c.noAplica === "string" ? c.noAplica : null,
  }));
}

/** Las celdas de una medición desagregada por categoría, cada una por letra de la versión (`elegirValores`). */
export function celdasDeFilas(filas: readonly (ValorGuardado & { categoria_id: unknown })[], v: VersionDeCalculo): Map<number, Record<string, Fraccion>> {
  const porCategoria = new Map<number, ValorGuardado[]>();
  for (const f of filas) {
    if (f.categoria_id === null || f.categoria_id === undefined) continue;
    const id = Number(f.categoria_id);
    porCategoria.set(id, [...(porCategoria.get(id) ?? []), f]);
  }
  return new Map([...porCategoria].map(([id, deLaCategoria]) => [id, elegirValores(deLaCategoria, v)]));
}

/** Las celdas de la medición, por categoría y letra (`celdasDeFilas`). */
export async function celdasPorCategoria(sql: Cliente, medicionId: number, v: VersionDeCalculo): Promise<Map<number, Record<string, Fraccion>>> {
  const filas = await sql`SELECT mv.categoria_id, ${columnasDeValor(sql)}
    FROM medicion_valores mv JOIN indicador_variables iv ON iv.id = mv.variable_id
    WHERE mv.medicion_id = ${medicionId} AND mv.categoria_id IS NOT NULL AND mv.valor IS NOT NULL`;
  return celdasDeFilas(filas as unknown as (ValorGuardado & { categoria_id: unknown })[], v);
}

/** La fila de `medicion_valores` de una variable (con categoría o sin ella), con su fracción exacta si no cabe en cuatro decimales. */
async function escribirFila(
  tx: TransactionSql,
  medicionId: number,
  variableId: number,
  categoriaId: number | null,
  valor: Fraccion,
  c: { usuarioId: number | null; ahora: Date },
): Promise<void> {
  const texto = valorEnTexto(valor);
  const exacto = comparar(fraccion(texto)!, valor) === 0 ? null : aTexto(valor);
  const deLaCategoria = categoriaId === null ? tx`categoria_id IS NULL` : tx`categoria_id = ${categoriaId}`;
  const [cambiada] = await tx`UPDATE medicion_valores SET valor = ${texto}, valor_exacto = ${exacto}, reportado_por = ${c.usuarioId}, reportado_en = ${c.ahora}
    WHERE medicion_id = ${medicionId} AND variable_id = ${variableId} AND ${deLaCategoria}
    RETURNING id`;
  if (!cambiada) {
    await tx`INSERT INTO medicion_valores (medicion_id, variable_id, categoria_id, valor, valor_exacto, reportado_por, reportado_en)
      VALUES (${medicionId}, ${variableId}, ${categoriaId}, ${texto}, ${exacto}, ${c.usuarioId}, ${c.ahora})`;
  }
}

/**
 * Deja una celda de la rejilla en la variable de la versión: antes quita las de esa categoría y esa letra en otra variable de
 * la misma clase (propia o ajena: cada escritor toca lo suyo, anexo 14C §3.1); sin valor, quita también la suya. La de una
 * persona lleva quién la digitó; la del sistema (`usuarioId` nulo), no.
 */
export async function escribirCelda(
  tx: TransactionSql,
  m: { id: number; indicadorId: number },
  categoriaId: number,
  v: VariableDeVersion,
  valor: Fraccion | null,
  c: { usuarioId: number | null; ahora: Date },
): Promise<void> {
  const ajenas = tx`iv.origen IN ('compartida', 'indicador')`;
  await tx`DELETE FROM medicion_valores mv
    WHERE mv.medicion_id = ${m.id} AND mv.categoria_id = ${categoriaId} AND mv.variable_id <> ${v.id}
      AND mv.variable_id IN (SELECT iv.id FROM indicador_variables iv JOIN indicador_versiones x ON x.id = iv.version_id
        WHERE x.indicador_id = ${m.indicadorId} AND iv.letra = ${v.letra} AND ${esAjena(v.origen) ? ajenas : tx`NOT ${ajenas}`})`;
  if (valor === null) {
    await tx`DELETE FROM medicion_valores WHERE medicion_id = ${m.id} AND variable_id = ${v.id} AND categoria_id = ${categoriaId}`;
    return;
  }
  await escribirFila(tx, m.id, v.id, categoriaId, valor, c);
}

/**
 * El total de una medición desagregada (anexo 14C, §5.5): por cada letra de la versión, la fila sin categoría con la suma,
 * en la variable de esa versión y sin usuario (lo escribe solo el sistema); quita las filas sin categoría de otras
 * variables. Compara contra las filas de las variables de la versión, no contra lo que da `valoresPorLetra`: tras un cambio
 * menor (otros ids, mismas letras) el total guardado está en las variables de la versión anterior, que se quitan, y cada
 * letra se vuelve a escribir en la suya aunque la suma no cambie. Sin total (`null`), quita todas las filas sin categoría.
 */
export async function escribirTotal(
  tx: TransactionSql,
  medicionId: number,
  v: VersionDeCalculo,
  total: Readonly<Record<string, Fraccion>> | null,
  ahora: Date,
): Promise<void> {
  if (total === null) {
    await tx`DELETE FROM medicion_valores WHERE medicion_id = ${medicionId} AND categoria_id IS NULL`;
    return;
  }
  const ids = v.variables.map((x) => x.id);
  await tx`DELETE FROM medicion_valores WHERE medicion_id = ${medicionId} AND categoria_id IS NULL AND NOT (variable_id = ANY(${ids}))`;
  const actuales = new Map(
    (await tx`SELECT variable_id, valor, valor_exacto FROM medicion_valores
      WHERE medicion_id = ${medicionId} AND categoria_id IS NULL AND variable_id = ANY(${ids})`).map((f) => [
      Number(f.variable_id),
      typeof f.valor_exacto === "string" ? deTexto(f.valor_exacto) : fr(f.valor),
    ]),
  );
  for (const x of v.variables) {
    const nuevo = total[x.letra];
    const actual = actuales.get(x.id) ?? null;
    if (!nuevo) {
      if (actuales.has(x.id)) await tx`DELETE FROM medicion_valores WHERE medicion_id = ${medicionId} AND variable_id = ${x.id} AND categoria_id IS NULL`;
    } else if (!actual || comparar(actual, nuevo) !== 0) {
      await escribirFila(tx, medicionId, x.id, null, nuevo, { usuarioId: null, ahora });
    }
  }
}

/** ¿Dos totales tienen las mismas letras con los mismos valores? */
export const mismoTotal = (a: Readonly<Record<string, Fraccion>>, b: Readonly<Record<string, Fraccion>>) =>
  Object.keys(a).length === Object.keys(b).length && Object.keys(a).every((l) => b[l] !== undefined && comparar(a[l], b[l]) === 0);

/**
 * Lo que la rejilla da para el total (`totalDeCategorias`): la suma, «ninguna aplica» o qué categorías faltan; o `espera` si a
 * las filas incompletas solo les falta lo ajeno (un dato por categoría que no ha llegado: anexo 14C, §3.1).
 */
export type TotalDeRejilla = ReturnType<typeof totalDeCategorias> | { clase: "espera" };

export function totalDeRejilla(
  lista: readonly CategoriaDeMedicion[],
  celdas: ReadonlyMap<number, Readonly<Record<string, Fraccion>>>,
  v: VersionDeCalculo,
  ficha: FichaDeCalculo,
): TotalDeRejilla {
  const filas = lista.map((c) => ({ categoria: c, valores: celdas.get(c.id) ?? {} }));
  const t = totalDeCategorias(filas, ficha);
  if (t.clase !== "faltan" || t.categorias.length === 0 || letrasAjenas(v.variables).length === 0) return t;
  const propias = v.variables.filter((x) => !esAjena(x.origen)).map((x) => x.letra);
  const incompletas = filas.filter((f) => estadoDeFila(f.categoria, f.valores, ficha) === "incompleta");
  return incompletas.every((f) => propias.every((l) => f.valores[l] !== undefined)) ? { clase: "espera" } : t;
}

/** Lo que cambió en una celda: su categoría (de la lista de antes), su variable y sus valores. */
export type CambioDeCelda = { categoria: CategoriaDeMedicion; variable: VariableDeVersion; antes: Fraccion | null; despues: Fraccion | null };
/** Lo que cambió en el «No aplica» de una fila: el motivo de antes y el de después (`null`, sin «No aplica»). */
export type CambioDeFila = { categoria: CategoriaDeMedicion; antes: string | null; despues: string | null };

/**
 * Las categorías que cambiaron, como las guarda el detalle de un evento (anexo 14C, §5.4): por categoría, en el orden de la
 * lista, sus celdas (por letra) y su «No aplica» (`noAplica`, con el motivo o `null`) antes y después.
 */
export function detalleDeCategorias(
  lista: readonly CategoriaDeMedicion[],
  celdas: readonly CambioDeCelda[],
  filas: readonly CambioDeFila[],
): { id: number; nombre: string; antes: Record<string, string | null>; despues: Record<string, string | null> }[] {
  const salida: { id: number; nombre: string; antes: Record<string, string | null>; despues: Record<string, string | null> }[] = [];
  for (const c of lista) {
    const antes: Record<string, string | null> = {};
    const despues: Record<string, string | null> = {};
    for (const x of celdas.filter((y) => y.categoria.id === c.id).sort((a, b) => (a.variable.letra < b.variable.letra ? -1 : 1))) {
      antes[x.variable.letra] = x.antes ? valorEnTexto(x.antes) : null;
      despues[x.variable.letra] = x.despues ? valorEnTexto(x.despues) : null;
    }
    const fila = filas.find((y) => y.categoria.id === c.id);
    if (fila) {
      antes.noAplica = fila.antes;
      despues.noAplica = fila.despues;
    }
    if (Object.keys(antes).length > 0) salida.push({ id: c.id, nombre: c.nombre, antes, despues });
  }
  return salida;
}

/**
 * Las categorías completas de la lista que quedan en Crítico con la versión y la regla de la medición (`resultadoDeCategoria`),
 * con su cifra (`textoValor`, que no contradice el color), en el orden de la lista.
 */
export function categoriasEnCritico(
  lista: readonly CategoriaDeMedicion[],
  celdas: ReadonlyMap<number, Readonly<Record<string, Fraccion>>>,
  ficha: FichaDeCalculo,
  regla: Regla,
  unidad: Unidad,
): { nombre: string; resultado: string }[] {
  return lista.flatMap((c) => {
    const valores = celdas.get(c.id) ?? {};
    if (estadoDeFila(c, valores, ficha) !== "completa") return [];
    const r = resultadoDeCategoria(valores, ficha, regla);
    return r.semaforo === "critico" && r.resultado ? [{ nombre: c.nombre, resultado: textoValor(r.resultado, unidad, regla) }] : [];
  });
}

const igualNumero = (a: unknown, b: unknown) => {
  const x = fr(a);
  const y = fr(b);
  return x === null || y === null ? x === y : comparar(x, y) === 0;
};

const objeto = (v: unknown): Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

/** Un recálculo que no nace de una acción sobre la medición (`recalcularMedicion`, `c.sistema`). */
export type RecalculoDeSistema = "racha" | "soporte" | "fuente";

/**
 * La versión que rige el periodo de la medición `m` y la versión con que se calcula: la que rige, salvo en un recálculo de
 * sistema, que calcula con la que la medición ya tiene (`version_id`, la que se congeló al reportarla). El de una fuente
 * (`"fuente"`, la propagación) solo la conserva si la medición ya tenía resultado: sin él, el valor que llega la completa
 * con la ficha que rige. Lo comparten `recalcularMedicion` y la propagación, que escribe el valor ajeno en la variable de la
 * versión con que se calcula.
 */
export function versionesDeCalculo(
  versiones: readonly VersionDeCalculo[],
  m: Record<string, unknown>,
  sistema: RecalculoDeSistema | undefined,
  zona: string,
): { rige: VersionDeCalculo | null; version: VersionDeCalculo | null } {
  const periodo = periodoDe(m.periodo as string, zona);
  const rige = periodo ? versionQueRigeEntre(versiones, periodo, zona) : null;
  if (!rige || !sistema || (sistema === "fuente" && typeof m.resultado_exacto !== "string")) return { rige, version: rige };
  return { rige, version: versiones.find((v) => v.id === Number(m.version_id)) ?? rige };
}

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
 * estado, y cuentan para saber si algo cambió. `c.estadoAnterior` es el estado verdadero de antes cuando quien llama ya
 * lo cambió con un `UPDATE` provisional (la reapertura saca la medición de `cerrada`): va al `antes.estado` del evento;
 * las columnas se siguen comparando contra la fila tal como está.
 *
 * Si cambió el semáforo o el resultado de una medición ordinaria, recalcula después las siguientes cuya racha la alcanza
 * (`recalcularSiguientes`). `c.sistema` marca un recálculo de sistema, que no nace de un cambio en la medición:
 * - siempre calcula con la versión que la medición ya tiene, la que se congeló al reportarla, y no con la que hoy rige el
 *   periodo: un cambio menor aprobado después no la cambia de versión sin que nadie la toque;
 * - `"racha"` (la de una siguiente, desde `recalcularSiguientes`) no sigue en cadena;
 * - `"soporte"` (`recalcularPorSoporte`, al cambiar «soporte obligatorio»), con el `debe_soporte` que ese cambio acaba de
 *   decidir;
 * - `"fuente"` (la propagación, anexo 14C §3.3: llegó o cambió un valor ajeno) calcula con la versión congelada solo si la
 *   medición ya tenía resultado, y con la que rige si no (`versionesDeCalculo`).
 * Si la medición debe el soporte lo dice `debe_soporte` (`seDebeElSoporte`, anexo del complemento de la 14C §4.2), igual en
 * todo recálculo: de una acción sobre ella (reportar, corregir, analizar, la meta, un soporte, reabrir) o de sistema.
 *
 * `c.conElResultado`, si algo cambió, corre con el resultado ya escrito y antes del evento, en la misma transacción; lo que
 * devuelve va al detalle del evento. La foto lo usa para mover el plazo solo cuando pide un análisis (anexo 14B, §5.4).
 *
 * En una medición desagregada (con lista, anexo 14C §5.6) escribe también `categorias_en_critico`: con resultado, cuántas
 * filas completas de la lista quedan en Crítico con esa versión y esa regla (`categoriasEnCritico`, leídas de sus celdas sin
 * tocarlas); nulo sin resultado (como al abrirla) o si no se desagrega. Unas celdas que cambiaron (`c.detalle.categorias`) cuentan como cambio
 * aunque el total quede igual: dejan su evento.
 */
export async function recalcularMedicion(
  tx: TransactionSql,
  medicionId: number,
  c: {
    ahora: Date;
    actorId: number | null;
    evento: TipoEvento;
    detalle?: Record<string, unknown>;
    estadoAnterior?: EstadoMedicion;
    sistema?: RecalculoDeSistema;
    conElResultado?: (r: Recalculo) => Promise<Record<string, unknown>>;
  },
): Promise<Recalculo> {
  const zona = zonaHoraria();
  const [m] = await tx`SELECT m.*, i.soporte_obligatorio FROM mediciones m JOIN indicadores i ON i.id = m.indicador_id
    WHERE m.id = ${medicionId} FOR UPDATE OF m`;
  if (!m) throw new ErrorIndicador(NO_EXISTE);
  if (m.estado === "cerrada") throw new ErrorIndicador(CERRADA);
  const indicadorId = Number(m.indicador_id);
  const { rige, version } = versionesDeCalculo(await versionesAprobadas(tx, indicadorId), m, c.sistema, zona);
  const ficha = version ? fichaDeCalculo(version.calculo) : null;
  if (!rige || !version || !ficha) throw new ErrorIndicador("El indicador no tiene una ficha aprobada que calcule este periodo");
  if (esDeOtraPeriodicidad(m.periodo as string, rige)) throw new ErrorIndicador(OTRA_PERIODICIDAD);

  const reglaTexto = await reglaDelPeriodo(tx, indicadorId, m.periodo as string, version);
  const regla = reglaDeTexto(reglaTexto);
  const historica = m.historica === true;
  const noAplica = m.no_aplica === true;
  let resultado: Fraccion | null = null;
  let semaforo: Semaforo | null = null;
  let cumple: boolean | null = null;
  if (m.reportada_en !== null && !noAplica) {
    const r = calcular(ficha, await valoresPorLetra(tx, medicionId, version), regla);
    if (r.resultado) {
      resultado = r.resultado;
      semaforo = r.semaforo;
      cumple = r.cumple;
    }
  }

  // La racha: las anteriores ordinarias medidas, de la más reciente a la más antigua (spec §10.3, F14-DC20 y F14-DC41).
  let repetido = false;
  if (!historica && cumple === false) {
    const { incumplimientoPeriodos: n } = await obtenerParametros({ sql: tx });
    const anteriores = await tx`SELECT semaforo, cumple FROM mediciones
      WHERE indicador_id = ${indicadorId} AND id <> ${medicionId} AND hasta < ${m.desde}
        AND NOT historica AND NOT no_aplica AND resultado_exacto IS NOT NULL
      ORDER BY hasta DESC LIMIT ${n - 1}`;
    repetido = esRepetido(
      anteriores.map((a) => cumpleDeFila({ cumple: (a.cumple as boolean | null) ?? null, semaforo: (a.semaforo as Semaforo | null) ?? null })),
      cumple,
      n,
    );
  }
  const conAnalisis = analisisCompleto(analisisExigido({ semaforo, cumple, repetido, historica, noAplica }), analisisDe(m));
  // Lo mismo venga de quien venga el recálculo: `debe_soporte` decide si la medición debe el soporte (`seDebeElSoporte`).
  const debeSoporte = seDebeElSoporte({
    soporteObligatorio: m.soporte_obligatorio === true,
    marcada: m.debe_soporte === true,
    historica,
    noAplica,
    mide: mide(version),
  });
  const conSoporte = !debeSoporte || (await contarSoportes(tx, medicionId)) > 0;
  const conDato = noAplica || resultado !== null;
  const estado: EstadoMedicion = conDato && conAnalisis && conSoporte ? "reportada" : "abierta";
  const limite = conDato ? limiteDeCritico(regla) : null;
  // Las categorías en Crítico se cuentan de las celdas, con la versión y la regla con que se calcula el total (anexo 14C, §5.6).
  const lista = listaDe(m);
  const criticas = lista && resultado !== null ? categoriasEnCritico(lista, await celdasPorCategoria(tx, medicionId, version), ficha, regla, version.unidad) : [];
  const enCritico = lista && resultado !== null ? criticas.length : null;
  const enCriticoAntes = m.categorias_en_critico === null || m.categorias_en_critico === undefined ? null : Number(m.categorias_en_critico);

  const nuevo = {
    version_id: conDato ? version.id : Number(m.version_id),
    resultado_exacto: resultado ? aTexto(resultado) : null,
    resultado: resultado ? aDecimal(resultado, 10, "redondear") : null,
    semaforo,
    cumple,
    meta_aplicada: conDato ? reglaTexto.meta : null,
    meta_max_aplicada: conDato ? reglaTexto.metaMax : null,
    limite_aplicado: limite ? decimalCorto(limite) : null,
    requiere_accion: !historica && !noAplica && (semaforo === "critico" || repetido),
    incumplimiento_repetido: repetido,
    estado,
    categorias_en_critico: enCritico,
  };
  const cumpleAntes = cumpleDeFila({ cumple: (m.cumple as boolean | null) ?? null, semaforo: (m.semaforo as Semaforo | null) ?? null });
  const columnasCambiaron =
    Number(m.version_id) !== nuevo.version_id ||
    m.resultado_exacto !== nuevo.resultado_exacto ||
    m.semaforo !== nuevo.semaforo ||
    cumpleAntes !== nuevo.cumple ||
    !igualNumero(m.meta_aplicada, nuevo.meta_aplicada) ||
    !igualNumero(m.meta_max_aplicada, nuevo.meta_max_aplicada) ||
    !igualNumero(m.limite_aplicado, nuevo.limite_aplicado) ||
    m.requiere_accion !== nuevo.requiere_accion ||
    m.incumplimiento_repetido !== nuevo.incumplimiento_repetido ||
    m.estado !== nuevo.estado ||
    enCriticoAntes !== nuevo.categorias_en_critico;
  if (columnasCambiaron) {
    await tx`UPDATE mediciones SET version_id = ${nuevo.version_id}, resultado_exacto = ${nuevo.resultado_exacto},
        resultado = ${nuevo.resultado}, semaforo = ${nuevo.semaforo}, cumple = ${nuevo.cumple}, meta_aplicada = ${nuevo.meta_aplicada},
        meta_max_aplicada = ${nuevo.meta_max_aplicada}, limite_aplicado = ${nuevo.limite_aplicado},
        requiere_accion = ${nuevo.requiere_accion}, incumplimiento_repetido = ${nuevo.incumplimiento_repetido}, estado = ${nuevo.estado},
        categorias_en_critico = ${nuevo.categorias_en_critico}
      WHERE id = ${medicionId}`;
  }

  const { antes: antesDe, despues: despuesDe, ...resto } = c.detalle ?? {};
  const resultadoAntes = m.resultado_exacto ? decimalCorto(deTexto(m.resultado_exacto as string)) : null;
  // Un recálculo de sistema dice también qué pasó con la marca (residuos finales, punto 3): el de la racha o el soporte no
  // cambia valores ni resultado, y el de una fuente cambia lo ajeno sin que nadie toque la medición.
  const marca = (v: boolean) => (c.sistema ? { incumplimientoRepetido: v } : {});
  const antes = {
    ...objeto(antesDe),
    resultado: resultadoAntes,
    semaforo: (m.semaforo as Semaforo | null) ?? null,
    estado: c.estadoAnterior ?? (m.estado as string),
    ...marca(m.incumplimiento_repetido === true),
    ...(cumpleAntes !== cumple ? { cumple: cumpleAntes } : {}),
  };
  const despues = { ...objeto(despuesDe), resultado: resultado ? decimalCorto(resultado) : null, semaforo, estado, ...marca(repetido), ...(cumpleAntes !== cumple ? { cumple } : {}) };
  const celdasCambiaron = Array.isArray(resto.categorias) && resto.categorias.length > 0;
  const cambio = columnasCambiaron || celdasCambiaron || JSON.stringify(antes) !== JSON.stringify(despues);
  const r: Recalculo = {
    medicionId,
    indicadorId,
    antes: (m.semaforo as Semaforo | null) ?? null,
    despues: semaforo,
    cumpleAntes,
    cumple,
    estado,
    resultado,
    repetido,
    historica,
    cambio,
    enCritico,
    enCriticoAntes,
    criticas,
  };
  if (!cambio) return r;
  const delLlamador = c.conElResultado ? await c.conElResultado(r) : {};
  await tx`INSERT INTO medicion_eventos (medicion_id, tipo, usuario_id, detalle, creado_en)
    VALUES (${medicionId}, ${c.evento}, ${c.actorId}, ${tx.json({ ...resto, ...delLlamador, antes, despues } as never)}, ${c.ahora})`;
  if (columnasCambiaron) await alRecalcular(tx, r, { ahora: c.ahora, actorId: c.actorId });
  const cambioLaRacha = m.semaforo !== nuevo.semaforo || cumpleAntes !== nuevo.cumple || m.resultado_exacto !== nuevo.resultado_exacto;
  if (c.sistema !== "racha" && !historica && cambioLaRacha) {
    await recalcularSiguientes(tx, { id: medicionId, indicadorId, periodo: m.periodo as string, hasta: m.hasta as Date }, c);
  }
  return r;
}

/** ¿La medición pide un análisis que no tiene? El que exige su resultado (`analisisExigido`) frente al guardado. */
function pideAnalisis(d: { semaforo: Semaforo | null; cumple: boolean | null; repetido: boolean; noAplica: boolean }, m: Record<string, unknown>): boolean {
  return !analisisCompleto(analisisExigido({ ...d, historica: false }), analisisDe(m));
}

/**
 * El `conElResultado` de un recálculo que nace de una fuente (la propagación, y la racha que ella dispara en las siguientes,
 * `recalcularSiguientes`): un cambio ajeno que deja a la medición `m` (su fila de antes) pidiendo el análisis con la fecha ya
 * pasada no la deja vencida (anexo 14C, §3.4); ni el contagio que llegó a tiempo y, al quitarse, le devuelve el reporte a
 * quien mide un mixto (`devuelveATiempo`): nadie amanece vencido por lo que cambió otro. Si el contagio llegó tarde, la fecha y
 * las marcas de aviso no se tocan: ya debía su reporte. `noAplica` es el «No aplica» que le queda; `i`, su indicador, con
 * `plazo_reporte_dias`.
 *
 * Cuando la fecha se mueve porque la medición pasa a pedir el análisis, el evento guarda también la que tenía (`venceAntes`):
 * esa fecha nueva es la del análisis, y «Reportes a tiempo» (`reportesDelPeriodo`, `calculos.ts`) sigue juzgando el reporte
 * contra la del primer evento que la lleva. Cuando se mueve porque el reporte vuelve a quien mide (`devuelveATiempo`), no: esa
 * sí es la fecha nueva de su reporte.
 *
 * Vive aquí y no en `propagacion.ts`, que importa este archivo: la racha también lo usa.
 */
export function plazoPorLaFuente(
  tx: TransactionSql,
  i: Record<string, unknown>,
  m: Record<string, unknown>,
  c: { noAplica: boolean; devuelveATiempo: boolean; ahora: Date },
) {
  const semaforo = (m.semaforo as Semaforo | null) ?? null;
  const pedia = pideAnalisis(
    { semaforo, cumple: cumpleDeFila({ cumple: (m.cumple as boolean | null) ?? null, semaforo }), repetido: m.incumplimiento_repetido === true, noAplica: m.no_aplica === true },
    m,
  );
  return async (r: Recalculo): Promise<Record<string, unknown>> => {
    const pide = pideAnalisis({ semaforo: r.despues, cumple: r.cumple, repetido: r.repetido, noAplica: c.noAplica }, m);
    const plazo = { venceEn: new Date(m.vence_en as string), ahora: c.ahora, plazoDias: Number(i.plazo_reporte_dias), zona: zonaHoraria() };
    const porElAnalisis = laFuenteMueveElPlazo({ pedia, pide, ...plazo });
    const vence = porElAnalisis ?? (c.devuelveATiempo ? laFuenteMueveElPlazo({ pedia: false, pide: true, ...plazo }) : null);
    if (!vence) return {};
    await tx`UPDATE mediciones SET vence_en = ${vence}, aviso_previo_en = NULL, aviso_vencido_en = NULL, escalado_en = NULL
      WHERE id = ${Number(m.id)}`;
    return { venceEn: vence.toISOString(), ...(porElAnalisis ? { venceAntes: plazo.venceEn.toISOString() } : {}) };
  };
}

/**
 * El incumplimiento repetido de una medición sale de si cumplieron la meta las n − 1 anteriores medidas (spec §10.3; con
 * `cumple`, spec 14A §3.1: un Bien que no la alcanza también cuenta): cuando una cambia de semáforo, de `cumple` o de
 * resultado (se corrige, se reabre, se reporta tarde, se marca «no aplica»), se recalculan las
 * siguientes medidas del indicador cuya racha la alcanza, que son las n − 1 primeras, con el evento `recalculo`, el mismo
 * actor y la misma hora. Las cerradas cuentan pero no cambian: son evidencia cerrada (el trigger lo impide y se reabren a
 * mano); las históricas no tienen racha, y una de otra periodicidad no se calcula (`esDeOtraPeriodicidad`). Se bloquean en
 * el orden de los demás caminos (por `desde` e id, como el cierre y los históricos). Son recálculos de sistema
 * (`sistema: "racha"`): cada una conserva la versión con que se calculó y lo único que cambia es su racha y lo que de ella
 * depende (la marca, el análisis exigido y con él el estado); si debe el soporte lo dice `debe_soporte`, como en todo
 * recálculo (`seDebeElSoporte`). El semáforo de una siguiente no depende de las anteriores: su recálculo no sigue en
 * cadena. Sus avisos son los de `alRecalcular`, por el último nivel alertado.
 *
 * Cuando la racha nace de una propagación (`c.sistema` es `"fuente"`: un dato corregido, la meta de un componente, lo
 * recalculado tras una reapertura en cascada), la siguiente que pasa de no pedir el análisis a pedirlo con su fecha ya pasada
 * recibe la regla de la propia propagación (`plazoPorLaFuente`, con su antes y su después; anexo 14C §3.4, F14C-DC42): su fecha
 * se cuenta otra vez desde ese día y su evento `recalculo` lleva `venceEn` y `venceAntes`. La racha que nace de quien mide el
 * mismo indicador no mueve ninguna fecha (14A).
 */
async function recalcularSiguientes(
  tx: TransactionSql,
  m: { id: number; indicadorId: number; periodo: string; hasta: Date },
  c: { ahora: Date; actorId: number | null; sistema?: RecalculoDeSistema },
): Promise<void> {
  const { incumplimientoPeriodos: n } = await obtenerParametros({ sql: tx });
  const siguientes = await tx`SELECT * FROM mediciones
    WHERE indicador_id = ${m.indicadorId} AND id <> ${m.id} AND desde > ${m.hasta}
      AND NOT historica AND NOT no_aplica AND resultado_exacto IS NOT NULL
    ORDER BY desde, id
    LIMIT ${n - 1}
    FOR UPDATE`;
  const abiertas = siguientes.filter((s) => s.estado !== "cerrada");
  if (abiertas.length === 0) return;
  const zona = zonaHoraria();
  const versiones = await versionesAprobadas(tx, m.indicadorId);
  // Quien propaga ya tiene el indicador `FOR SHARE`: su plazo no cambia mientras tanto.
  const porFuente = c.sistema === "fuente" ? (await tx`SELECT plazo_reporte_dias FROM indicadores WHERE id = ${m.indicadorId}`)[0] : null;
  for (const s of abiertas) {
    const clave = s.periodo as string;
    const periodo = periodoDe(clave, zona);
    const version = periodo ? versionQueRigeEntre(versiones, periodo, zona) : null;
    if (!version || esDeOtraPeriodicidad(clave, version)) continue;
    await recalcularMedicion(tx, Number(s.id), {
      ahora: c.ahora,
      actorId: c.actorId,
      evento: "recalculo",
      detalle: { causa: "racha", periodo: m.periodo },
      sistema: "racha",
      ...(porFuente ? { conElResultado: plazoPorLaFuente(tx, porFuente, s, { noAplica: false, devuelveATiempo: false, ahora: c.ahora }) } : {}),
    });
  }
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
 * (salvo con `admiteCerrada`, para leerla). Con `digita` (por omisión), que alguien mida la versión que rige el periodo:
 * nadie digita los datos de un automático (anexo 14B, §4: `NO_SE_DIGITA`) ni los de un indicador sin variables propias
 * (anexo 14C, §3.1: `NADIE_LO_MIDE`). Con `digita: "historico"` solo se rechaza el automático: los históricos de una ficha
 * manual se digitan completos (§3.6). Pasan `digita: false` quienes no los digitan (analizar, reabrir, las lecturas). Con
 * `bloquear`, dentro de la transacción: el indicador `FOR SHARE` y la medición `FOR UPDATE`, en ese orden.
 */
export async function contextoDeMedicion(
  sql: Cliente,
  sesion: SujetoVisibilidad,
  medicionId: number,
  bloquear: boolean,
  opciones?: { admiteCerrada?: boolean; exigir?: CondicionDePersona; digita?: boolean | "historico" },
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
  const digita = opciones?.digita ?? true;
  if (digita !== false && version.origenDato === "automatico") throw new ErrorIndicador(NO_SE_DIGITA);
  if (digita === true && !mide(version)) throw new ErrorIndicador(NADIE_LO_MIDE);
  return {
    medicion: { ...m, id: Number(m.id) },
    indicador: { id: indicadorId, codigo: i.codigo as string, soporteObligatorio: i.soporte_obligatorio === true },
    capacidad,
    version,
    periodo,
  };
}

/** La medición anterior con resultado, sea histórica o no: contra ella se pide la confirmación por variación (spec §7.4). */
export async function anteriorConResultado(
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

/**
 * Una fila de la rejilla tal como llega (anexo 14C, §5.4). En `valores`, una letra que no vino no se toca y «» vacía la celda:
 * dos personas guardan partes distintas sin pisarse. `noAplica`: sin valor, no se toca; `null`, se quita; un texto, se pone
 * con ese motivo.
 */
export type FilaDeReporte = { categoriaId: number; valores: Record<string, string | undefined>; noAplica?: string | null };

type DatosDeReportar = { medicionId: number; valores: Record<string, string>; parcial: boolean; confirmado: boolean; filas?: FilaDeReporte[] };

/** Lo que va a escribir el reporte de una rejilla (`planDeRejilla`): las celdas y los «No aplica» que cambian y el total. */
export type PlanDeRejilla = {
  cambios: CambioDeCelda[];
  filas: CambioDeFila[];
  /** La lista con los «No aplica» de después. */
  lista: CategoriaDeMedicion[];
  /** Lo que da el total con lo de después; `null` en «Guardar sin reportar», que no lo toca. */
  total: TotalDeRejilla | null;
};

/** El motivo de «No aplica» de una fila: de 5 a 500 caracteres y ninguno de los del sistema (`motivoValido`). */
function motivoDeFila(motivo: string, categoria: string): string {
  const m = motivo.trim();
  if (m.length < 5) throw new ErrorIndicador(`Escriba el motivo de «No aplica» de ${categoria}`);
  if (m.length > 500) throw new ErrorIndicador(`El motivo de «No aplica» de ${categoria} no puede pasar de 500 caracteres`);
  return motivoValido(m);
}

/**
 * Rechaza un reporte sin el soporte que la medición debe, con la regla de `recalcularMedicion` (`seDebeElSoporte`). Un
 * reporte con datos no es «No aplica», aunque la medición lo estuviera: reportarla se lo quita.
 */
async function exigirElSoporte(sql: Cliente, ctx: Contexto): Promise<void> {
  const m = ctx.medicion;
  const debe = seDebeElSoporte({
    soporteObligatorio: ctx.indicador.soporteObligatorio,
    marcada: m.debe_soporte === true,
    historica: m.historica === true,
    noAplica: false,
    mide: mide(ctx.version),
  });
  if (debe && (await contarSoportes(sql, m.id)) === 0) throw new ErrorIndicador("Este indicador exige un soporte: adjúntelo antes de reportar");
}

/**
 * El plan de reporte de una medición desagregada (anexo 14C, §5.4), sin escribir nada. Las filas traen solo categorías de su
 * lista y letras de la versión (si no, `FICHA_CAMBIO`); la persona digita solo las propias, cada celda con sus límites de
 * captura, y un total digitado es otro formulario. Un «No aplica» que puso el sistema en una fila no lo cambia la persona.
 * «Guardar sin reportar» escribe lo que llegó, sin el total, y como en cualquier medición solo antes de reportar
 * (`YA_REPORTADA`; también con la medición entera «No aplica»): ya reportada, se corrige pulsando «Reportar». Reportar exige
 * cada fila con sus celdas propias o «No aplica» (`faltanCategorias`); con todo (también lo ajeno) da el total, y sobre él
 * valen la división por cero, los límites del resultado, el soporte obligatorio y la confirmación por variación; si a alguna
 * fila solo le falta lo ajeno, se reporta lo propio y el total espera al dato («Reportar lo mío»).
 */
async function planDeRejilla(
  sql: Cliente,
  ctx: Contexto,
  d: DatosDeReportar,
  lista: readonly CategoriaDeMedicion[],
): Promise<{ valores: Record<string, Fraccion | null>; confirmar: string | null; rejilla: PlanDeRejilla }> {
  const { version, medicion: m } = ctx;
  if (Object.values(d.valores).some((v) => typeof v === "string" && v.trim() !== "")) throw new ErrorIndicador(FICHA_CAMBIO);
  const porId = new Map(lista.map((c) => [c.id, c]));
  const vistas = new Set<number>();
  for (const f of d.filas ?? []) {
    if (!porId.has(f.categoriaId) || vistas.has(f.categoriaId)) throw new ErrorIndicador(FICHA_CAMBIO);
    vistas.add(f.categoriaId);
    if (Object.keys(f.valores).some((l) => !version.calculo.letras.includes(l))) throw new ErrorIndicador(FICHA_CAMBIO);
  }
  const guardadas = await celdasPorCategoria(sql, m.id, version);
  const celdas = new Map([...guardadas].map(([id, v]) => [id, { ...v }]));
  const cambios: CambioDeCelda[] = [];
  const filas: CambioDeFila[] = [];
  const nueva = lista.map((c) => ({ ...c }));
  for (const f of d.filas ?? []) {
    const c = porId.get(f.categoriaId)!;
    const deLaFila = celdas.get(c.id) ?? {};
    for (const v of version.variables) {
      const digitado = f.valores[v.letra];
      if (digitado === undefined) continue;
      if (v.origen !== "propia") {
        if (digitado.trim() !== "") throw new ErrorIndicador(noSeDigita(v));
        continue;
      }
      const leido = leerValor(digitado, v);
      if (!leido.ok) throw new ErrorIndicador(`${c.nombre}: ${leido.error}`);
      const antes = guardadas.get(c.id)?.[v.letra] ?? null;
      const despues = leido.valor;
      if (despues === null) delete deLaFila[v.letra];
      else deLaFila[v.letra] = despues;
      if (antes === null ? despues !== null : despues === null || comparar(antes, despues) !== 0) cambios.push({ categoria: c, variable: v, antes, despues });
    }
    celdas.set(c.id, deLaFila);
    if (f.noAplica === undefined) continue;
    const motivo = f.noAplica === null ? null : motivoDeFila(f.noAplica, c.nombre);
    if (motivo === c.noAplica) continue;
    if (c.noAplica !== null && MOTIVOS_DEL_SISTEMA.includes(c.noAplica)) throw new ErrorIndicador(NO_APLICA_DEL_SISTEMA);
    filas.push({ categoria: c, antes: c.noAplica, despues: motivo });
    nueva.find((x) => x.id === c.id)!.noAplica = motivo;
  }
  if (d.parcial) {
    if (m.reportada_en !== null || m.no_aplica === true) throw new ErrorIndicador(YA_REPORTADA);
    return { valores: {}, confirmar: null, rejilla: { cambios, filas, lista: nueva, total: null } };
  }

  if (nueva.length === 0) throw new ErrorIndicador(SIN_CATEGORIAS);
  const propias = version.variables.filter((v) => v.origen === "propia");
  const faltan = nueva.filter((c) => c.noAplica === null && propias.some((v) => celdas.get(c.id)?.[v.letra] === undefined));
  if (faltan.length > 0) throw new ErrorIndicador(faltanCategorias(faltan.map((c) => c.nombre)));
  const ficha = fichaDeCalculo(version.calculo);
  if (!ficha) throw new ErrorIndicador(FICHA_CAMBIO);
  const total = totalDeRejilla(nueva, celdas, version, ficha);
  if (total.clase === "faltan") throw new ErrorIndicador(faltanCategorias(total.categorias));
  const rejilla: PlanDeRejilla = { cambios, filas, lista: nueva, total };
  if (total.clase === "ninguna_aplica") return { valores: {}, confirmar: null, rejilla };

  let fuera: string | null = null;
  let resultado: Fraccion | null = null;
  if (total.clase === "total") {
    const regla = reglaDeTexto(await reglaDelPeriodo(sql, ctx.indicador.id, m.periodo as string, version));
    const r = calcular(ficha, total.valores, regla);
    if (r.sinResultado === "division_por_cero") throw new ErrorIndicador(DIVISION_POR_CERO);
    if (!r.resultado) throw new ErrorIndicador(CIFRA_FUERA_DE_RANGO);
    if (r.fueraDeLimites) fuera = fueraDeLimites(textoValor(r.resultado, version.unidad));
    if (fuera && propias.length === version.variables.length) throw new ErrorIndicador(fuera);
    resultado = r.resultado;
  }
  await exigirElSoporte(sql, ctx);
  if (fuera && !d.confirmado) return { valores: {}, confirmar: `${fuera}. ¿Los datos son correctos?`, rejilla };
  if (resultado && !d.confirmado) {
    const anterior = await anteriorConResultado(sql, ctx.indicador.id, m.desde);
    const { variacionConfirmarPct } = await obtenerParametros({ sql });
    if (anterior && variacionExcesiva(resultado, anterior.valor, variacionConfirmarPct)) {
      return { valores: {}, confirmar: fraseDeVariacion(resultado, anterior, version.unidad), rejilla };
    }
  }
  return { valores: {}, confirmar: null, rejilla };
}

/**
 * Lo que se va a escribir, sin escribir nada: los valores leídos y validados (spec §7.4) y, en un reporte, el cálculo,
 * los límites del resultado, la división por cero, el soporte obligatorio y la confirmación por variación. Lo comparten
 * `reportar` y `registrarHistoricos` (que no pide la confirmación, y a un histórico no se le exige el soporte).
 *
 * La persona digita solo las variables propias (anexo 14C, §3.1): un valor para una ajena se rechaza
 * (`noSeDigitaDesdeAqui`) y un reporte exige solo las propias. Lo ajeno que ya llegó entra al cálculo; si falta, no hay
 * resultado que validar ni salto que confirmar, pero el soporte obligatorio se pide igual. Si lo ajeno ya llegó, un
 * resultado fuera de los límites del indicador no bloquea a quien no puede cambiar ese valor: se le pide confirmar lo suyo,
 * como un salto grande (`confirmado`); la división por cero sigue rechazando, porque «No aplica» es su salida. En un
 * histórico se digitan y se exigen todas (§3.6), y el límite bloquea; la tomada de otro indicador, sin las reglas de captura
 * (su valor es el que tuvo la fuente, también si es negativo). `valores` trae solo las letras que la persona digita.
 *
 * Una medición con lista de categorías se reporta por su rejilla (`planDeRejilla`, en `rejilla`); unas filas para una que no
 * la tiene son otro formulario (`FICHA_CAMBIO`).
 */
export async function planDeReporte(
  sql: Cliente,
  ctx: Contexto,
  d: DatosDeReportar,
): Promise<{ valores: Record<string, Fraccion | null>; confirmar: string | null; rejilla?: PlanDeRejilla }> {
  const { version, medicion: m } = ctx;
  const lista = listaDe(m);
  if (lista) return planDeRejilla(sql, ctx, d, lista);
  if ((d.filas ?? []).length > 0) throw new ErrorIndicador(FICHA_CAMBIO);
  for (const letra of Object.keys(d.valores)) {
    if (!version.calculo.letras.includes(letra)) throw new ErrorIndicador(FICHA_CAMBIO);
  }
  const digita = variablesQueDigita(version, m.historica === true);
  for (const v of version.variables) {
    const digitado = d.valores[v.letra];
    if (!digita.includes(v) && typeof digitado === "string" && digitado.trim() !== "") throw new ErrorIndicador(noSeDigita(v));
  }
  // En un histórico se digita también la variable tomada de otro indicador (§3.6): su valor es el que tuvo la fuente, así que
  // no pasa por «admite negativos» ni por límites de captura (la ficha la firma sin negativos ni límites porque nadie la
  // digita en un periodo ordinario). La de un dato compartido conserva las reglas del dato.
  const { valores, errores } = leerValores(
    digita.map((v) => (v.origen === "indicador" ? { ...v, capturaMin: null, capturaMax: null, admiteNegativos: true } : v)),
    d.valores,
  );
  const primerError = digita.map((v) => errores[v.letra]).find((e) => e !== undefined);
  if (primerError) throw new ErrorIndicador(primerError);
  if (d.parcial) {
    if (m.reportada_en !== null || m.no_aplica === true) throw new ErrorIndicador(YA_REPORTADA);
    return { valores, confirmar: null };
  }
  const falta = digita.find((v) => valores[v.letra] === null);
  if (falta) throw new ErrorIndicador(`Falta el valor de «${falta.nombre}»`);

  const guardados = digita.length < version.variables.length ? await valoresPorLetra(sql, m.id, version) : {};
  const todos: Record<string, Fraccion | undefined> = Object.fromEntries(
    version.variables.map((v) => [v.letra, (digita.includes(v) ? valores[v.letra] : guardados[v.letra]) ?? undefined]),
  );
  const completo = version.variables.every((v) => todos[v.letra] !== undefined);
  let resultado: Fraccion | null = null;
  let fuera: string | null = null;
  if (completo) {
    const regla = reglaDeTexto(await reglaDelPeriodo(sql, ctx.indicador.id, m.periodo as string, version));
    const ficha = fichaDeCalculo(version.calculo);
    if (!ficha) throw new ErrorIndicador(FICHA_CAMBIO);
    const r = calcular(ficha, todos, regla);
    if (r.sinResultado === "division_por_cero") throw new ErrorIndicador(DIVISION_POR_CERO);
    if (!r.resultado) throw new ErrorIndicador(CIFRA_FUERA_DE_RANGO);
    if (r.fueraDeLimites) fuera = fueraDeLimites(textoValor(r.resultado, version.unidad));
    // Con lo digitado completo, el límite bloquea: la persona puede corregirlo. Con un valor ajeno que no puede cambiar, se
    // le pide confirmar lo suyo (anexo 14C, §3.1).
    if (fuera && digita.length === version.variables.length) throw new ErrorIndicador(fuera);
    resultado = r.resultado;
  }
  await exigirElSoporte(sql, ctx);
  if (fuera && !d.confirmado) return { valores, confirmar: `${fuera}. ¿Los datos son correctos?` };
  if (resultado && !d.confirmado) {
    const anterior = await anteriorConResultado(sql, ctx.indicador.id, m.desde);
    const { variacionConfirmarPct } = await obtenerParametros({ sql });
    if (anterior && variacionExcesiva(resultado, anterior.valor, variacionConfirmarPct)) {
      return { valores, confirmar: fraseDeVariacion(resultado, anterior, version.unidad) };
    }
  }
  return { valores, confirmar: null };
}

/**
 * Deja los valores que la persona digita en la versión que rige (`variablesQueDigita`): quita los de otra versión y los
 * vaciados, inserta o cambia los demás. Nunca toca una fila de una variable ajena, ni de esta versión ni de otra (anexo 14C,
 * §3.1: cada escritor toca lo suyo); en un histórico, que se digita completo, sí las de otra versión. Una medición con lista
 * de categorías no pasa por aquí (`planDeReporte` la manda a la rejilla): su fila sin categoría es el total, que escribe solo
 * el sistema (`escribirTotal`).
 */
async function escribirValores(
  tx: TransactionSql,
  medicion: { id: number; historica: boolean },
  version: VersionDeCalculo,
  valores: Readonly<Record<string, Fraccion | null>>,
  usuarioId: number,
  ahora: Date,
): Promise<void> {
  const medicionId = medicion.id;
  const deLaVersion = version.variables.map((v) => v.id);
  await tx`DELETE FROM medicion_valores mv WHERE mv.medicion_id = ${medicionId} AND mv.categoria_id IS NULL
    AND NOT (mv.variable_id = ANY(${deLaVersion}))
    ${medicion.historica ? tx`` : tx`AND NOT EXISTS (SELECT 1 FROM indicador_variables iv WHERE iv.id = mv.variable_id AND iv.origen IN ('compartida', 'indicador'))`}`;
  const actuales = new Map(
    (await tx`SELECT variable_id, valor FROM medicion_valores WHERE medicion_id = ${medicionId} AND categoria_id IS NULL`).map((f) => [
      Number(f.variable_id),
      fr(f.valor),
    ]),
  );
  for (const v of variablesQueDigita(version, medicion.historica)) {
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
      // Lo digitado cabe en cuatro decimales: la fracción exacta solo la escribe el sistema.
      await tx`UPDATE medicion_valores SET valor = ${valor}, valor_exacto = NULL, reportado_por = ${usuarioId}, reportado_en = ${ahora}
        WHERE medicion_id = ${medicionId} AND variable_id = ${v.id} AND categoria_id IS NULL`;
    }
  }
}

/** «60 %» con la regla del periodo, o `null` sin resultado. */
export const resultadoEnTexto = (exacto: unknown, version: VersionDeCalculo, regla: Regla): string | null =>
  typeof exacto === "string" ? textoValor(deTexto(exacto), version.unidad, regla) : null;

/**
 * Lo que dejó un reporte; con `faltaDato`, quien mide ya entregó lo suyo y la medición espera un valor ajeno («Reportar lo
 * mío», anexo 14C, §3.1): el resultado sale cuando llegue.
 */
export type ResultadoDeReporte =
  | { ok: true; estado: EstadoMedicion; semaforo: Semaforo | null; cumple: boolean | null; faltaDato: boolean }
  | { ok: false; confirmar: string };

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
 *
 * `valores` trae solo lo que la persona digita (`planDeReporte`): el antes y el después del evento llevan lo ajeno tal como
 * está a los dos lados. En una versión con variables ajenas, el primer reporte (no un histórico) deja también la marca
 * `reportada`: sin el dato no cambia ninguna columna calculada y, sin ella, «Reportar lo mío» tras «Guardar sin reportar»
 * lo mismo no dejaría el evento `reporte` (el que cuenta «Reportes a tiempo», F14C-DC41).
 */
export async function escribirReporte(
  tx: TransactionSql,
  ctx: Contexto,
  valores: Readonly<Record<string, Fraccion | null>>,
  c: { usuarioId: number; ahora: Date; primerEvento: TipoEvento },
): Promise<ReporteEscrito> {
  const { medicion: m, version } = ctx;
  const guardados = await valoresPorLetra(tx, m.id, version);
  const antes = enTexto(version, guardados);
  const despues = enTexto(version, { ...guardados, ...valores });
  const primera = !(await seReportoAlgunaVez(tx, m.id));
  await escribirValores(tx, { id: m.id, historica: m.historica === true }, version, valores, c.usuarioId, c.ahora);
  if (m.reportada_en === null || m.no_aplica === true) {
    await tx`UPDATE mediciones SET reportada_por = coalesce(reportada_por, ${c.usuarioId}), reportada_en = coalesce(reportada_en, ${c.ahora}),
        no_aplica = false, no_aplica_motivo = NULL
      WHERE id = ${m.id}`;
  }
  const conMotivo = m.no_aplica === true ? { motivo: m.no_aplica_motivo as string | null } : {};
  // Un histórico no espera lo ajeno ni cuenta para «Reportes a tiempo»: su evento no lleva la marca.
  const marca = (v: boolean) =>
    m.reportada_en === null && m.historica !== true && letrasAjenas(version.variables).length > 0 ? { reportada: v } : {};
  const detalle = {
    antes: { ...antes, noAplica: m.no_aplica === true, ...conMotivo, ...marca(false) },
    despues: { ...despues, noAplica: false, ...(m.no_aplica === true ? { motivo: null } : {}), ...marca(true) },
    ...(ctx.capacidad.sinMedidor ? { sinMedidor: true as const } : {}),
  };
  const r = await recalcularMedicion(tx, m.id, { ahora: c.ahora, actorId: c.usuarioId, evento: primera ? c.primerEvento : "correccion", detalle });
  return { r, primera, detalle };
}

/**
 * Las celdas y los «No aplica» de fila de una rejilla ya validada (`planDeRejilla`), con los candados tomados: la persona
 * escribe solo las celdas que llegaron (`escribirCelda`) y la lista con sus «No aplica»; nunca el total. Devuelve las
 * categorías que cambiaron, como las guarda el detalle (`detalleDeCategorias`).
 */
async function escribirCeldas(tx: TransactionSql, ctx: Contexto, plan: PlanDeRejilla, c: { usuarioId: number; ahora: Date }) {
  const m = ctx.medicion;
  for (const x of plan.cambios) await escribirCelda(tx, { id: m.id, indicadorId: ctx.indicador.id }, x.categoria.id, x.variable, x.despues, c);
  if (plan.filas.length > 0) await tx`UPDATE mediciones SET categorias = ${tx.json(plan.lista as never)} WHERE id = ${m.id}`;
  return detalleDeCategorias(listaDe(m) ?? [], plan.cambios, plan.filas);
}

/**
 * Escribe el reporte de una rejilla ya validado (`planDeRejilla`, anexo 14C §5.4 y §5.5), con los candados tomados: las celdas
 * que llegaron y los «No aplica» de fila; el total, que escribe el sistema sin usuario (`escribirTotal`) con la suma de las
 * filas que aplican, o ninguno si espera un dato; la marca de reportada (quién y cuándo, la primera vez); y el «No aplica»
 * de la medición: con todas las filas «No aplica», el del sistema (`MOTIVO_TODAS_NO_APLICAN`), y si no, ninguno (el
 * siguiente reporte con una fila medida quita ese y el de una persona, como quita «no aplica» cualquier reporte). Después
 * recalcula; el detalle del evento lleva el total a los dos lados y, en `categorias`, cada celda y cada «No aplica» de fila que
 * cambió, aunque el total quede igual.
 */
async function escribirReporteDeRejilla(
  tx: TransactionSql,
  ctx: Contexto,
  plan: PlanDeRejilla,
  c: { usuarioId: number; ahora: Date },
): Promise<ReporteEscrito & { faltaDato: boolean }> {
  const { medicion: m, version } = ctx;
  const t = plan.total!;
  const guardados = await valoresPorLetra(tx, m.id, version);
  const primera = !(await seReportoAlgunaVez(tx, m.id));
  const categorias = await escribirCeldas(tx, ctx, plan, c);
  const total = t.clase === "total" ? t.valores : null;
  await escribirTotal(tx, m.id, version, total, c.ahora);
  const ninguna = t.clase === "ninguna_aplica";
  const motivo = ninguna ? MOTIVO_TODAS_NO_APLICAN : null;
  await tx`UPDATE mediciones SET reportada_por = coalesce(reportada_por, ${c.usuarioId}), reportada_en = coalesce(reportada_en, ${c.ahora}),
      no_aplica = ${ninguna}, no_aplica_motivo = ${motivo}
    WHERE id = ${m.id}`;
  const motivoAntes = m.no_aplica === true ? ((m.no_aplica_motivo as string | null) ?? null) : null;
  const conMotivo = (v: string | null) => (motivoAntes !== motivo ? { motivo: v } : {});
  const marca = (v: boolean) => (m.reportada_en === null && letrasAjenas(version.variables).length > 0 ? { reportada: v } : {});
  const detalle = {
    antes: { ...enTexto(version, guardados), noAplica: m.no_aplica === true, ...conMotivo(motivoAntes), ...marca(false) },
    despues: { ...enTexto(version, total ?? {}), noAplica: ninguna, ...conMotivo(motivo), ...marca(true) },
    ...(categorias.length > 0 ? { categorias } : {}),
    ...(ctx.capacidad.sinMedidor ? { sinMedidor: true as const } : {}),
  };
  const r = await recalcularMedicion(tx, m.id, { ahora: c.ahora, actorId: c.usuarioId, evento: primera ? "reporte" : "correccion", detalle });
  return { r, primera, detalle, faltaDato: t.clase === "espera" };
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
 *
 * Una medición desagregada (con lista) se reporta por su rejilla, con las celdas, la lista y el total en esta misma
 * transacción antes de recalcular (`escribirReporteDeRejilla`); su «Guardar sin reportar» escribe solo las celdas y los «No
 * aplica» de fila que llegaron, nunca el total, y su bitácora lleva las categorías que cambiaron.
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
    const sinMedidor = ctx.capacidad.sinMedidor ? { sinMedidor: true } : {};
    const sinCambios = () => ({
      ok: true as const,
      estado: m.estado as EstadoMedicion,
      semaforo: (m.semaforo as Semaforo | null) ?? null,
      cumple: cumpleDeFila({ cumple: (m.cumple as boolean | null | undefined) ?? null, semaforo: (m.semaforo as Semaforo | null) ?? null }),
      // Sin reportar, lo que falta es lo propio, no el dato.
      faltaDato: false,
    });
    if (d.parcial && plan.rejilla) {
      const categorias = await escribirCeldas(tx, ctx, plan.rejilla, { usuarioId: sesion.usuarioId, ahora });
      if (categorias.length > 0) {
        await registrarAuditoria(tx, {
          usuarioId: sesion.usuarioId,
          accion: "medicion_guardada",
          entidad: "medicion",
          entidadId: m.id,
          detalle: { ...base, categorias, ...sinMedidor },
        });
      }
      return sinCambios();
    }
    if (d.parcial) {
      const guardados = await valoresPorLetra(tx, m.id, version);
      const antes = enTexto(version, guardados);
      const despues = enTexto(version, { ...guardados, ...plan.valores });
      if (JSON.stringify(antes) !== JSON.stringify(despues)) {
        await escribirValores(tx, { id: m.id, historica: false }, version, plan.valores, sesion.usuarioId, ahora);
        await registrarAuditoria(tx, {
          usuarioId: sesion.usuarioId,
          accion: "medicion_guardada",
          entidad: "medicion",
          entidadId: m.id,
          detalle: { ...base, antes, despues, ...sinMedidor },
        });
      }
      return sinCambios();
    }

    const quien = { usuarioId: sesion.usuarioId, ahora };
    const escrito: ReporteEscrito & { faltaDato?: boolean } = plan.rejilla
      ? await escribirReporteDeRejilla(tx, ctx, plan.rejilla, quien)
      : await escribirReporte(tx, ctx, plan.valores, { ...quien, primerEvento: "reporte" });
    const { r, primera, detalle } = escrito;
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
    const faltaDato =
      escrito.faltaDato ??
      (r.resultado === null && letrasAjenas(version.variables).length > 0 && faltanAjenas(version, await valoresPorLetra(tx, m.id, version)));
    return { ok: true as const, estado: r.estado, semaforo: r.despues, cumple: r.cumple, faltaDato };
  });
}

/**
 * El motivo de «no aplica» de una persona: de 5 a 500 caracteres y ninguno de los que usa el sistema (`MOTIVOS_DEL_SISTEMA`,
 * sin distinguir mayúsculas), que reconoce por su motivo el «No aplica» que puso y lo quita cuando deja de ser cierto.
 */
export function motivoValido(motivo: string): string {
  const m = typeof motivo === "string" ? motivo.trim() : "";
  if (m.length < 5) throw new ErrorIndicador("El motivo debe tener al menos 5 caracteres");
  if (m.length > 500) throw new ErrorIndicador("El motivo no puede pasar de 500 caracteres");
  const comparable = m.toLocaleLowerCase("es");
  if (MOTIVOS_DEL_SISTEMA.some((r) => r.toLocaleLowerCase("es") === comparable)) throw new ErrorIndicador(MOTIVO_RESERVADO);
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
 * digitado. Un histórico no: se corrige en la tabla del año. Uno que puso el sistema (con uno de `MOTIVOS_DEL_SISTEMA`)
 * tampoco: lo quita la propagación cuando su fuente cambia (`NO_APLICA_DEL_SISTEMA`).
 */
export async function quitarNoAplica(sesion: SesionFlujo, medicionId: number, opciones?: Opciones): Promise<void> {
  if (!puede(sesion, "indicadores.medir")) throw new ErrorPermiso();
  const sql = opciones?.sql ?? obtenerSql();
  const ahora = opciones?.ahora ?? new Date();
  const sinMarca = (m: Record<string, unknown>) => {
    if (m.no_aplica !== true) throw new ErrorIndicador("La medición no está marcada «No aplica»");
    if (MOTIVOS_DEL_SISTEMA.includes(m.no_aplica_motivo as string)) throw new ErrorIndicador(NO_APLICA_DEL_SISTEMA);
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

/** «noviembre de 2026» → «Noviembre de 2026». */
export const conMayuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
