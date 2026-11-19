/**
 * Las lecturas del plan de mejoramiento (Fase 15B, anexo §3.4 a §3.6 y §3.9): la pestaña «Planes», la página del plan, los
 * candidatos para añadirle y los planes que se ofrecen en la clasificación de un hallazgo. Qué planes ve cada persona lo decide
 * `filtroPlanes`; lo que ve de cada uno (sus hallazgos, sus cifras, su avance, su historial), solo los hallazgos que ve completos
 * (`vistaCompletaDeHallazgo`): a quien no ve todo nada le dice que el plan tiene más. Un plan que no existe y uno que no se ve
 * responden igual (nulo). Las cifras y el estado se calculan al leer (F15B-DC8) y no crecen en consultas con los planes.
 */
import type { PendingQuery, Row } from "postgres";
import { obtenerSql, type Cliente } from "@/db/cliente";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { escaparLike } from "@/db/consultas/normograma/busqueda";
import { filtroPlanes, vistaCompletaDeHallazgo } from "@/lib/alcance";
import { etiquetaDeEstado } from "@/lib/mejoramiento/estados";
import { avanceDePlan, cuentaParaElPlan, estadoDePlan, NO_CUENTAN_PARA_PLAN, type EstadoDePlan } from "@/lib/mejoramiento/planes";
import { TERMINALES, type EstadoHallazgo, type Origen, type ResultadoCierre } from "@/lib/mejoramiento/tipos";
import { puede, requerirPermiso } from "@/lib/permisos";
import { evaluablesDesde } from "./espera";
import { filasDeLaLista, hechosDeLaLista, type FilaDeHallazgo } from "./lectura";

type Opciones = { sql?: Cliente; ahora?: Date };

/** Un plan en la pestaña «Planes» (maqueta 1): sus cifras, su avance y su estado, de lo que ve quien mira. Las fechas, `AAAA-MM-DD`. */
export type PlanDeLaLista = {
  id: number;
  codigo: string;
  nombre: string;
  origen: Origen;
  vigencia: number;
  fechaEvento: string;
  fechaLimiteEnte: string | null;
  estado: EstadoDePlan;
  /** Los que cuentan (los anulados y rechazados que se quedaron en el plan, no). */
  hallazgos: number;
  abiertos: number;
  conAlgoVencido: number;
  /** El promedio de los que tienen plan de acción aprobado en su ronda en curso; nulo sin ninguno («—»). */
  avance: number | null;
};

export type FiltroDePlanes = { q?: string; vigencia?: number; origen?: Origen; soloAbiertos?: boolean; anulados?: boolean };

/** Un hallazgo en la página del plan: la fila de la lista, si su origen no es el del plan y si cuenta (anulado o rechazado, no). */
export type FilaDelPlan = FilaDeHallazgo & { origenDistinto: boolean; cuenta: boolean };

/** Una línea del historial del plan: el tipo del evento, cuándo, quién, el código del hallazgo (si es de uno) y lo que pasó. */
export type EventoDelPlan = { tipo: string; en: Date; por: string; hallazgo: string | null; texto: string };

export type DetalleDePlan = PlanDeLaLista & {
  objetivoTexto: string | null;
  /** El objetivo del maestro, con su clase delante («Institucional · …»); nulo sin objetivo. */
  objetivo: string | null;
  objetivoId: number | null;
  /** Si el plan propone su objetivo a los que entran: lo tiene y sigue activo (uno desactivado no se elige de nuevo, §10.4). */
  proponeObjetivo: boolean;
  anuladoMotivo: string | null;
  grupos: Array<{ procesoId: number; proceso: string; filas: FilaDelPlan[] }>;
  historial: EventoDelPlan[];
  /**
   * `gestionar`: `mejora.planes` en un plan que no está anulado (editar, añadir, sacar, anular); `verTodo`: `mejora.ver_todo` (el
   * Excel del ente, los archivos y la respuesta); `responder`: `mejora.gestionar` en un plan que no está anulado (la respuesta al
   * ente). El servidor lo vuelve a comprobar.
   */
  puede: { gestionar: boolean; verTodo: boolean; responder: boolean };
};

const columnasDelPlan = (sql: Cliente) => sql`p.id, p.codigo, p.nombre, p.origen, p.vigencia, p.consecutivo,
  to_char(p.fecha_evento, 'YYYY-MM-DD') AS fecha_evento, to_char(p.fecha_limite_ente, 'YYYY-MM-DD') AS fecha_limite_ente,
  p.anulado_en IS NOT NULL AS anulado`;

type Cifras = Pick<PlanDeLaLista, "hallazgos" | "abiertos" | "conAlgoVencido" | "avance">;

const SIN_CIFRAS: Cifras = { hallazgos: 0, abiertos: 0, conAlgoVencido: 0, avance: null };

const esTerminal = (e: EstadoHallazgo) => TERMINALES.includes(e);

/** Las cifras de un plan con los hechos de los hallazgos que ve quien mira (§3.5): solo cuentan los que no se anularon ni rechazaron. */
function cifrasDe(hechos: ReadonlyArray<{ estado: EstadoHallazgo; vencido: boolean; avance: number | null }>): Cifras {
  const cuentan = hechos.filter((h) => cuentaParaElPlan(h.estado));
  return {
    hallazgos: cuentan.length,
    abiertos: cuentan.filter((h) => !esTerminal(h.estado)).length,
    conAlgoVencido: cuentan.filter((h) => h.vencido).length,
    avance: avanceDePlan(cuentan.map((h) => h.avance)),
  };
}

function aPlanDeLaLista(p: Row, c: Cifras): PlanDeLaLista {
  return {
    id: Number(p.id),
    codigo: p.codigo as string,
    nombre: p.nombre as string,
    origen: p.origen as Origen,
    vigencia: Number(p.vigencia),
    fechaEvento: p.fecha_evento as string,
    fechaLimiteEnte: (p.fecha_limite_ente as string | null) ?? null,
    estado: estadoDePlan({ anulado: p.anulado === true, cuentan: c.hallazgos, abiertos: c.abiertos }),
    ...c,
  };
}

/** El orden de la pestaña: los abiertos, los que no tienen hallazgos, los cerrados y los anulados; en cada uno, el más reciente primero. */
const ORDEN_DEL_ESTADO: Readonly<Record<EstadoDePlan, number>> = { abierto: 0, sin_hallazgos: 1, cerrado: 2, anulado: 3 };

/** Los hallazgos de esos planes que la persona ve completos, para un `WHERE` sobre `mejora_hallazgos h`. */
const suyosEnPlanes = (sql: Cliente, sesion: SesionFlujo, planIds: readonly number[]): PendingQuery<Row[]> => sql`h.id IN (
    SELECT c.hallazgo_id FROM mejora_clasificacion c WHERE c.plan_id = ANY(${sql.array([...planIds])}::bigint[]))
  AND ${vistaCompletaDeHallazgo(sql, sesion)}`;

/**
 * Los planes que la persona ve (`filtroPlanes`), con las cifras de los hallazgos que ve completos, en un número fijo de consultas
 * sean cuantos sean. Sin `anulados`, los anulados no salen (§3.2: la lista los muestra con su filtro). `soloAbiertos` mira el estado
 * que ve quien mira, no el de todo el plan.
 */
export async function listarPlanes(sesion: SesionFlujo, filtro: FiltroDePlanes, opciones?: Opciones): Promise<PlanDeLaLista[]> {
  const sql = opciones?.sql ?? obtenerSql();
  const ahora = opciones?.ahora ?? new Date();
  const q = filtro.q?.trim();
  const patron = q ? `%${escaparLike(q)}%` : null;
  const planes = await sql`SELECT ${columnasDelPlan(sql)}
    FROM mejora_planes p
    WHERE ${filtroPlanes(sql, sesion)}
      AND ${filtro.anulados ? sql`true` : sql`p.anulado_en IS NULL`}
      AND ${patron ? sql`(unaccent(p.codigo) ILIKE unaccent(${patron}) OR unaccent(p.nombre) ILIKE unaccent(${patron}))` : sql`true`}
      AND ${filtro.vigencia !== undefined ? sql`p.vigencia = ${filtro.vigencia}` : sql`true`}
      AND ${filtro.origen ? sql`p.origen = ${filtro.origen}` : sql`true`}
    ORDER BY p.vigencia DESC, p.consecutivo DESC, p.id DESC`;
  if (planes.length === 0) return [];
  const ids = planes.map((p) => Number(p.id));

  // De quién es cada hallazgo que ve, y lo que la lista sabe de él: dos lecturas para todos los planes.
  const pertenencia = await sql`SELECT c.plan_id, c.hallazgo_id FROM mejora_clasificacion c
    JOIN mejora_hallazgos h ON h.id = c.hallazgo_id
    WHERE c.plan_id = ANY(${sql.array(ids)}::bigint[]) AND ${vistaCompletaDeHallazgo(sql, sesion)}`;
  const hechos = pertenencia.length > 0 ? await hechosDeLaLista(sql, suyosEnPlanes(sql, sesion, ids), { ahora }) : new Map();
  const porPlan = new Map<number, Array<{ estado: EstadoHallazgo; vencido: boolean; avance: number | null }>>();
  for (const f of pertenencia) {
    const hecho = hechos.get(Number(f.hallazgo_id));
    if (!hecho) continue;
    const lista = porPlan.get(Number(f.plan_id)) ?? [];
    lista.push(hecho);
    porPlan.set(Number(f.plan_id), lista);
  }

  const lista = planes.map((p) => {
    const suyos = porPlan.get(Number(p.id));
    return aPlanDeLaLista(p, suyos ? cifrasDe(suyos) : SIN_CIFRAS);
  });
  // `sort` es estable: dentro de cada estado queda el orden de la consulta (vigencia y consecutivo, del más reciente).
  lista.sort((a, b) => ORDEN_DEL_ESTADO[a.estado] - ORDEN_DEL_ESTADO[b.estado]);
  return filtro.soloAbiertos ? lista.filter((p) => p.estado === "abierto") : lista;
}

/** Si la persona ve algún plan (`filtroPlanes`): con `mejora.planes`, decide la pestaña «Planes» (anexo §3.6). */
export async function veAlgunPlan(sesion: SesionFlujo, opciones?: Opciones): Promise<boolean> {
  const sql = opciones?.sql ?? obtenerSql();
  const [f] = await sql`SELECT EXISTS (SELECT 1 FROM mejora_planes p WHERE ${filtroPlanes(sql, sesion)}) AS ve`;
  return f?.ve === true;
}

/** Los campos del plan que nombra el historial de una edición, con su artículo. */
const CAMPO_EDITADO: Readonly<Record<string, string>> = {
  nombre: "el nombre",
  origen: "el origen",
  fechaEvento: "la fecha del evento",
  objetivoTexto: "el objetivo del plan",
  objetivoId: "el objetivo",
  fechaLimiteEnte: "la fecha límite del ente",
};

/** «a, b y c». */
function enumerar(partes: readonly string[]): string {
  if (partes.length <= 1) return partes.join("");
  return `${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]}`;
}

const textoDe = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);
const idDe = (v: unknown): number | null => (typeof v === "number" && Number.isSafeInteger(v) && v > 0 ? v : null);

/**
 * Lo que dice una línea del historial (sin quién: lo pone la pantalla delante). El otro plan de un cambio de plan se nombra solo a
 * quien lo ve (`visibles`); a los demás, «otro plan». El motivo, que quedó aquí y no en la bitácora (§3.10), se lee completo.
 */
function textoDelEvento(tipo: string, d: Record<string, unknown>, hallazgo: string | null, visibles: ReadonlyMap<number, string>): string {
  const motivo = textoDe(d.motivo);
  const conMotivo = (t: string) => (motivo ? `${t}. Motivo: ${motivo}` : t);
  const otroPlan = (id: number | null, conArticulo: "al" | "desde el") => {
    if (id === null) return "";
    const codigo = visibles.get(id);
    if (codigo) return ` ${conArticulo} plan ${codigo}`;
    return conArticulo === "al" ? " a otro plan" : " desde otro plan";
  };
  const h = hallazgo ?? "un hallazgo";
  switch (tipo) {
    case "creado":
      return "creó el plan";
    case "editado": {
      const antes = typeof d.antes === "object" && d.antes !== null ? Object.keys(d.antes) : [];
      const campos = antes.flatMap((k) => (Object.hasOwn(CAMPO_EDITADO, k) ? [CAMPO_EDITADO[k]] : []));
      return campos.length > 0 ? `editó el plan: cambió ${enumerar(campos)}` : "editó el plan";
    }
    case "anulado":
      return conMotivo("anuló el plan");
    case "entra": {
      if (d.alRegistrar === true) return `registró ${h} dentro del plan`;
      const desde = idDe(d.desdePlanId);
      return conMotivo(desde !== null ? `trajo ${h}${otroPlan(desde, "desde el")}` : `añadió ${h}`);
    }
    case "sale": {
      const hacia = idDe(d.haciaPlanId);
      return conMotivo(hacia !== null ? `pasó ${h}${otroPlan(hacia, "al")}` : `sacó ${h}`);
    }
    case "archivo":
      return "adjuntó un archivo al plan";
    case "archivo_quitado":
      return "quitó un archivo del plan";
    case "respuesta":
      return "registró la respuesta al ente";
    default:
      return "registró un cambio en el plan";
  }
}

/** Los tipos de evento del plan sin hallazgo que lee quien no ve todo: los archivos y la respuesta al ente no son suyos (§3.6). */
const DEL_PLAN_PARA_TODOS = ["creado", "editado", "anulado"] as const;

/**
 * El historial del plan, del más reciente al más antiguo. Quien ve todo, entero; los demás, las líneas del plan (creación,
 * edición, anulación) y las de los hallazgos que ven completos, nunca las de otro hallazgo (§3.6).
 */
async function historialDe(sql: Cliente, sesion: SesionFlujo, planId: number): Promise<EventoDelPlan[]> {
  const verTodo = puede(sesion, "mejora.ver_todo");
  const filas = await sql`SELECT e.id, e.tipo, e.detalle, e.creado_en, u.nombre AS por, h.codigo AS hallazgo
    FROM mejora_plan_eventos e
    JOIN usuarios u ON u.id = e.usuario_id
    LEFT JOIN mejora_hallazgos h ON h.id = e.hallazgo_id
    WHERE e.plan_id = ${planId}
      AND ${
        verTodo
          ? sql`true`
          : sql`((e.hallazgo_id IS NULL AND e.tipo IN ${sql([...DEL_PLAN_PARA_TODOS])})
              OR (e.hallazgo_id IS NOT NULL AND ${vistaCompletaDeHallazgo(sql, sesion)}))`
      }
    ORDER BY e.creado_en DESC, e.id DESC`;
  const detalle = (f: Row): Record<string, unknown> =>
    typeof f.detalle === "object" && f.detalle !== null ? (f.detalle as Record<string, unknown>) : {};
  // Los otros planes que nombra un cambio de plan, en una consulta: solo los que la persona ve.
  const otros = [...new Set(filas.flatMap((f) => [idDe(detalle(f).desdePlanId), idDe(detalle(f).haciaPlanId)]).filter((id) => id !== null))];
  const visibles = new Map<number, string>(
    otros.length === 0
      ? []
      : (await sql`SELECT p.id, p.codigo FROM mejora_planes p WHERE p.id = ANY(${sql.array(otros as number[])}::bigint[])
            AND ${filtroPlanes(sql, sesion)}`).map((f) => [Number(f.id), f.codigo as string]),
  );
  return filas.map((f) => {
    const hallazgo = (f.hallazgo as string | null) ?? null;
    return { tipo: f.tipo as string, en: f.creado_en as Date, por: f.por as string, hallazgo, texto: textoDelEvento(f.tipo as string, detalle(f), hallazgo, visibles) };
  });
}

/**
 * El plan para su página (anexo §3.6 y §3.9), o nulo si no existe o la persona no lo ve. Sus hallazgos, en una lectura (los que
 * ve completos, agrupados por proceso, con los anulados y rechazados que se quedaron en él marcados: sin ellos no se entendería por
 * qué un plan «Sin hallazgos» no se puede anular); las cifras, el estado y el avance, de esos mismos; y el historial que le toca.
 */
export async function leerPlan(sesion: SesionFlujo, id: number, opciones?: Opciones): Promise<DetalleDePlan | null> {
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  const sql = opciones?.sql ?? obtenerSql();
  const ahora = opciones?.ahora ?? new Date();
  const [p] = await sql`SELECT ${columnasDelPlan(sql)}, p.objetivo_texto, p.objetivo_id, p.anulado_motivo,
      o.enunciado AS objetivo, o.clase AS objetivo_clase, o.activo AS objetivo_activo
    FROM mejora_planes p
    LEFT JOIN objetivos o ON o.id = p.objetivo_id
    WHERE p.id = ${id} AND ${filtroPlanes(sql, sesion)}`;
  if (!p) return null;
  const origen = p.origen as Origen;
  const filas = await filasDeLaLista(sql, suyosEnPlanes(sql, sesion, [id]), { ahora });
  const cifras = cifrasDe(filas);

  const grupos = new Map<number, { procesoId: number; proceso: string; filas: FilaDelPlan[] }>();
  for (const fila of filas) {
    const grupo = grupos.get(fila.procesoId) ?? { procesoId: fila.procesoId, proceso: fila.proceso, filas: [] };
    grupo.filas.push({ ...fila, origenDistinto: fila.origen !== origen, cuenta: cuentaParaElPlan(fila.estado) });
    grupos.set(fila.procesoId, grupo);
  }
  // En cada proceso, los que cuentan en el orden de la lista y al final los que ya no cuentan.
  const ordenados = [...grupos.values()]
    .map((g) => ({ ...g, filas: [...g.filas.filter((f) => f.cuenta), ...g.filas.filter((f) => !f.cuenta)] }))
    .sort((a, b) => a.proceso.localeCompare(b.proceso, "es") || a.procesoId - b.procesoId);

  const anulado = p.anulado === true;
  const objetivo = (p.objetivo as string | null) ?? null;
  return {
    ...aPlanDeLaLista(p, cifras),
    objetivoTexto: (p.objetivo_texto as string | null) ?? null,
    objetivo: objetivo === null ? null : `${p.objetivo_clase === "calidad" ? "Calidad" : "Institucional"} · ${objetivo}`,
    objetivoId: p.objetivo_id === null ? null : Number(p.objetivo_id),
    proponeObjetivo: p.objetivo_activo === true,
    anuladoMotivo: (p.anulado_motivo as string | null) ?? null,
    grupos: ordenados,
    historial: await historialDe(sql, sesion, id),
    puede: {
      gestionar: !anulado && puede(sesion, "mejora.planes"),
      verTodo: puede(sesion, "mejora.ver_todo"),
      responder: !anulado && puede(sesion, "mejora.gestionar"),
    },
  };
}

/** Un hallazgo que se puede añadir a un plan. `estado`, la etiqueta de su estado, como en la lista. */
export type CandidatoParaPlan = { id: number; codigo: string; titulo: string; proceso: string; origen: Origen; estado: string };

export const CANDIDATOS_POR_PAGINA = 50;

/**
 * Los hallazgos que se pueden añadir al plan (anexo §3.4, camino 2): los que cuentan (ni anulados ni rechazados), en cualquier
 * estado, que no están en ningún plan; por código o título, proceso, origen y año de registro (en la zona de la instalación); los
 * abiertos primero y, entre ellos, los más recientes; hasta cincuenta. Solo con `mejora.planes`; de un plan que no existe o está
 * anulado, ninguno.
 */
export async function candidatosParaPlan(
  sesion: SesionFlujo,
  planId: number,
  filtro: { q?: string; proceso?: number; origen?: Origen; anio?: number },
  opciones?: Opciones,
): Promise<CandidatoParaPlan[]> {
  requerirPermiso(sesion, "mejora.planes");
  if (!Number.isSafeInteger(planId) || planId <= 0) return [];
  const sql = opciones?.sql ?? obtenerSql();
  const [plan] = await sql`SELECT 1 FROM mejora_planes WHERE id = ${planId} AND anulado_en IS NULL`;
  if (!plan) return [];
  const q = filtro.q?.trim();
  const patron = q ? `%${escaparLike(q)}%` : null;
  const filas = await sql`SELECT h.id, h.codigo, h.titulo, h.origen, h.estado, h.resultado_cierre, h.correccion_requerida, pr.nombre AS proceso
    FROM mejora_hallazgos h
    JOIN procesos pr ON pr.id = h.proceso_id
    WHERE ${vistaCompletaDeHallazgo(sql, sesion)}
      AND h.estado NOT IN ${sql([...NO_CUENTAN_PARA_PLAN])}
      AND NOT EXISTS (SELECT 1 FROM mejora_clasificacion c WHERE c.hallazgo_id = h.id AND c.plan_id IS NOT NULL)
      AND ${patron ? sql`(unaccent(h.codigo) ILIKE unaccent(${patron}) OR unaccent(h.titulo) ILIKE unaccent(${patron}))` : sql`true`}
      AND ${filtro.proceso !== undefined ? sql`h.proceso_id = ${filtro.proceso}` : sql`true`}
      AND ${filtro.origen ? sql`h.origen = ${filtro.origen}` : sql`true`}
      AND ${filtro.anio !== undefined ? sql`extract(year FROM h.registrado_en) = ${filtro.anio}` : sql`true`}
    ORDER BY (h.estado IN ${sql([...TERMINALES])}) ASC, h.id DESC
    LIMIT ${CANDIDATOS_POR_PAGINA}`;
  const enEspera = filas.filter((f) => f.estado === "en_espera").map((f) => Number(f.id));
  const evaluables = enEspera.length > 0 ? await evaluablesDesde(sql, enEspera, opciones?.ahora ?? new Date()) : new Map();
  return filas.map((f) => ({
    id: Number(f.id),
    codigo: f.codigo as string,
    titulo: f.titulo as string,
    proceso: f.proceso as string,
    origen: f.origen as Origen,
    estado: etiquetaDeEstado(
      {
        estado: f.estado as EstadoHallazgo,
        resultadoCierre: (f.resultado_cierre as ResultadoCierre | null) ?? null,
        correccionRequerida: (f.correccion_requerida as boolean | null) ?? null,
      },
      { yaSePuedeEvaluar: evaluables.get(Number(f.id))?.yaSePuede === true },
    ),
  }));
}

/** Un plan que se ofrece en la clasificación de un hallazgo: si propone su objetivo (lo tiene y sigue activo). */
export type PlanElegible = { id: number; codigo: string; nombre: string; proponeObjetivo: boolean };

/**
 * Los planes no anulados, del más reciente al más antiguo, para «Poner en un plan» y «Cambiar de plan» en la página de un hallazgo
 * (anexo §3.4, camino 3). Solo con `mejora.planes` (quien lo tiene ve todos los planes); a los demás, ninguno.
 */
export async function planesParaClasificar(sesion: SesionFlujo, opciones?: Opciones): Promise<PlanElegible[]> {
  if (!puede(sesion, "mejora.planes")) return [];
  const sql = opciones?.sql ?? obtenerSql();
  const filas = await sql`SELECT p.id, p.codigo, p.nombre, coalesce(o.activo, false) AS propone
    FROM mejora_planes p
    LEFT JOIN objetivos o ON o.id = p.objetivo_id
    WHERE p.anulado_en IS NULL AND ${filtroPlanes(sql, sesion)}
    ORDER BY p.vigencia DESC, p.consecutivo DESC, p.id DESC`;
  return filas.map((f) => ({ id: Number(f.id), codigo: f.codigo as string, nombre: f.nombre as string, proponeObjetivo: f.propone === true }));
}

/** Las vigencias de los planes que la persona ve, de la más reciente a la más antigua: las opciones del filtro de la pestaña. */
export async function vigenciasDePlanes(sesion: SesionFlujo, opciones?: Opciones): Promise<number[]> {
  const sql = opciones?.sql ?? obtenerSql();
  const filas = await sql`SELECT DISTINCT p.vigencia FROM mejora_planes p WHERE ${filtroPlanes(sql, sesion)} ORDER BY p.vigencia DESC`;
  return filas.map((f) => Number(f.vigencia));
}
