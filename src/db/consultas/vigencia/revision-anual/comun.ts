/**
 * Lo que comparten las partes de la revisión anual (spec 13C §9): sus tipos, sus mensajes, la lectura de una revisión
 * con sus totales, de quién es la tarea de cada proceso y lo que le falta. Solo depende de tipos y constantes: lo
 * importa `registro.ts`, al que a su vez importa `aplicarPublicacion`.
 *
 * La foto: al abrir, cada documento con versión vigente de un proceso activo tiene su fila en
 * `revision_anual_decisiones`, también el que aún no tiene decisión. Ese se guarda como `sin_revisar` y, mientras la
 * revisión está abierta, eso quiere decir «pendiente»: el CHECK no admite otro valor, y la exclusión de las tareas y los
 * avisos individuales (`enRevisionAnualAbierta`) mira esas filas. Al cerrar, lo que siguió así queda «sin revisar».
 */
import type { PendingQuery, Row } from "postgres";
import type { Cliente } from "@/db/cliente";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { DECISIONES, type Decision } from "@/lib/vigencia/tipos";

export type Opciones = { sql?: Cliente; ahora?: Date };

export const REVISION_NO_EXISTE = "La revisión anual no existe";
export const YA_CERRADA = "La revisión ya está cerrada";
export const YA_ABIERTA = "Ya hay una revisión anual abierta";
export const PROCESO_NO_EXISTE = "El proceso no existe";

/** La decisión que guarda la fila de un documento aún sin decidir; cerrada la revisión, la definitiva. */
export const PENDIENTE: Decision = "sin_revisar";

export type Prorroga = { fecha: Date; dias: number; motivo: string; por: string };

/**
 * Una revisión anual con sus cifras. `totales` cuenta las filas por decisión y `documentos` todas; mientras está
 * abierta, `sin_revisar` son los pendientes.
 */
export type Revision = {
  id: number;
  anio: number;
  estado: "abierta" | "cerrada";
  plazoDias: number;
  ventanaMeses: number;
  abiertaPor: string;
  abiertaEn: Date;
  venceEn: Date;
  prorrogas: Prorroga[];
  cerradaPor: string | null;
  cerradaEn: Date | null;
  totales: Record<Decision, number> & { documentos: number };
};

/** Lo que guarda `prorrogas` (jsonb) por cada prórroga: además del nombre, el id de quien la dio. */
export type ProrrogaGuardada = { fecha: string; dias: number; motivo: string; porId: number; por: string };

export function cerosPorDecision(): Record<Decision, number> {
  return Object.fromEntries(DECISIONES.map((d) => [d, 0])) as Record<Decision, number>;
}

export function prorrogasDe(valor: unknown): Prorroga[] {
  return ((valor as ProrrogaGuardada[] | null) ?? []).map((p) => ({ fecha: new Date(p.fecha), dias: p.dias, motivo: p.motivo, por: p.por }));
}

function aRevision(f: Row): Revision {
  const porDecision = cerosPorDecision();
  let documentos = 0;
  for (const [decision, n] of Object.entries((f.totales as Record<string, number> | null) ?? {})) {
    porDecision[decision as Decision] = Number(n);
    documentos += Number(n);
  }
  return {
    id: Number(f.id),
    anio: Number(f.anio),
    estado: f.estado as Revision["estado"],
    plazoDias: Number(f.plazo_dias),
    ventanaMeses: Number(f.ventana_meses),
    abiertaPor: f.abierta_por as string,
    abiertaEn: new Date(f.abierta_en as string),
    venceEn: new Date(f.vence_en as string),
    prorrogas: prorrogasDe(f.prorrogas),
    cerradaPor: (f.cerrada_por as string | null) ?? null,
    cerradaEn: f.cerrada_en === null ? null : new Date(f.cerrada_en as string),
    totales: { ...porDecision, documentos },
  };
}

/** Las revisiones que cumplen `condicion` (sobre `revisiones_anuales ra`), de la más reciente a la más antigua. */
export async function leerRevisiones(sql: Cliente, condicion: PendingQuery<Row[]>): Promise<Revision[]> {
  const filas = await sql`
    SELECT ra.id, ra.anio, ra.estado, ra.plazo_dias, ra.ventana_meses, ua.nombre AS abierta_por, ra.abierta_en, ra.vence_en,
      ra.prorrogas, uc.nombre AS cerrada_por, ra.cerrada_en,
      (SELECT jsonb_object_agg(x.decision, x.n) FROM (
        SELECT decision, count(*)::int AS n FROM revision_anual_decisiones WHERE revision_id = ra.id GROUP BY decision
      ) x) AS totales
    FROM revisiones_anuales ra
    JOIN usuarios ua ON ua.id = ra.abierta_por
    LEFT JOIN usuarios uc ON uc.id = ra.cerrada_por
    WHERE ${condicion}
    ORDER BY ra.anio DESC, ra.id DESC`;
  return filas.map(aRevision);
}

/**
 * Los procesos cuya tarea de la campaña es de la persona, para un `WHERE` sobre `procesos p` (F13A-DC2): el líder, los
 * procesos activos que lidera; el Admin SGC, los que no tienen un líder activo; nadie más.
 */
export function procesosDeLaPersona(sql: Cliente, sesion: Pick<SesionFlujo, "usuarioId" | "rol">): PendingQuery<Row[]> {
  if (sesion.rol === "lider_proceso") {
    return sql`(p.activo AND EXISTS (SELECT 1 FROM usuario_procesos persona_up
      WHERE persona_up.usuario_id = ${sesion.usuarioId} AND persona_up.proceso_id = p.id))`;
  }
  if (sesion.rol === "admin_sgc") {
    return sql`NOT (p.activo AND EXISTS (SELECT 1 FROM usuario_procesos lider_up
      JOIN usuarios lider_u ON lider_u.id = lider_up.usuario_id AND lider_u.activo AND lider_u.rol = 'lider_proceso'
      WHERE lider_up.proceso_id = p.id))`;
  }
  return sql`false`;
}

/** Lo que falta en cada proceso de la revisión: los documentos sin decisión (por su proceso propietario de hoy) y el normograma. */
export type PendientesDeProceso = {
  procesoId: number;
  nombre: string;
  sinDecision: number;
  faltaNormograma: boolean;
  pendientes: number;
};

/**
 * Cuántos documentos del proceso `p` siguen sin decisión en la revisión `revision` (una columna de la consulta que lo
 * compone), por su proceso propietario de hoy.
 */
export function sinDecisionDelProceso(sql: Cliente, revision: PendingQuery<Row[]>): PendingQuery<Row[]> {
  return sql`(SELECT count(*)::int FROM revision_anual_decisiones pend_rad
    JOIN documento_proceso pend_dp ON pend_dp.documento_id = pend_rad.documento_id AND pend_dp.es_principal
    LEFT JOIN subprocesos pend_s ON pend_s.id = pend_dp.subproceso_id
    WHERE pend_rad.revision_id = ${revision} AND pend_rad.decision = ${PENDIENTE}
      AND COALESCE(pend_dp.proceso_id, pend_s.proceso_id) = p.id)`;
}

/**
 * Los pendientes de cada proceso de la revisión que cumple `condicion` (sobre `procesos p` y `revision_anual_procesos
 * rap`), por nombre. Una sola sentencia.
 */
export async function pendientesPorProceso(
  sql: Cliente,
  revisionId: number,
  condicion: PendingQuery<Row[]> = sql`true`,
): Promise<PendientesDeProceso[]> {
  const filas = await sql`
    SELECT p.id, p.nombre, rap.normograma_resultado IS NULL AS falta_normograma,
      ${sinDecisionDelProceso(sql, sql`rap.revision_id`)} AS sin_decision
    FROM revision_anual_procesos rap
    JOIN procesos p ON p.id = rap.proceso_id
    WHERE rap.revision_id = ${revisionId} AND ${condicion}
    ORDER BY p.nombre, p.id`;
  return filas.map((f) => {
    const sinDecision = Number(f.sin_decision);
    const faltaNormograma = f.falta_normograma as boolean;
    return { procesoId: Number(f.id), nombre: f.nombre as string, sinDecision, faltaNormograma, pendientes: sinDecision + (faltaNormograma ? 1 : 0) };
  });
}
