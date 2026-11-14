/**
 * La ficha activa de un cálculo automático y la meta que rige hoy (anexo 14B, §6): «una sola meta». La importan Vigencia,
 * Distribución y Configuración documental, y a Vigencia la importa el camino de los cálculos (`calculos.ts`): por eso
 * este módulo lee `indicadores`, `indicador_versiones` e `indicador_metas` por SQL directo y no importa los cálculos, las
 * mediciones, Vigencia, Distribución ni Configuración documental.
 */
import type { PendingQuery, Row } from "postgres";
import { obtenerSql, type Cliente } from "@/db/cliente";
import { puedeVerIndicador, type SujetoVisibilidad } from "@/lib/alcance";
import type { Indicador } from "@/lib/indicadores-documentales/metas";
import { CALCULOS, CLAVES_DE_CALCULO, type AlcanceDeCalculo, type ClaveDeCalculo } from "@/lib/indicadores/calculos/registro";
import { periodoQueContiene } from "@/lib/indicadores/periodos";
import { PERIODICIDADES } from "@/lib/indicadores/tipos";
import { zonaHoraria } from "@/lib/zona-horaria";

/** No confundir con `fichaDeCalculo` (`src/lib/indicadores/reporte.ts`), que arma el árbol de la fórmula. */
export type FichaActivaDelCalculo = { indicadorId: number; codigo: string; meta: string | null };

type Opciones = { sql?: Cliente; ahora?: Date };

/** Los campos de Configuración documental que fija la ficha de un cálculo de la entidad. */
export type CampoDeMetaDocumental =
  | "dentroPlazoPct"
  | "aprobacionDias"
  | "vencidos"
  | "acusesPct"
  | "externosPct"
  | "etapasPlazoPct"
  | "umbralConformidadPct";

const CAMPO_DE_TARJETA: Record<Indicador, CampoDeMetaDocumental> = {
  dentro_plazo: "dentroPlazoPct",
  aprobacion: "aprobacionDias",
  vencidos: "vencidos",
  acuses: "acusesPct",
  conformidad: "umbralConformidadPct",
  externos: "externosPct",
  etapas: "etapasPlazoPct",
};

type FilaDeFicha = FichaActivaDelCalculo & { calculo: ClaveDeCalculo; procesoId: number };

/**
 * Las fichas activas que cumplen `donde` (sobre `indicadores i`), con la meta que rige hoy. La versión vigente es la
 * aprobada de mayor número, y su meta, la que rige el periodo en curso de su periodicidad: la meta programada del periodo
 * la reemplaza solo si la versión tiene meta. Es la regla de `reglaDelPeriodo` (`mediciones.ts`), repetida aquí en SQL
 * porque este módulo no puede importarla; la usan todas las lecturas de este módulo.
 */
async function fichasConSuMeta(sql: Cliente, donde: PendingQuery<Row[]>, ahora: Date): Promise<FilaDeFicha[]> {
  const zona = zonaHoraria();
  const enCurso = PERIODICIDADES.map((p) => sql`WHEN ${p} THEN ${periodoQueContiene(p, ahora, zona).clave}`);
  const filas = await sql`
    SELECT i.id, i.codigo, i.calculo, i.proceso_id,
           CASE WHEN v.meta IS NOT NULL AND im.id IS NOT NULL THEN im.meta ELSE v.meta END AS meta
    FROM indicadores i
    JOIN LATERAL (
      SELECT v.meta, v.periodicidad FROM indicador_versiones v
      WHERE v.indicador_id = i.id AND v.estado = 'aprobada' ORDER BY v.numero DESC LIMIT 1
    ) v ON true
    LEFT JOIN indicador_metas im
      ON im.indicador_id = i.id AND im.periodo = (CASE v.periodicidad ${enCurso.reduce((a, b) => sql`${a} ${b}`)} END)
    WHERE i.estado = 'activo' AND ${donde}`;
  return filas.map((f) => ({
    indicadorId: Number(f.id),
    codigo: f.codigo as string,
    meta: f.meta === null ? null : String(f.meta),
    calculo: f.calculo as ClaveDeCalculo,
    procesoId: Number(f.proceso_id),
  }));
}

const soloFicha = (f: FilaDeFicha): FichaActivaDelCalculo => ({ indicadorId: f.indicadorId, codigo: f.codigo, meta: f.meta });

/**
 * Las fichas activas de esos cálculos con ese alcance (con alcance «proceso», las de ese proceso), en una consulta; a lo
 * sumo una por cálculo (`indicadores_calculo_unico`), con la meta que rige hoy (`fichasConSuMeta`).
 */
export async function fichasActivasDeLosCalculos(
  sql: Cliente,
  c: { claves: readonly ClaveDeCalculo[]; alcance: AlcanceDeCalculo; procesoId: number | null; ahora: Date },
): Promise<Map<ClaveDeCalculo, FichaActivaDelCalculo>> {
  if (c.claves.length === 0 || (c.alcance === "proceso" && c.procesoId === null)) return new Map();
  const donde = sql`i.calculo IN ${sql([...c.claves])} AND i.calculo_alcance = ${c.alcance}
    AND ${c.alcance === "proceso" ? sql`i.proceso_id = ${c.procesoId}` : sql`true`}`;
  return new Map((await fichasConSuMeta(sql, donde, c.ahora)).map((f) => [f.calculo, soloFicha(f)]));
}

/**
 * Las fichas activas de alcance «proceso» de un cálculo, de todos los procesos, en una consulta: la llave es el proceso
 * (a lo sumo una por proceso, `indicadores_calculo_unico`), con la meta que rige hoy. Las filas de «Dentro del plazo, por
 * proceso» toman de aquí la meta de su proceso.
 */
export async function fichasPorProcesoDelCalculo(
  sql: Cliente,
  c: { clave: ClaveDeCalculo; ahora: Date },
): Promise<Map<number, FichaActivaDelCalculo>> {
  const donde = sql`i.calculo = ${c.clave} AND i.calculo_alcance = 'proceso'`;
  return new Map((await fichasConSuMeta(sql, donde, c.ahora)).map((f) => [f.procesoId, soloFicha(f)]));
}

/** La ficha activa de ese cálculo y alcance, con la meta que rige su periodo en curso; `null` si no la hay. */
export async function fichaActivaDelCalculo(
  sql: Cliente,
  c: { clave: ClaveDeCalculo; alcance: AlcanceDeCalculo; procesoId: number | null; ahora: Date },
): Promise<FichaActivaDelCalculo | null> {
  const fichas = await fichasActivasDeLosCalculos(sql, { claves: [c.clave], alcance: c.alcance, procesoId: c.procesoId, ahora: c.ahora });
  return fichas.get(c.clave) ?? null;
}

/**
 * El umbral de conformidad en puntos de uso (§6): la meta que rige hoy la ficha activa de `conformidad_fecha` de la
 * entidad, si la tiene; si no, el de Configuración documental. El código de la ficha solo para quien puede verla: a los
 * demás, `null`, y la meta se aplica igual.
 */
export async function metaDeConformidad(
  umbralDeConfiguracion: number,
  sujeto: SujetoVisibilidad,
  opciones?: Opciones,
): Promise<{ umbral: number; ficha: string | null }> {
  const sql = opciones?.sql ?? obtenerSql();
  const ficha = await fichaActivaDelCalculo(sql, {
    clave: "conformidad_fecha",
    alcance: "entidad",
    procesoId: null,
    ahora: opciones?.ahora ?? new Date(),
  });
  if (!ficha || ficha.meta === null) return { umbral: umbralDeConfiguracion, ficha: null };
  const visible = await puedeVerIndicador(ficha.indicadorId, sujeto, { sql });
  return { umbral: Number(ficha.meta), ficha: visible ? ficha.codigo : null };
}

/** Los cálculos que gobiernan una tarjeta de Vigencia (`documental` en el registro). */
const CALCULOS_DOCUMENTALES = CLAVES_DE_CALCULO.filter((k) => CALCULOS[k].documental !== null);

/** El campo que fija una ficha: su código y la meta que rige hoy. */
export type MetaFijada = { codigo: string; meta: string };

/**
 * Los campos de Configuración documental que fija una ficha (§6): de cada cálculo con tarjeta, el código de su ficha
 * activa de la entidad y la meta que rige hoy, si la tiene. La pantalla muestra esa meta en solo lectura y el guardado
 * conserva el valor guardado del campo.
 */
export async function metasQueFijaUnaFicha(opciones?: Opciones): Promise<Partial<Record<CampoDeMetaDocumental, MetaFijada>>> {
  const sql = opciones?.sql ?? obtenerSql();
  const fichas = await fichasActivasDeLosCalculos(sql, {
    claves: CALCULOS_DOCUMENTALES,
    alcance: "entidad",
    procesoId: null,
    ahora: opciones?.ahora ?? new Date(),
  });
  const salida: Partial<Record<CampoDeMetaDocumental, MetaFijada>> = {};
  for (const [clave, ficha] of fichas) {
    const tarjeta = CALCULOS[clave].documental;
    if (tarjeta !== null && ficha.meta !== null) salida[CAMPO_DE_TARJETA[tarjeta]] = { codigo: ficha.codigo, meta: ficha.meta };
  }
  return salida;
}
