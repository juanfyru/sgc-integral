/**
 * Las tareas de los indicadores en «Mis tareas» (spec 14 §10.1, F14-DC21 y F14-DC32) y la insignia de la entrada
 * «Indicadores»: reportar y analizar las mediciones a cargo de la persona, responder las observaciones sin respuesta,
 * aprobar las fichas que le tocan y retomar las devueltas. Una consulta por tipo de tarea, acotada a la persona con las
 * reglas de `src/lib/alcance.ts` (`responsableDe`, el criterio de `responsablesDeMedir` y `responsablesDeAnalizar`;
 * `esAprobadorDe`, el de `aprobadoresDeFicha`; y `filtroIndicadores`).
 *
 * Solo lee: corre en cada página del cascarón y no abre periodos. Los abre la pasada de vencimientos que el propio cascarón
 * dispara (`after()`, cada diez minutos como mucho) y las páginas del módulo: una tarea nueva aparece, a lo sumo, en la
 * carga siguiente. No son tarea los históricos, los «no aplica», las mediciones cerradas, las de otra periodicidad (nadie
 * puede reportarlas) ni las de un indicador retirado; una observación sí, aunque su medición esté cerrada o el indicador
 * retirado: se sigue respondiendo (spec §8.6).
 */
import type { Row } from "postgres";
import { obtenerSql, type Cliente } from "@/db/cliente";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { esAprobadorDe, filtroIndicadores, responsableDe, type Responsabilidad } from "@/lib/alcance";
import { periodoDe, type Periodo } from "@/lib/indicadores-documentales/periodo";
import { analisisCompleto, analisisExigido, cumpleDeMedicion } from "@/lib/indicadores/estados";
import { versionQueRigeEntre } from "@/lib/indicadores/periodos";
import type { Periodicidad, Semaforo } from "@/lib/indicadores/tipos";
import { puede } from "@/lib/permisos";
import type { Tarea } from "@/lib/tareas";
import { zonaHoraria } from "@/lib/zona-horaria";
import { enlaceDeVersion } from "./aprobacion";
import { analisisDe, conMayuscula, esDeOtraPeriodicidad } from "./mediciones";
import { enlaceDeObservaciones } from "./observaciones";

/** Lo que le falta a una medición ordinaria abierta: el reporte (los datos o el soporte obligatorio) o el análisis. */
export type Falta = "reporte" | "analisis";

/**
 * Las columnas de `mediciones m` e `indicadores i` que lee `queFalta`, con las versiones aprobadas del indicador (de mayor
 * a menor número, el orden de `versionQueRigeEntre`) y si tiene algún soporte en la misma fila: el costo en sentencias no
 * depende de cuántas haya.
 */
export const columnasDePendiente = (sql: Cliente) =>
  sql`m.id, m.indicador_id, m.periodo, m.vence_en, m.reportada_en, m.semaforo, m.cumple, m.incumplimiento_repetido, m.analisis, m.causa,
    m.accion_propuesta, i.soporte_obligatorio,
    EXISTS (SELECT 1 FROM archivos pa WHERE pa.contexto = 'medicion' AND pa.contexto_id = m.id) AS con_soporte,
    (SELECT coalesce(json_agg(json_build_object('rigeDesde', pv.rige_desde, 'periodicidad', pv.periodicidad, 'nombre', pv.nombre)
        ORDER BY pv.numero DESC), '[]'::json)
      FROM indicador_versiones pv WHERE pv.indicador_id = m.indicador_id AND pv.estado = 'aprobada') AS versiones`;

/** Una medición ordinaria por completar, para un `WHERE` sobre `mediciones m` e `indicadores i`. */
export const esPendiente = (sql: Cliente) => sql`m.estado = 'abierta' AND NOT m.historica AND NOT m.no_aplica AND i.estado = 'activo'`;

/**
 * `falta` es lo primero que falta (con los datos, el análisis; si no, el reporte); `faltaSoporte`, que además falta el
 * soporte obligatorio de una medición ya reportada, que es de quien mide aunque falte el análisis.
 */
export type Pendiente = { falta: Falta; faltaSoporte: boolean; periodo: Periodo; nombre: string | null };

type VersionDePendiente = { rigeDesde: string | null; periodicidad: Periodicidad | null; nombre: string | null };

/**
 * Lo que le falta a cada medición de `filas` (leídas con `columnasDePendiente`): con los datos, el análisis exigido si no
 * está (la regla del estado guardado, `analisisCompleto`) y el soporte obligatorio si no lo tiene; sin ellos, el reporte.
 * Con el periodo y el nombre de la versión que lo rige. Sin las de otra periodicidad (`esDeOtraPeriodicidad`): no se
 * miden. No consulta nada.
 */
export function queFalta(filas: readonly Row[]): Map<number, Pendiente> {
  const salida = new Map<number, Pendiente>();
  const zona = zonaHoraria();
  for (const f of filas) {
    const clave = f.periodo as string;
    const periodo = periodoDe(clave, zona);
    const version = periodo ? versionQueRigeEntre(f.versiones as VersionDePendiente[], periodo, zona) : null;
    if (!periodo || !version || esDeOtraPeriodicidad(clave, version)) continue;
    const exigido = analisisExigido({
      semaforo: (f.semaforo as Semaforo | null) ?? null,
      cumple: cumpleDeMedicion(f),
      repetido: f.incumplimiento_repetido === true,
      historica: false,
      noAplica: false,
    });
    const conDatos = f.reportada_en !== null;
    const falta: Falta = conDatos && !analisisCompleto(exigido, analisisDe(f)) ? "analisis" : "reporte";
    const faltaSoporte = conDatos && f.soporte_obligatorio === true && f.con_soporte !== true;
    salida.set(Number(f.id), { falta, faltaSoporte, periodo, nombre: version.nombre });
  }
  return salida;
}

const SIN_RESPONSABLE = "Sin responsable: designe a alguien";
const FALTA_SOPORTE = "Falta el soporte obligatorio";

/**
 * Las de reportar y analizar: las mediciones de las que la persona es responsable de lo que les falta. Con el análisis y
 * el soporte pendientes, las dos: «Analizar» a quien analiza y «Reportar» a quien mide.
 */
async function deMediciones(sql: Cliente, sesion: SesionFlujo): Promise<Tarea[]> {
  const filas = await sql`SELECT * FROM (
      SELECT ${columnasDePendiente(sql)}, i.codigo, p.nombre AS proceso,
        ${responsableDe(sql, sesion, "mide")} AS mide, ${responsableDe(sql, sesion, "analiza")} AS analiza
      FROM mediciones m JOIN indicadores i ON i.id = m.indicador_id JOIN procesos p ON p.id = i.proceso_id
      WHERE ${esPendiente(sql)} AND ${filtroIndicadores(sql, sesion)}
    ) x
    WHERE x.mide IS NOT NULL OR x.analiza IS NOT NULL
    ORDER BY x.vence_en, x.id`;
  const pendientes = queFalta(filas);
  const tareas: Tarea[] = [];
  for (const f of filas) {
    const p = pendientes.get(Number(f.id));
    if (!p) continue;
    const codigo = f.codigo as string;
    const indicador = p.nombre ? `${codigo} ${p.nombre}` : codigo;
    const tarea = (falta: Falta, quien: Responsabilidad, detalle: string): Tarea => ({
      id: `${falta === "reporte" ? "medir" : "analizar"}:${f.id}`,
      modulo: "indicadores",
      titulo: `${falta === "reporte" ? "Reportar" : "Analizar"} ${indicador}, ${p.periodo.etiqueta}`,
      detalle: quien === "respaldo" ? SIN_RESPONSABLE : detalle,
      vence: new Date(f.vence_en as string),
      enlace: `/indicadores/${encodeURIComponent(codigo)}/reportar/${encodeURIComponent(f.periodo as string)}`,
    });
    const mide = f.mide as Responsabilidad | null;
    const analiza = f.analiza as Responsabilidad | null;
    const reportada = f.reportada_en !== null;
    if (p.falta === "reporte" && mide) tareas.push(tarea("reporte", mide, reportada ? FALTA_SOPORTE : (f.proceso as string)));
    if (p.falta === "analisis" && p.faltaSoporte && mide) tareas.push(tarea("reporte", mide, FALTA_SOPORTE));
    if (p.falta === "analisis" && analiza) tareas.push(tarea("analisis", analiza, f.proceso as string));
  }
  return tareas;
}

/** Las observaciones sin respuesta de los indicadores que la persona analiza, salvo las suyas. */
async function deObservaciones(sql: Cliente, sesion: SesionFlujo): Promise<Tarea[]> {
  const filas = await sql`SELECT o.id, m.periodo, i.codigo, u.nombre AS autor
    FROM medicion_observaciones o
    JOIN mediciones m ON m.id = o.medicion_id
    JOIN indicadores i ON i.id = m.indicador_id
    JOIN usuarios u ON u.id = o.usuario_id
    WHERE o.responde_a IS NULL AND o.usuario_id <> ${sesion.usuarioId}
      AND NOT EXISTS (SELECT 1 FROM medicion_observaciones r WHERE r.responde_a = o.id)
      AND i.estado IN ('activo', 'retirado') AND ${filtroIndicadores(sql, sesion)}
      AND ${responsableDe(sql, sesion, "analiza")} IS NOT NULL
    ORDER BY o.creado_en, o.id`;
  const zona = zonaHoraria();
  return filas.map((f) => {
    const codigo = f.codigo as string;
    const periodo = f.periodo as string;
    return {
      id: `observacion:${f.id}`,
      modulo: "indicadores" as const,
      titulo: `Responder la observación de ${f.autor as string} en ${codigo}`,
      detalle: conMayuscula(periodoDe(periodo, zona)?.etiqueta ?? periodo),
      vence: null,
      enlace: enlaceDeObservaciones(codigo, periodo),
    };
  });
}

/**
 * Las fichas por aprobar de las que la persona es aprobadora (spec §7.6.2). Sin `filtroIndicadores`, que esconde los
 * borradores: el aprobador de una primera ficha la ve aunque el indicador aún no exista para él (spec §6.4).
 */
async function deFichasPorAprobar(sql: Cliente, sesion: SesionFlujo): Promise<Tarea[]> {
  if (!puede(sesion, "indicadores.aprobar")) return [];
  const filas = await sql`SELECT fv.id, fv.numero, fv.nombre, i.codigo
    FROM indicador_versiones fv JOIN indicadores i ON i.id = fv.indicador_id
    WHERE fv.estado = 'por_aprobar' AND i.estado IN ('borrador', 'activo') AND ${esAprobadorDe(sql, sesion)}
    ORDER BY fv.elaborada_en, fv.id`;
  return filas.map((f) => ({
    id: `ficha:${f.id}`,
    modulo: "indicadores" as const,
    titulo: `Aprobar la ficha de ${f.codigo as string}`,
    detalle: (f.nombre as string | null) ?? null,
    vence: null,
    enlace: enlaceDeVersion(f.codigo as string, Number(f.numero)),
  }));
}

/** Las fichas devueltas que la persona elaboró: la última firma «Elaboró» de la versión (devolver la borra de la versión). */
async function deFichasDevueltas(sql: Cliente, sesion: SesionFlujo): Promise<Tarea[]> {
  if (!puede(sesion, "indicadores.administrar")) return [];
  const filas = await sql`SELECT fv.id, fv.nombre, i.codigo
    FROM indicador_versiones fv JOIN indicadores i ON i.id = fv.indicador_id
    WHERE fv.estado = 'borrador' AND fv.nota_devolucion IS NOT NULL AND i.estado IN ('borrador', 'activo')
      AND (SELECT f.usuario_id FROM firmas f WHERE f.indicador_version_id = fv.id AND f.firma = 'elaboro'
        ORDER BY f.id DESC LIMIT 1) = ${sesion.usuarioId}
    ORDER BY fv.actualizado_en, fv.id`;
  return filas.map((f) => ({
    id: `ficha-devuelta:${f.id}`,
    modulo: "indicadores" as const,
    titulo: `Ficha devuelta: ${f.codigo as string}`,
    detalle: (f.nombre as string | null) ?? null,
    vence: null,
    enlace: `/indicadores/${encodeURIComponent(f.codigo as string)}/editar`,
  }));
}

/**
 * Las tareas de los indicadores de la persona y `vencidas`, la insignia de «Indicadores» (F14-DC32): las mediciones a su
 * cargo, por reportar o por analizar, que pasaron su fecha límite (una medición cuenta una vez aunque tenga las dos).
 */
export async function tareasDeIndicadores(
  sesion: SesionFlujo,
  opciones?: { sql?: Cliente; ahora?: Date },
): Promise<{ tareas: Tarea[]; vencidas: number }> {
  const sql = opciones?.sql ?? obtenerSql();
  const ahora = opciones?.ahora ?? new Date();
  const [mediciones, observaciones, porAprobar, devueltas] = await Promise.all([
    deMediciones(sql, sesion),
    deObservaciones(sql, sesion),
    deFichasPorAprobar(sql, sesion),
    deFichasDevueltas(sql, sesion),
  ]);
  const vencidas = new Set(
    mediciones.filter((t) => t.vence !== null && t.vence.getTime() < ahora.getTime()).map((t) => t.id.slice(t.id.indexOf(":") + 1)),
  ).size;
  return { tareas: [...mediciones, ...observaciones, ...porAprobar, ...devueltas], vencidas };
}
