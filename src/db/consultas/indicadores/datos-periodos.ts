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
 *   (`periodoQueSePide`), salvo el periodo sin categorías (`periodoSinCategorias`, complemento de la 14C §5), que nadie
 *   puede reportar: es aviso (al nacer) y tarea (`tareasDeCategoriasPendientes`) de quien administra.
 *
 * - **Cerrar** lo hace el cierre del mes (`cierre.ts`); reabrir, la reapertura en cascada (`reapertura.ts`, anexo 14C §3.5);
 *   «Cerrar de nuevo» un periodo reabierto, `cerrarDeNuevoElDato`.
 * - **Las categorías** de un periodo de un dato con dimensión se fijan al abrirlo; uno pendiente las actualiza quien
 *   administra (`actualizarCategoriasDelDato`), y uno que nació sin ninguna no se reporta vacío (`PERIODO_SIN_CATEGORIAS`):
 *   al recibirlas vuelve a su responsable con el plazo contado desde ese día.
 *
 * Candados: el dato `FOR SHARE` y después el periodo `FOR UPDATE` (o, al abrir, las filas del maestro `FOR KEY SHARE`), en
 * una transacción por dato: los indicadores que lo usan se leen sin candado, porque una transacción no bloquea más de un
 * indicador. Quien edita el dato (`datos.ts`) lo toma `FOR UPDATE`. El cierre y la reapertura en cascada toman los periodos
 * `FOR UPDATE`, por id, sin la fila del dato.
 *
 * Módulo liviano: lo importan `tareas.ts`, `vencimientos.ts`, `datos-vencidos.ts`, la propagación y el cierre, así que no
 * importa `lectura`, `fichas`, `aprobacion`, `operacion`, `tareas` ni `constancias`.
 */
import type { TransactionSql } from "postgres";
import { obtenerSql, type Cliente } from "@/db/cliente";
import { registrarAuditoria } from "@/db/consultas/admin";
import { enTransaccion, type SesionFlujo } from "@/db/consultas/flujo/contrato";
import { crearNotificacion } from "@/db/consultas/notificaciones";
import { adminsActivos } from "@/db/consultas/tramites";
import { filtroDatos, puedeReportarDato, puedeVerDato, responsabilidadEnDato, type SujetoVisibilidad } from "@/lib/alcance";
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
import { SIN_PUNTOS_DE_MILES, tienePuntoDeMiles } from "@/lib/indicadores/miles";
import { leerValor, valorEnTexto, type VariableDeCaptura } from "@/lib/indicadores/reporte";
import { rutaDeDato } from "@/lib/indicadores/rutas";
import { numeroExacto } from "@/lib/indicadores/semaforo";
import { ErrorIndicador, PERIODO_SIN_CATEGORIAS, SIN_RESPONSABLE, type Periodicidad } from "@/lib/indicadores/tipos";
import { ErrorPermiso, puede } from "@/lib/permisos";
import type { Tarea } from "@/lib/tareas";
import { fechaLimite } from "@/lib/tramites/plazos";
import { zonaHoraria } from "@/lib/zona-horaria";
import { serializarCierreYReapertura } from "./candado-del-cierre";
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
  /** Se reabrió alguna vez (anexo 14C, §3.5): sin cerrar, «Cerrar de nuevo» lo vuelve a cerrar. */
  reabierto: boolean;
  /** Pendiente y se pide (`periodoQueSePide`): uno que ya nadie pide no es tarea de nadie ni está «por reportar». */
  sePide: boolean;
};

export const PERIODO_NO_EXISTE = "El periodo del dato no existe";
const CERRADO = "El periodo está cerrado: lo reabre el Administrador del SGC";
const SIN_CAMBIOS = "No hay cambios que corregir";
const FORMULARIO_CAMBIO = "El formulario no corresponde a este periodo: recargue la página";
const SOLO_REABIERTO = "Solo se cierra de nuevo un periodo reabierto";
/**
 * Las pantallas del dato muestran sus cifras con punto de miles («1.749»), y el intérprete compartido de los valores lee el
 * punto como decimal: «1.600» sería 1,6. En los formularios del dato, un valor con esa forma (grupos de tres cifras
 * separados por puntos, también uno solo) se rechaza antes de leerlo.
 */
export { SIN_PUNTOS_DE_MILES };
const SIN_DIMENSION = "Este dato no se reporta por categorías";
const SOLO_PENDIENTE = "Solo se actualizan las categorías de un periodo que aún no se ha reportado";

/**
 * Lo que se pide de un dato, para un `WHERE` sobre `variable_valores vv` (anexo 14C, §4.3): un periodo pendiente que alguna
 * medición necesita. Lo sabe `loQuePiden` y lo deja escrito `asegurarDe` en `se_pide`: el pendiente que ya ningún indicador
 * necesita y que se conserva solo porque tiene historial o un soporte sigue existiendo, pero no se pide, como la constancia
 * de la 14B (`constanciaQueSePide`). Lo comparten la tarea, sus recordatorios (`datos-vencidos.ts`), el número de la pestaña
 * y el estado de la lista y de la página del dato.
 */
export const periodoQueSePide = (sql: Cliente) => sql`(vv.estado = 'pendiente' AND vv.se_pide)`;

/**
 * Un periodo de un dato con dimensión cuya lista de categorías está vacía (nació antes de que existieran; complemento de la
 * 14C, §5), para un `WHERE` sobre `variable_valores vv`. Nadie puede reportarlo: mientras se pida, es aviso y tarea de quien
 * administra (`tareasDeCategoriasPendientes`), no de su responsable. Lo que se le pide al responsable (la tarea, los
 * recordatorios, el vencido, el escalamiento, el número de la pestaña y «por reportar» en la lista) es `periodoQueSePide` sin
 * él; la página del dato lo sigue mostrando como lo que se pide, con el aviso en lugar del formulario.
 */
export const periodoSinCategorias = (sql: Cliente) => sql`(vv.categorias IS NOT NULL AND jsonb_array_length(vv.categorias) = 0)`;

/** «El periodo octubre de 2026 del dato «…» no tiene categorías: …»: el aviso a quien administra, que no nombra un indicador. */
const avisoSinCategorias = (etiqueta: string, dato: string) =>
  `El periodo ${etiqueta} del dato «${dato}» no tiene categorías: actualícelas para que se pueda reportar`;

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
 * (`maestroDeCategorias`). El que nace con la lista vacía avisa, en la misma transacción, a cada Administrador del SGC activo
 * (`indicadores.dato_sin_categorias`, complemento de la 14C §5.1): solo quien lo insertó (`RETURNING`), así dos pasadas a la vez
 * avisan una sola vez.
 */
function asegurarDe(sql: Cliente, datoId: number, ahora: Date): Promise<{ abiertos: number; quitados: number }> {
  return enTransaccion(sql, async (tx) => {
    const [d] = await tx`SELECT id, nombre, periodicidad, plazo_reporte_dias, dimension_id FROM variables_compartidas WHERE id = ${datoId} FOR SHARE`;
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
      const vacios: Periodo[] = [];
      for (const p of nuevos) {
        const limite = fechaLimiteDeReporte(p, plazo, zona);
        const vence = limite.getTime() < ahora.getTime() ? fechaLimite(ahora, plazo, zona) : limite;
        const categorias = maestro === null ? null : listaDelPeriodo(maestro, p);
        const creada = await tx`INSERT INTO variable_valores (variable_id, periodo, desde, hasta, vence_en, categorias, creado_en)
          VALUES (${dato.id}, ${p.clave}, ${p.desde}, ${p.hasta}, ${vence}, ${categorias === null ? null : tx.json(categorias as never)}, ${ahora})
          ON CONFLICT DO NOTHING
          RETURNING id`;
        abiertos += creada.length;
        if (creada.length > 0 && categorias !== null && categorias.length === 0) vacios.push(p);
      }
      if (vacios.length > 0) {
        const admins = await adminsActivos({ sql: tx });
        for (const p of vacios) {
          for (const usuarioId of admins) {
            await crearNotificacion(
              {
                usuarioId,
                tipo: "indicadores.dato_sin_categorias",
                titulo: avisoSinCategorias(p.etiqueta, d.nombre as string),
                enlace: rutaDeDato(dato.id),
                entidad: "dato_compartido",
                entidadId: dato.id,
              },
              tx,
            );
          }
        }
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
    reabierto: f.reabierto_en !== null && f.reabierto_en !== undefined,
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

/**
 * Un valor digitado, con las validaciones de una variable (spec §7.4); vacío, «falta». Antes, sin punto de miles
 * (`SIN_PUNTOS_DE_MILES`); `deCategoria` dice de cuál es, porque el formulario trae una por categoría.
 */
function leer(textoDigitado: string, v: VariableDeCaptura, deCategoria = false): Fraccion {
  if (tienePuntoDeMiles(textoDigitado)) throw new ErrorIndicador(deCategoria ? `${v.nombre}: ${SIN_PUNTOS_DE_MILES}` : SIN_PUNTOS_DE_MILES);
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
  // Un periodo que nació sin categorías (ninguna existía cuando terminó) no se reporta vacío: guardaría 0 sin que nadie digite.
  if (p.categorias.length === 0) throw new ErrorIndicador(PERIODO_SIN_CATEGORIAS);
  const pedidas = new Set(p.categorias.map((c) => String(c.id)));
  if ((d.valor ?? "").trim() !== "" || Object.keys(porCategoria).some((id) => !pedidas.has(id))) throw new ErrorIndicador(FORMULARIO_CAMBIO);
  let total = CERO;
  const guardado: Record<string, string> = {};
  for (const c of p.categorias) {
    const v = leer(porCategoria[String(c.id)] ?? "", captura(c.nombre), true);
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
 * (límites de captura, negativos, cuatro decimales; sin punto de miles) y, sin `confirmado`, no escribe nada y pide confirmar
 * un valor que se aleja del periodo anterior; la pregunta vuelve con el valor por el que se hizo (`valor`, el total como se
 * guarda). La confirmación vale para ese valor: con `confirmadoValor` (el que devuelve el formulario junto a la casilla), si
 * el valor enviado es otro, vuelve a preguntar; sin él (la semilla, los tests), `confirmado` vale para lo que llegue. Un
 * periodo cerrado no se toca: lo reabre el Administrador del SGC. El primer reporte deja
 * quién y cuándo y el evento `reporte`; una corrección (sin justificación) deja el evento `correccion` con el antes y el
 * después y marca el periodo corregido; el mismo valor otra vez no es una corrección. Sin responsable ni líder activos
 * (`sinMedidor`), el evento lo marca (`sinResponsable`).
 */
export async function reportarDato(
  sesion: SesionFlujo,
  d: { periodoId: number; valor?: string; porCategoria?: Record<string, string>; confirmado?: boolean; confirmadoValor?: string },
  opciones?: Opciones,
): Promise<{ ok: true; corregido: boolean } | { ok: false; confirmar: string; valor: string }> {
  if (!puede(sesion, "indicadores.medir")) throw new ErrorPermiso();
  const ahora = opciones?.ahora ?? new Date();
  return enTransaccion(opciones?.sql ?? obtenerSql(), async (tx) => {
    const p = await periodoBloqueado(tx, sesion, d.periodoId);
    if (p.estado === "cerrado") throw new ErrorIndicador(CERRADO);
    const { total, guardado } = leerReporte(p, d);
    const antes = p.estado === "reportado" ? p.guardado : null;
    if (antes && mismo(antes, guardado)) throw new ErrorIndicador(SIN_CAMBIOS);
    const confirmado = d.confirmado === true && (d.confirmadoValor === undefined || d.confirmadoValor === guardado.valor);
    if (!confirmado) {
      const confirmar = await confirmacion(tx, p, total);
      if (confirmar) return { ok: false as const, confirmar, valor: guardado.valor };
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

/**
 * «Actualizar categorías» de un periodo del dato (anexo 14C, §5.7: «cada periodo del dato guarda su lista de categorías como
 * una medición», §5.3): en un periodo **pendiente** de un dato con dimensión, quien administra añade al final de su lista las
 * categorías de la dimensión que hoy están activas y no estaban, en el orden del maestro; nada sale de la lista. Es la salida
 * del periodo que nació sin categorías (la dimensión se creó después de terminar) y de la sede que se registró tarde. Un
 * periodo reportado o cerrado no se actualiza. Sin nada que añadir, nada.
 *
 * Deja su evento en el historial del periodo: `correccion` (el `CHECK` de `variable_eventos` no tiene otro tipo para esto) con
 * `detalle.categorias.agregadas` (id y nombre) y sin antes ni después de valor, que es lo que lo distingue de la corrección de
 * un valor; no marca el periodo como corregido. Y su bitácora, `dato_categorias_actualizadas`.
 *
 * Si la lista estaba vacía (complemento de la 14C, §5.5), el periodo vuelve a su responsable con su plazo completo contado
 * desde `ahora` (el plazo no corrió mientras nadie podía reportarlo) y sus avisos empiezan otra vez, como el que vuelve a
 * pedirse en `asegurarDe`; la fecha nueva queda en el evento (`detalle.venceEn`).
 *
 * Candados, como al reportar: el dato `FOR SHARE`, el periodo `FOR UPDATE` y el maestro `FOR KEY SHARE`.
 */
export async function actualizarCategoriasDelDato(sesion: SesionFlujo, periodoId: number, opciones?: Opciones): Promise<{ agregadas: number }> {
  if (!puede(sesion, "indicadores.administrar")) throw new ErrorPermiso();
  if (!Number.isInteger(periodoId) || periodoId <= 0) throw new ErrorIndicador(PERIODO_NO_EXISTE);
  const ahora = opciones?.ahora ?? new Date();
  return enTransaccion(opciones?.sql ?? obtenerSql(), async (tx) => {
    const [d] = await tx`SELECT id, nombre, dimension_id, plazo_reporte_dias FROM variables_compartidas
      WHERE id = (SELECT variable_id FROM variable_valores WHERE id = ${periodoId}) FOR SHARE`;
    const [p] = await tx`SELECT * FROM variable_valores WHERE id = ${periodoId} FOR UPDATE`;
    if (!d || !p || Number(p.variable_id) !== Number(d.id)) throw new ErrorIndicador(PERIODO_NO_EXISTE);
    if (d.dimension_id === null || !Array.isArray(p.categorias)) throw new ErrorIndicador(SIN_DIMENSION);
    if (p.estado !== "pendiente") throw new ErrorIndicador(SOLO_PENDIENTE);
    const lista = p.categorias as CategoriaDeMedicion[];
    const ya = new Set(lista.map((c) => Number(c.id)));
    const agregadas: CategoriaDeMedicion[] = (await maestroDeCategorias(tx, Number(d.dimension_id), { bloquear: true }))
      .filter((c) => c.activo && !ya.has(c.id))
      .map((c) => ({ id: c.id, nombre: c.nombre, orden: c.orden, noAplica: null }));
    if (agregadas.length === 0) return { agregadas: 0 };
    const venceEn = lista.length === 0 ? fechaLimite(ahora, Number(d.plazo_reporte_dias), zonaHoraria()) : null;
    await tx`UPDATE variable_valores SET categorias = ${tx.json([...lista, ...agregadas] as never)}
        ${venceEn ? tx`, vence_en = ${venceEn}, aviso_previo_en = NULL, aviso_vencido_en = NULL, escalado_en = NULL` : tx``}
      WHERE id = ${periodoId}`;
    const detalle = {
      categorias: { agregadas: agregadas.map((c) => ({ id: c.id, nombre: c.nombre })) },
      ...(venceEn ? { venceEn: venceEn.toISOString() } : {}),
    };
    await tx`INSERT INTO variable_eventos (valor_id, tipo, usuario_id, detalle, creado_en)
      VALUES (${periodoId}, 'correccion', ${sesion.usuarioId}, ${tx.json(detalle as never)}, ${ahora})`;
    await registrarAuditoria(tx, {
      usuarioId: sesion.usuarioId,
      accion: "dato_categorias_actualizadas",
      entidad: "dato_compartido",
      entidadId: Number(d.id),
      detalle: { nombre: d.nombre as string, periodo: p.periodo as string, periodoId, agregadas: agregadas.map((c) => c.nombre) },
    });
    return { agregadas: agregadas.length };
  });
}

/**
 * «Cerrar de nuevo» un periodo reabierto del dato (anexo 14C, §3.5), de quien administra: vuelve a `cerrado` con el último
 * cierre del mes, como esté (sin valor, «Sin dato»), con su evento `cierre` y su bitácora (`dato_cerrado_de_nuevo`). Primero
 * el candado consultivo del cierre (`serializarCierreYReapertura`: todo lo que cierra o reabre pasa por él, así una medición
 * no se cierra de nuevo con lo copiado de un periodo que se corrige y se cierra entretanto); después los de quien reporta: el
 * dato `FOR SHARE` y el periodo `FOR UPDATE`.
 */
export async function cerrarDeNuevoElDato(sesion: SesionFlujo, periodoId: number, opciones?: Opciones): Promise<void> {
  if (!puede(sesion, "indicadores.administrar")) throw new ErrorPermiso();
  if (!Number.isInteger(periodoId) || periodoId <= 0) throw new ErrorIndicador(PERIODO_NO_EXISTE);
  const ahora = opciones?.ahora ?? new Date();
  await enTransaccion(opciones?.sql ?? obtenerSql(), async (tx) => {
    await serializarCierreYReapertura(tx);
    const [d] = await tx`SELECT id, nombre FROM variables_compartidas WHERE id = (SELECT variable_id FROM variable_valores WHERE id = ${periodoId}) FOR SHARE`;
    const [p] = await tx`SELECT * FROM variable_valores WHERE id = ${periodoId} FOR UPDATE`;
    if (!d || !p || Number(p.variable_id) !== Number(d.id)) throw new ErrorIndicador(PERIODO_NO_EXISTE);
    if (p.estado === "cerrado" || p.reabierto_en === null) throw new ErrorIndicador(SOLO_REABIERTO);
    const [c] = await tx`SELECT id, to_char(mes, 'YYYY-MM') AS mes FROM cierres_indicadores ORDER BY mes DESC LIMIT 1`;
    if (!c) throw new ErrorIndicador(SOLO_REABIERTO);
    const cierreId = Number(c.id);
    const sinDato = p.valor === null ? { sinDato: true as const } : {};
    await tx`UPDATE variable_valores SET estado = 'cerrado', cierre_id = ${cierreId} WHERE id = ${p.id}`;
    const detalle = { cierreId, mes: c.mes as string, deNuevo: true, ...sinDato, antes: { estado: p.estado as string }, despues: { estado: "cerrado" } };
    await tx`INSERT INTO variable_eventos (valor_id, tipo, usuario_id, detalle, creado_en)
      VALUES (${p.id}, 'cierre', ${sesion.usuarioId}, ${tx.json(detalle)}, ${ahora})`;
    await registrarAuditoria(tx, {
      usuarioId: sesion.usuarioId,
      accion: "dato_cerrado_de_nuevo",
      entidad: "dato_compartido",
      entidadId: Number(d.id),
      detalle: { nombre: d.nombre as string, periodo: p.periodo as string, periodoId: Number(p.id), mes: c.mes as string, cierreId, ...sinDato },
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// La tarea
// ─────────────────────────────────────────────────────────────────────────────

/**
 * «Reportar el dato Total facturado en el mes, noviembre de 2026»: una tarea por periodo que se pide del dato, para quien
 * está en `responsablesDeDato` (`responsabilidadEnDato`: sus responsables; sin ellos, los líderes del proceso dueño; sin
 * ellos, el Admin SGC, con «sin responsable»), con su fecha límite y el enlace a la página del dato. Sin los periodos sin
 * categorías (`periodoSinCategorias`): son de quien administra (`tareasDeCategoriasPendientes`). Solo lee.
 */
export async function tareasDeDatos(sql: Cliente, sesion: SujetoVisibilidad): Promise<Tarea[]> {
  if (!puede(sesion, "indicadores.medir")) return [];
  const filas = await sql`SELECT * FROM (
      SELECT vv.id, vv.variable_id, vv.periodo, vv.vence_en, d.nombre, p.nombre AS proceso,
        ${responsabilidadEnDato(sql, sesion)} AS responde
      FROM variable_valores vv JOIN variables_compartidas d ON d.id = vv.variable_id JOIN procesos p ON p.id = d.proceso_id
      WHERE ${periodoQueSePide(sql)} AND NOT ${periodoSinCategorias(sql)}
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

const NADIE_PUEDE_REPORTARLO = "Nadie puede reportarlo hasta que tenga categorías";
const SIN_CATEGORIAS_ACTIVAS = "Su dimensión no tiene categorías activas: créelas o actívelas primero";

/**
 * «Actualizar las categorías de Total facturado en el mes, octubre de 2026» (complemento de la 14C, §5.2): una tarea por periodo
 * que se pide y no tiene categorías (`periodoSinCategorias`), solo de quien administra indicadores (para los demás no se
 * consulta nada), con el enlace a la página del dato, donde está «Actualizar categorías». No vence ni escala: es
 * configuración. Si la dimensión no tiene ninguna categoría activa, el detalle dice que primero hay que crearlas o activarlas.
 * Nombra el dato y el periodo, nunca un indicador. Solo lee.
 */
export async function tareasDeCategoriasPendientes(sql: Cliente, sesion: SujetoVisibilidad): Promise<Tarea[]> {
  if (!puede(sesion, "indicadores.administrar")) return [];
  const filas = await sql`SELECT vv.id, vv.variable_id, vv.periodo, d.nombre,
      EXISTS (SELECT 1 FROM dimension_categorias dc WHERE dc.dimension_id = d.dimension_id AND dc.activo) AS hay_activas
    FROM variable_valores vv JOIN variables_compartidas d ON d.id = vv.variable_id
    WHERE ${periodoQueSePide(sql)} AND ${periodoSinCategorias(sql)} AND ${filtroDatos(sql, sesion)}
    ORDER BY vv.desde, vv.id`;
  const zona = zonaHoraria();
  return filas.map((f) => ({
    id: `categorias-dato:${Number(f.id)}`,
    modulo: "indicadores" as const,
    titulo: `Actualizar las categorías de ${f.nombre as string}, ${periodoDe(f.periodo as string, zona)?.etiqueta ?? (f.periodo as string)}`,
    detalle: f.hay_activas === true ? NADIE_PUEDE_REPORTARLO : SIN_CATEGORIAS_ACTIVAS,
    vence: null,
    enlace: rutaDeDato(Number(f.variable_id)),
  }));
}
