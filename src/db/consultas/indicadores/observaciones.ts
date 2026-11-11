/**
 * Las observaciones de una medición (spec 14 §6.4 y §8.6, Tarea 10 de la 14A). Las escribe quien puede observar
 * (`puedeObservar`: Admin SGC, Gerencia, Control Interno y quien hace seguimiento) y las responde quien puede analizar
 * el indicador o el Admin SGC. Son de solo inserción (trigger y privilegios de `sgc_app`), no bloquean nada y se admiten
 * también sobre una medición cerrada o un indicador retirado: no cambian el dato. Las ve quien ve los soportes.
 *
 * Solo insertan: no pasan por `contextoDeMedicion`, que rechaza lo cerrado, y `medicion_observaciones` no tiene trigger
 * que lea la medición (la FK la toma `FOR KEY SHARE`).
 */
import type { TransactionSql } from "postgres";
import { obtenerSql, type Cliente } from "@/db/cliente";
import { registrarAuditoria } from "@/db/consultas/admin";
import { avisarA } from "@/db/consultas/avisos-vencimiento";
import { enTransaccion, type SesionFlujo } from "@/db/consultas/flujo/contrato";
import { puedeAnalizar, puedeObservar, puedeVerIndicador, puedeVerSoportes, responsablesDeAnalizar, type SujetoVisibilidad } from "@/lib/alcance";
import { periodoDe } from "@/lib/indicadores-documentales/periodo";
import { ErrorIndicador, MAXIMO_TEXTO_MEDICION } from "@/lib/indicadores/tipos";
import { ErrorPermiso, puede } from "@/lib/permisos";
import type { Rol } from "@/lib/roles";
import { zonaHoraria } from "@/lib/zona-horaria";
import { conMayuscula, NO_EXISTE } from "./mediciones";

type Opciones = { sql?: Cliente; ahora?: Date };

const OBSERVACION_NO_EXISTE = "La observación no existe";

export type Respuesta = { id: number; autor: string; texto: string; creadoEn: Date };
/** Una observación con sus respuestas, de la más antigua a la más reciente. */
export type Observacion = Respuesta & { respuestas: Respuesta[] };

/** De 1 a `MAXIMO_TEXTO_MEDICION` caracteres, sin los espacios de los extremos. */
function textoDe(valor: string, que: "observación" | "respuesta"): string {
  const t = typeof valor === "string" ? valor.trim() : "";
  if (t === "") throw new ErrorIndicador(`Escriba la ${que}`);
  if (t.length > MAXIMO_TEXTO_MEDICION) throw new ErrorIndicador(`La ${que} no puede pasar de ${MAXIMO_TEXTO_MEDICION} caracteres`);
  return t;
}

type MedicionVista = { id: number; periodo: string; indicadorId: number; codigo: string };

/** La medición, si la persona ve su indicador; si no, `null` (para ella no existe). */
async function medicionVista(sql: Cliente, sujeto: SujetoVisibilidad, medicionId: number): Promise<MedicionVista | null> {
  if (!Number.isInteger(medicionId) || medicionId <= 0) return null;
  const [m] = await sql`SELECT m.id, m.periodo, m.indicador_id, i.codigo FROM mediciones m JOIN indicadores i ON i.id = m.indicador_id
    WHERE m.id = ${medicionId}`;
  if (!m || !(await puedeVerIndicador(Number(m.indicador_id), sujeto, { sql }))) return null;
  return { id: Number(m.id), periodo: m.periodo as string, indicadorId: Number(m.indicador_id), codigo: m.codigo as string };
}

/** Quien ve el indicador y además sus soportes (spec §6.4). */
async function veObservaciones(sql: Cliente, sujeto: SujetoVisibilidad, indicadorId: number): Promise<boolean> {
  return (await puedeVerIndicador(indicadorId, sujeto, { sql })) && (await puedeVerSoportes(indicadorId, sujeto, { sql }));
}

/** «SGC-IND-01, tercer trimestre de 2026». */
const dondeEs = (m: MedicionVista) => `${m.codigo}, ${periodoDe(m.periodo, zonaHoraria())?.etiqueta ?? m.periodo}`;

/** La pestaña de observaciones del indicador, en el periodo de la medición. */
export const enlaceDeObservaciones = (codigo: string, periodo: string) =>
  `/indicadores/${encodeURIComponent(codigo)}?vista=observaciones&periodo=${encodeURIComponent(periodo)}`;

/**
 * Deja una observación en una medición (spec §8.6) y avisa a quienes analizan el indicador (`responsablesDeAnalizar`),
 * salvo a quien la escribió. El aviso no lleva el texto.
 */
export async function observar(sesion: SesionFlujo, d: { medicionId: number; texto: string }, opciones?: Opciones): Promise<{ id: number }> {
  if (!puede(sesion, "indicadores.observar")) throw new ErrorPermiso();
  const texto = textoDe(d.texto, "observación");
  const sql = opciones?.sql ?? obtenerSql();
  const ahora = opciones?.ahora ?? new Date();
  return enTransaccion(sql, async (tx) => {
    const m = await medicionVista(tx, sesion, d.medicionId);
    if (!m) throw new ErrorIndicador(NO_EXISTE);
    if (!(await puedeObservar(m.indicadorId, sesion, { sql: tx }))) throw new ErrorPermiso();
    const [o] = await tx`INSERT INTO medicion_observaciones (medicion_id, usuario_id, texto, creado_en)
      VALUES (${m.id}, ${sesion.usuarioId}, ${texto}, ${ahora}) RETURNING id`;
    const id = Number(o.id);
    const destinatarios = (await responsablesDeAnalizar(m.indicadorId, { sql: tx })).filter((u) => u !== sesion.usuarioId);
    if (destinatarios.length > 0) {
      await avisarA(
        tx,
        {
          tipo: "indicadores.observacion",
          titulo: `Observación en ${m.codigo}`,
          enlace: enlaceDeObservaciones(m.codigo, m.periodo),
          entidad: "medicion",
          entidadId: m.id,
        },
        destinatarios.map((usuarioId) => ({ usuarioId, cuerpo: `${sesion.nombre} dejó una observación en ${dondeEs(m)}` })),
      );
    }
    await registrarAuditoria(tx, {
      usuarioId: sesion.usuarioId,
      accion: "medicion_observada",
      entidad: "medicion",
      entidadId: m.id,
      detalle: { codigo: m.codigo, indicadorId: m.indicadorId, periodo: m.periodo, observacionId: id, texto },
    });
    return { id };
  });
}

/** ¿El autor de la observación sigue activo y viendo las observaciones del indicador? Si no, no se le avisa. */
async function autorLaVe(tx: TransactionSql, usuarioId: number, indicadorId: number): Promise<boolean> {
  const [u] = await tx`SELECT id, rol, ver_historial FROM usuarios WHERE id = ${usuarioId} AND activo`;
  if (!u) return false;
  return veObservaciones(tx, { usuarioId, rol: u.rol as Rol, verHistorial: u.ver_historial === true }, indicadorId);
}

/**
 * Responde una observación (spec §8.6): quien puede analizar el indicador o el Admin SGC. Solo se responde una
 * observación, no otra respuesta. Avisa a quien observó si sigue activo, ve las observaciones y no es quien responde.
 */
export async function responder(sesion: SesionFlujo, d: { observacionId: number; texto: string }, opciones?: Opciones): Promise<{ id: number }> {
  if (!puede(sesion, "indicadores.observar")) throw new ErrorPermiso();
  const texto = textoDe(d.texto, "respuesta");
  const sql = opciones?.sql ?? obtenerSql();
  const ahora = opciones?.ahora ?? new Date();
  return enTransaccion(sql, async (tx) => {
    if (!Number.isInteger(d.observacionId) || d.observacionId <= 0) throw new ErrorIndicador(OBSERVACION_NO_EXISTE);
    const [o] = await tx`SELECT id, medicion_id, usuario_id FROM medicion_observaciones WHERE id = ${d.observacionId} AND responde_a IS NULL`;
    const m = o ? await medicionVista(tx, sesion, Number(o.medicion_id)) : null;
    if (!o || !m || !(await puedeVerSoportes(m.indicadorId, sesion, { sql: tx }))) throw new ErrorIndicador(OBSERVACION_NO_EXISTE);
    if (!puede(sesion, "indicadores.administrar") && !(await puedeAnalizar(m.indicadorId, sesion, { sql: tx })).puede) throw new ErrorPermiso();
    const [r] = await tx`INSERT INTO medicion_observaciones (medicion_id, usuario_id, texto, responde_a, creado_en)
      VALUES (${m.id}, ${sesion.usuarioId}, ${texto}, ${Number(o.id)}, ${ahora}) RETURNING id`;
    const id = Number(r.id);
    const autor = Number(o.usuario_id);
    if (autor !== sesion.usuarioId && (await autorLaVe(tx, autor, m.indicadorId))) {
      await avisarA(
        tx,
        {
          tipo: "indicadores.respuesta",
          titulo: `Respuesta a su observación en ${m.codigo}`,
          enlace: enlaceDeObservaciones(m.codigo, m.periodo),
          entidad: "medicion",
          entidadId: m.id,
        },
        [{ usuarioId: autor, cuerpo: `${sesion.nombre} respondió su observación en ${dondeEs(m)}` }],
      );
    }
    await registrarAuditoria(tx, {
      usuarioId: sesion.usuarioId,
      accion: "medicion_observacion_respondida",
      entidad: "medicion",
      entidadId: m.id,
      detalle: { codigo: m.codigo, indicadorId: m.indicadorId, periodo: m.periodo, observacionId: Number(o.id), respuestaId: id, texto },
    });
    return { id };
  });
}

/** Las observaciones de la medición con sus respuestas, autor y fecha; `null` si la persona no las ve (spec §6.4). */
export async function observacionesDe(sesion: SujetoVisibilidad, medicionId: number, opciones?: Opciones): Promise<Observacion[] | null> {
  const sql = opciones?.sql ?? obtenerSql();
  const m = await medicionVista(sql, sesion, medicionId);
  if (!m || !(await puedeVerSoportes(m.indicadorId, sesion, { sql }))) return null;
  const filas = await sql`SELECT o.id, o.texto, o.responde_a, o.creado_en, u.nombre
    FROM medicion_observaciones o JOIN usuarios u ON u.id = o.usuario_id
    WHERE o.medicion_id = ${m.id} ORDER BY o.creado_en, o.id`;
  const deFila = (f: Record<string, unknown>): Respuesta => ({
    id: Number(f.id),
    autor: f.nombre as string,
    texto: f.texto as string,
    creadoEn: new Date(f.creado_en as string),
  });
  const raices: Observacion[] = filas.filter((f) => f.responde_a === null).map((f) => ({ ...deFila(f), respuestas: [] }));
  const porId = new Map(raices.map((o) => [o.id, o]));
  for (const f of filas) {
    if (f.responde_a !== null) porId.get(Number(f.responde_a))?.respuestas.push(deFila(f));
  }
  return raices;
}

export type ResumenDeObservaciones = {
  /** Las observaciones (sin contar las respuestas) del indicador. */
  total: number;
  sinRespuesta: number;
  /** Cada medición del indicador, de la más reciente a la más antigua, con sus cuentas. */
  mediciones: { medicionId: number; periodo: string; etiqueta: string; total: number; sinRespuesta: number }[];
};

/** Lo que la pestaña «Observaciones» del indicador necesita para elegir el periodo; `null` si la persona no las ve. */
export async function resumenDeObservaciones(sesion: SujetoVisibilidad, indicadorId: number, opciones?: Opciones): Promise<ResumenDeObservaciones | null> {
  const sql = opciones?.sql ?? obtenerSql();
  if (!(await veObservaciones(sql, sesion, indicadorId))) return null;
  const filas = await sql`SELECT m.id, m.periodo,
      count(o.id)::int AS total,
      count(o.id) FILTER (WHERE NOT EXISTS (SELECT 1 FROM medicion_observaciones r WHERE r.responde_a = o.id))::int AS sin_respuesta
    FROM mediciones m
    LEFT JOIN medicion_observaciones o ON o.medicion_id = m.id AND o.responde_a IS NULL
    WHERE m.indicador_id = ${indicadorId}
    GROUP BY m.id, m.periodo, m.desde
    ORDER BY m.desde DESC`;
  const zona = zonaHoraria();
  const mediciones = filas.map((f) => ({
    medicionId: Number(f.id),
    periodo: f.periodo as string,
    etiqueta: conMayuscula(periodoDe(f.periodo as string, zona)?.etiqueta ?? (f.periodo as string)),
    total: Number(f.total),
    sinRespuesta: Number(f.sin_respuesta),
  }));
  return {
    total: mediciones.reduce((n, x) => n + x.total, 0),
    sinRespuesta: mediciones.reduce((n, x) => n + x.sinRespuesta, 0),
    mediciones,
  };
}

/** Una observación (`o`, de la medición `m`) sin respuesta; con `hasta`, de una medición cuyo periodo terminó entonces o antes. */
const sinResponder = (sql: Cliente, filtro: { hasta?: Date }) =>
  sql`o.responde_a IS NULL
    AND NOT EXISTS (SELECT 1 FROM medicion_observaciones r WHERE r.responde_a = o.id)
    ${filtro.hasta ? sql`AND m.hasta <= ${filtro.hasta}` : sql``}`;

/**
 * Cuántas observaciones siguen sin respuesta, en todo el sistema (spec §8.6 y §9: el resumen del cierre del mes). Con
 * `hasta`, solo las de mediciones cuyo periodo terminó entonces o antes.
 */
export async function sinRespuesta(sql: Cliente, filtro: { hasta?: Date }): Promise<number> {
  const [f] = await sql`SELECT count(*)::int AS n
    FROM medicion_observaciones o JOIN mediciones m ON m.id = o.medicion_id
    WHERE ${sinResponder(sql, filtro)}`;
  return Number(f.n);
}

/** Lo mismo que `sinRespuesta`, por proceso del indicador (spec §9.2); solo los procesos que tienen alguna. */
export async function sinRespuestaPorProceso(sql: Cliente, filtro: { hasta?: Date }): Promise<{ procesoId: number; proceso: string; n: number }[]> {
  const filas = await sql`SELECT p.id, p.nombre, count(*)::int AS n
    FROM medicion_observaciones o JOIN mediciones m ON m.id = o.medicion_id
    JOIN indicadores i ON i.id = m.indicador_id JOIN procesos p ON p.id = i.proceso_id
    WHERE ${sinResponder(sql, filtro)}
    GROUP BY p.id, p.nombre`;
  return filas.map((f) => ({ procesoId: Number(f.id), proceso: f.nombre as string, n: Number(f.n) }));
}
