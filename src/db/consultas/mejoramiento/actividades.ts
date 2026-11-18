/**
 * Las actividades del plan aprobado (spec 15 §10.2 a §10.4; Tarea 14): lo que ve quien abre una actividad, «Mis actividades»,
 * los seguimientos de su responsable, terminarla (con el avance en 100 y al menos un archivo de evidencia) y reasignarla. Todo
 * con el hallazgo «En ejecución». Terminar la última actividad sin terminar de la ronda en curso lleva el hallazgo a «Por
 * verificar» (`completar`) en la misma transacción.
 *
 * Cada acto: su permiso de la matriz y, en su transacción, el orden de candados del módulo: el hallazgo `FOR UPDATE`
 * (`bloquearHallazgo`), después la actividad `FOR UPDATE` y, al decidir si queda alguna abierta, las demás de la ronda. La
 * condición de persona se comprueba dentro. Quien no ve el hallazgo recibe «La actividad no existe», lo mismo que ante un id
 * que no existe; quien lo ve y no puede dar el paso, `ErrorPermiso`; después, el estado. El evento y la bitácora llevan la
 * etiqueta («A1.2»), los ids y los avances, nunca el texto libre (lo hecho, las barreras); el evento `reasignada` guarda además
 * el motivo, que lee la verificación (Tarea 16), y su bitácora no.
 */
import type { TransactionSql } from "postgres";
import { obtenerSql, type Cliente } from "@/db/cliente";
import { registrarAuditoria } from "@/db/consultas/admin";
import { avisarA } from "@/db/consultas/avisos-vencimiento";
import { enTransaccion, type OpcionesFlujo, type SesionFlujo } from "@/db/consultas/flujo/contrato";
import { lideresDeProceso } from "@/db/consultas/tramites";
import { participacionEnActividad, puedeVerHallazgo } from "@/lib/alcance";
import { EsquemaActividad, EsquemaReasignar, EsquemaSeguimiento } from "@/lib/esquemas/mejoramiento";
import { etiquetaDeEstado } from "@/lib/mejoramiento/estados";
import { fechaLargaDeDia } from "@/lib/mejoramiento/formato";
import { rutaDeActividad } from "@/lib/mejoramiento/rutas";
import {
  ACTIVIDAD_ABIERTA,
  ErrorMejora,
  SE_AJUSTA_EN,
  type EstadoActividad,
  type EstadoHallazgo,
  type HallazgoBase,
  type ResultadoCierre,
  type TipoAccion,
} from "@/lib/mejoramiento/tipos";
import { YA_CAMBIO } from "@/lib/mejoramiento/transiciones";
import { ErrorPermiso, puede, requerirPermiso } from "@/lib/permisos";
import { fechaEnZona } from "@/lib/tramites/plazos";
import { zonaHoraria } from "@/lib/zona-horaria";
import { leer } from "./analisis";
import { leerAjustes, sinLaFila, type AjusteDeDetalle } from "./ajustes-lectura";
import { archivosDe, type ArchivoDeMejora } from "./archivos";
import { ENTIDAD_ACTIVIDAD } from "./avisos";
import { contextoDeMejora, type ContextoMejora } from "./config";
import { evaluableDesde } from "./espera";
import { bloquearHallazgo, dejarEvento, legible, transicionarHallazgo } from "./flujo";
import { etiquetaDeAccion, etiquetaDeActividad } from "./plan";
import { venceLaActividad } from "./vence-actividad";

type Persona = Pick<SesionFlujo, "usuarioId" | "rol" | "verHistorial">;
type Opciones = { sql?: Cliente; ahora?: Date };

export const ACTIVIDAD_NO_EXISTE = "La actividad no existe";
export const ACTIVIDAD_CERRADA = "La actividad ya terminó o se canceló";
export const SEGUIMIENTO_FUTURO = "La fecha del seguimiento no puede ser futura";
export const SIN_EVIDENCIA_PARA_TERMINAR = "Adjunte al menos un archivo de evidencia antes de terminar";
export const AVANCE_INCOMPLETO = "Registre el avance en 100 % antes de terminar";
export const SEGUIMIENTO_TRAS_LA_DEVOLUCION = "Registre un seguimiento de lo que corrigió antes de terminarla";
export const EVIDENCIA_TRAS_LA_DEVOLUCION = "Adjunte la evidencia nueva de lo que corrigió";
export const SOLO_SIN_TERMINAR = "Solo se reasigna una actividad sin terminar";
export const MISMO_RESPONSABLE = "El responsable nuevo debe ser otra persona";
export const RESPONSABLE_NUEVO_INACTIVO = "El responsable nuevo debe ser un usuario activo";
export const avanceMenor = (anterior: number) => `El avance no puede ser menor que el del seguimiento anterior (${anterior} %)`;

/** Los avisos de una reasignación (spec §10.2 y §14.2): a quien la recibe y a quien la tenía. */
export const SE_LE_REASIGNO = "Se le reasignó una actividad";
export const SE_REASIGNO_SU_ACTIVIDAD = "Una actividad suya pasó a otra persona";

// ─────────────────────────────────────────────────────────────────────────────
// El avance (spec §10.3): puro
// ─────────────────────────────────────────────────────────────────────────────

/** El avance de una acción: el promedio simple del de sus actividades no canceladas, entero; nulo si no queda ninguna. */
export function avanceDeAccion(actividades: ReadonlyArray<{ avance: number; estado: EstadoActividad }>): number | null {
  const vivas = actividades.filter((a) => a.estado !== "cancelada");
  return vivas.length === 0 ? null : Math.round(vivas.reduce((s, a) => s + a.avance, 0) / vivas.length);
}

/** El avance del hallazgo: el promedio simple del de sus acciones (las que tienen avance), entero; nulo si ninguna lo tiene. */
export function avanceDeHallazgo(acciones: ReadonlyArray<number | null>): number | null {
  const con = acciones.filter((n): n is number => n !== null);
  return con.length === 0 ? null : Math.round(con.reduce((s, n) => s + n, 0) / con.length);
}

// ─────────────────────────────────────────────────────────────────────────────
// Lo común de los actos
// ─────────────────────────────────────────────────────────────────────────────

/** La actividad tal como la necesitan los actos: con la etiqueta (el orden de su acción) y la ronda de su acción. */
type ActividadBloqueada = {
  id: number;
  hallazgoId: number;
  rondaNumero: number;
  etiqueta: string;
  descripcion: string;
  responsableId: number;
  finOriginal: string | null;
  fin: string;
  avance: number;
  estado: EstadoActividad;
  verificacion: string | null;
};

async function bloquearActividad(tx: TransactionSql, id: number): Promise<ActividadBloqueada> {
  const [a] = await tx`SELECT a.id, a.hallazgo_id, a.orden, a.descripcion, a.responsable_id, a.avance, a.estado, a.verificacion,
      to_char(a.fin_original, 'YYYY-MM-DD') AS fin_original, to_char(a.fin, 'YYYY-MM-DD') AS fin,
      ac.orden AS accion_orden, r.numero AS ronda_numero
    FROM mejora_actividades a
    JOIN mejora_acciones ac ON ac.id = a.accion_id
    JOIN mejora_rondas r ON r.id = ac.ronda_id
    WHERE a.id = ${id} FOR UPDATE OF a`;
  if (!a) throw new ErrorMejora(ACTIVIDAD_NO_EXISTE);
  return {
    id: Number(a.id),
    hallazgoId: Number(a.hallazgo_id),
    rondaNumero: Number(a.ronda_numero),
    etiqueta: etiquetaDeActividad(Number(a.accion_orden), Number(a.orden)),
    descripcion: a.descripcion as string,
    responsableId: Number(a.responsable_id),
    finOriginal: (a.fin_original as string | null) ?? null,
    fin: a.fin as string,
    avance: Number(a.avance),
    estado: a.estado as EstadoActividad,
    verificacion: (a.verificacion as string | null) ?? null,
  };
}

/**
 * Una transacción con el orden de candados del módulo: el hallazgo de la actividad `FOR UPDATE` y después la actividad. El
 * hallazgo de una actividad no cambia nunca: se lee sin candado para tomar primero el del hallazgo.
 */
function conLaActividad<T>(
  actividadId: number,
  opciones: OpcionesFlujo | undefined,
  fn: (tx: TransactionSql, h: HallazgoBase, a: ActividadBloqueada, c: ContextoMejora) => Promise<T>,
): Promise<T> {
  const ahora = opciones?.ahora ?? new Date();
  return legible(
    enTransaccion(opciones?.sql ?? obtenerSql(), async (tx) => {
      const [d] = await tx`SELECT hallazgo_id FROM mejora_actividades WHERE id = ${actividadId}`;
      if (!d) throw new ErrorMejora(ACTIVIDAD_NO_EXISTE);
      const h = await bloquearHallazgo(tx, Number(d.hallazgo_id));
      const a = await bloquearActividad(tx, actividadId);
      return fn(tx, h, a, await contextoDeMejora(tx, ahora));
    }),
  );
}

/** Quien no puede dar el paso: `ErrorPermiso` si ve el hallazgo; si no lo ve, la actividad no existe (spec §6.3). */
async function negar(tx: Cliente, p: Persona, hallazgoId: number): Promise<never> {
  throw (await puedeVerHallazgo(hallazgoId, p, { sql: tx })) ? new ErrorPermiso() : new ErrorMejora(ACTIVIDAD_NO_EXISTE);
}

/** La actividad es de la persona: es su responsable y el plan se aprobó (en un borrador no es de nadie todavía). */
const esSuya = (p: Pick<Persona, "usuarioId">, a: Pick<ActividadBloqueada, "responsableId" | "finOriginal">) =>
  a.responsableId === p.usuarioId && a.finOriginal !== null;

/** Sigue abierta: de la ronda en curso, sin terminar ni cancelar. */
const sigueAbierta = (h: Pick<HallazgoBase, "ronda">, a: Pick<ActividadBloqueada, "rondaNumero" | "estado">) =>
  a.rondaNumero === h.ronda && ACTIVIDAD_ABIERTA.includes(a.estado);

/** El hallazgo en ejecución (si no, ya cambió) y la actividad abierta (si no, `cerrada`). */
function exigirAbierta(h: HallazgoBase, a: ActividadBloqueada, cerrada: string): void {
  if (h.estado !== "en_ejecucion") throw new ErrorMejora(YA_CAMBIO);
  if (!sigueAbierta(h, a)) throw new ErrorMejora(cerrada);
}

/** La bitácora de un acto sobre una actividad (regla 5): el código, la ronda, la etiqueta y lo que se cuenta, nunca el texto. */
async function auditarActividad(
  tx: TransactionSql,
  sesion: SesionFlujo,
  h: HallazgoBase,
  a: ActividadBloqueada,
  accion: "mejora_seguimiento" | "mejora_actividad_terminada" | "mejora_actividad_reasignada",
  detalle: Record<string, unknown>,
): Promise<void> {
  await registrarAuditoria(tx, {
    usuarioId: sesion.usuarioId,
    accion,
    entidad: ENTIDAD_ACTIVIDAD,
    entidadId: a.id,
    detalle: { codigo: h.codigo, ronda: h.ronda, hallazgoId: h.id, actividad: a.etiqueta, ...detalle },
  });
}

/** El cuerpo de un aviso de la actividad: su descripción y su fin, nunca el contenido del hallazgo. */
const cuerpoDeActividad = (a: Pick<ActividadBloqueada, "descripcion" | "fin">) =>
  `${a.descripcion.trim().replace(/[.\s]+$/, "")}. Fecha de fin: ${fechaLargaDeDia(a.fin)}.`;

// ─────────────────────────────────────────────────────────────────────────────
// Quién reasigna (spec §6.1): la misma regla para el acto y para la página
// ─────────────────────────────────────────────────────────────────────────────

/** Reasigna un Admin SGC o un líder activo del proceso del hallazgo (no `actuaPorElProceso`: el Admin SGC, siempre). */
export async function puedeReasignar(tx: Cliente, p: Persona, h: Pick<HallazgoBase, "procesoId">): Promise<boolean> {
  if (!puede(p, "mejora.formular")) return false;
  if (p.rol === "admin_sgc") return true;
  return p.rol === "lider_proceso" && (await lideresDeProceso(h.procesoId, { sql: tx })).includes(p.usuarioId);
}

/**
 * Pide cualquiera de los tres ajustes del plan (spec §6.1 y §10.6): el Admin SGC o un líder activo del proceso del hallazgo, con
 * `mejora.formular` (spec §6.2: «pedir ajustes»). El responsable de una actividad, que no es ninguno de los dos, solo pide
 * reprogramar la suya con `mejora.ejecutar` (`ajustes.ts`).
 */
export async function pideAjustesDelPlan(tx: Cliente, p: Persona, h: Pick<HallazgoBase, "procesoId">): Promise<boolean> {
  if (!puede(p, "mejora.formular")) return false;
  if (p.rol === "admin_sgc") return true;
  return p.rol === "lider_proceso" && (await lideresDeProceso(h.procesoId, { sql: tx })).includes(p.usuarioId);
}

// ─────────────────────────────────────────────────────────────────────────────
// Seguimientos (spec §10.3)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * El responsable registra un seguimiento: la fecha (de hoy hacia atrás, en la zona de la instalación), lo que se hizo, el
 * avance y las barreras. El avance no baja del último seguimiento registrado, salvo con la actividad devuelta en la
 * verificación. La actividad pasa a «En proceso» con ese avance y su recordatorio se borra (spec §10.5). De solo inserción:
 * uno equivocado se corrige con otro.
 */
export async function registrarSeguimiento(
  sesion: SesionFlujo,
  d: { actividadId: number; fecha: string; realizado: string; avance: number; barreras?: string | null },
  opciones?: OpcionesFlujo,
): Promise<{ id: number }> {
  requerirPermiso(sesion, "mejora.ejecutar");
  const v = leer(EsquemaSeguimiento, d);
  return conLaActividad(v.actividadId, opciones, async (tx, h, a, c) => {
    if (!esSuya(sesion, a)) await negar(tx, sesion, h.id);
    exigirAbierta(h, a, ACTIVIDAD_CERRADA);
    if (v.fecha > fechaEnZona(c.ahora, c.zona)) throw new ErrorMejora(SEGUIMIENTO_FUTURO);
    const [anterior] = await tx`SELECT avance FROM mejora_seguimientos WHERE actividad_id = ${a.id} ORDER BY id DESC LIMIT 1`;
    if (anterior && a.verificacion !== "devuelta" && v.avance < Number(anterior.avance)) {
      throw new ErrorMejora(avanceMenor(Number(anterior.avance)));
    }
    const [s] = await tx`INSERT INTO mejora_seguimientos (hallazgo_id, actividad_id, fecha, realizado, avance, barreras, registrado_por, creado_en)
      VALUES (${h.id}, ${a.id}, ${v.fecha}, ${v.realizado}, ${v.avance}, ${v.barreras}, ${sesion.usuarioId}, ${c.ahora})
      RETURNING id`;
    const id = Number(s.id);
    await tx`UPDATE mejora_actividades SET estado = 'en_proceso', avance = ${v.avance}, recordatorio_en = NULL WHERE id = ${a.id}`;
    const avance = { antes: a.avance, despues: v.avance };
    await dejarEvento(tx, {
      hallazgoId: h.id,
      ronda: h.ronda,
      tipo: "seguimiento",
      detalle: { actividadId: a.id, actividad: a.etiqueta, seguimientoId: id, avance },
      usuarioId: sesion.usuarioId,
      ocurrioEn: c.ahora,
    });
    await auditarActividad(tx, sesion, h, a, "mejora_seguimiento", { seguimientoId: id, fecha: v.fecha, avance });
    return { id };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Terminar (spec §10.4)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lo que había en la actividad cuando la verificación la devolvió por última vez (spec §11.4): los archivos y el último
 * seguimiento, guardados en la nota de su evento `verificar_implementacion`. Lo que se registre o suba después tiene un id
 * mayor: el id dice «después» sin depender de dos relojes, como la evidencia de la corrección. Sin ese evento, nada.
 */
async function loDeLaDevolucion(tx: TransactionSql, h: Pick<HallazgoBase, "id">, actividadId: number): Promise<{ archivos: number[]; seguimiento: number }> {
  const [e] = await tx`SELECT detalle->'notas' AS notas FROM mejora_eventos
    WHERE hallazgo_id = ${h.id} AND tipo = 'verificar_implementacion' AND detalle->'notas' @> ${tx.json([{ actividadId }] as never)}
    ORDER BY id DESC LIMIT 1`;
  const nota = Array.isArray(e?.notas)
    ? (e.notas as Array<{ actividadId?: unknown; archivos?: unknown; seguimiento?: unknown }>).find((n) => n.actividadId === actividadId)
    : undefined;
  const archivos = Array.isArray(nota?.archivos) ? nota.archivos.map(Number).filter(Number.isSafeInteger) : [];
  return { archivos, seguimiento: typeof nota?.seguimiento === "number" ? nota.seguimiento : 0 };
}

/**
 * El responsable termina su actividad: con el avance en 100 y al menos un archivo de evidencia de esa actividad, contado
 * dentro de la transacción (una subida en curso espera al hallazgo bloqueado, o ya está confirmada y se cuenta). Guarda
 * cuándo terminó de verdad y quién, y borra la verificación de una vuelta anterior. Una actividad devuelta en la verificación
 * no se termina con lo mismo: pide además un seguimiento y un archivo posteriores a la devolución (`loDeLaDevolucion`). Si no
 * queda ninguna actividad abierta en la ronda en curso (leídas y bloqueadas después del hallazgo: dos responsables que
 * terminan a la vez van en fila), el hallazgo pasa a «Por verificar» por `transicionarHallazgo`.
 */
export async function terminarActividad(sesion: SesionFlujo, d: { actividadId: number }, opciones?: OpcionesFlujo): Promise<void> {
  requerirPermiso(sesion, "mejora.ejecutar");
  const v = leer(EsquemaActividad, d);
  await conLaActividad(v.actividadId, opciones, async (tx, h, a, c) => {
    if (!esSuya(sesion, a)) await negar(tx, sesion, h.id);
    exigirAbierta(h, a, ACTIVIDAD_CERRADA);
    if (a.avance !== 100) throw new ErrorMejora(AVANCE_INCOMPLETO);
    const [{ n }] = await tx`SELECT count(*)::int AS n FROM archivos
      WHERE contexto = 'mejora_actividad' AND contexto_id = ${a.id} AND version_id IS NULL`;
    const archivos = Number(n);
    if (archivos === 0) throw new ErrorMejora(SIN_EVIDENCIA_PARA_TERMINAR);
    // Una devuelta no se termina con lo mismo (spec §11.4, PC-05): un seguimiento y un archivo posteriores a la devolución.
    if (a.verificacion === "devuelta") {
      const antes = await loDeLaDevolucion(tx, h, a.id);
      const [seguimiento] = await tx`SELECT 1 FROM mejora_seguimientos WHERE actividad_id = ${a.id} AND id > ${antes.seguimiento} LIMIT 1`;
      if (!seguimiento) throw new ErrorMejora(SEGUIMIENTO_TRAS_LA_DEVOLUCION);
      const [nuevo] = await tx`SELECT 1 FROM archivos
        WHERE contexto = 'mejora_actividad' AND contexto_id = ${a.id} AND version_id IS NULL AND id > ${Math.max(0, ...antes.archivos)} LIMIT 1`;
      if (!nuevo) throw new ErrorMejora(EVIDENCIA_TRAS_LA_DEVOLUCION);
    }
    await tx`UPDATE mejora_actividades
      SET estado = 'terminada', terminada_en = ${c.ahora}, terminada_por = ${sesion.usuarioId},
        verificacion = NULL, verificacion_nota = NULL, corregir_antes_de = NULL
      WHERE id = ${a.id}`;
    const abiertas = await tx`SELECT a.id FROM mejora_actividades a
      JOIN mejora_acciones ac ON ac.id = a.accion_id
      JOIN mejora_rondas r ON r.id = ac.ronda_id
      WHERE a.hallazgo_id = ${h.id} AND r.numero = ${h.ronda} AND a.estado IN ('abierta', 'en_proceso')
      ORDER BY a.id FOR UPDATE OF a`;
    const completa = abiertas.length === 0;
    await dejarEvento(tx, {
      hallazgoId: h.id,
      ronda: h.ronda,
      tipo: "actividad_terminada",
      detalle: { actividadId: a.id, actividad: a.etiqueta, archivos },
      usuarioId: sesion.usuarioId,
      ocurrioEn: c.ahora,
    });
    await auditarActividad(tx, sesion, h, a, "mejora_actividad_terminada", { archivos, ...(completa ? { ultima: true } : {}) });
    if (completa) {
      await transicionarHallazgo(tx, sesion, h, "completar", { detalle: { actividadId: a.id, actividad: a.etiqueta } }, c);
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Reasignar (spec §10.2)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Un líder del proceso o el Admin SGC cambian el responsable de una actividad sin terminar, con motivo y sin aprobación. El
 * responsable nuevo es un usuario activo y distinto. La marca del aviso de vencida se borra (la persona nueva recibe el suyo) y
 * el recordatorio de seguimiento cuenta desde la reasignación (`recordatorio_en = ahora`, como en la devolución: si se borrara,
 * contaría desde el último seguimiento, de otra persona, y la nueva lo recibiría en la pasada siguiente); la del escalamiento al
 * jefe se conserva: la actividad ya se escaló y reasignarla no la escala otra
 * vez, de inmediato, al jefe de la persona nueva (spec §14.3). Deja el evento `reasignada` con la forma
 * `{ actividadId, antes, despues, motivo }` (la Tarea 16 lee de ahí quién **fue** responsable), su bitácora sin el motivo y un
 * aviso a cada uno de los dos (salvo a quien reasigna y a un anterior inactivo): al nuevo, con el enlace a la actividad; al
 * anterior, sin enlace (puede haber perdido el hallazgo).
 */
export async function reasignarActividad(
  sesion: SesionFlujo,
  d: { actividadId: number; responsableId: number; motivo: string },
  opciones?: OpcionesFlujo,
): Promise<void> {
  requerirPermiso(sesion, "mejora.formular");
  const v = leer(EsquemaReasignar, d);
  await conLaActividad(v.actividadId, opciones, async (tx, h, a, c) => {
    if (!(await puedeReasignar(tx, sesion, h))) await negar(tx, sesion, h.id);
    exigirAbierta(h, a, SOLO_SIN_TERMINAR);
    if (v.responsableId === a.responsableId) throw new ErrorMejora(MISMO_RESPONSABLE);
    // El nuevo `FOR SHARE`, después de la actividad: nadie lo desactiva hasta que el acto termine.
    const [nuevo] = await tx`SELECT id FROM usuarios WHERE id = ${v.responsableId} AND activo FOR SHARE`;
    if (!nuevo) throw new ErrorMejora(RESPONSABLE_NUEVO_INACTIVO);
    const [anterior] = await tx`SELECT activo FROM usuarios WHERE id = ${a.responsableId}`;
    await tx`UPDATE mejora_actividades
      SET responsable_id = ${v.responsableId}, aviso_vencido_en = NULL, recordatorio_en = ${c.ahora}
      WHERE id = ${a.id}`;
    await dejarEvento(tx, {
      hallazgoId: h.id,
      ronda: h.ronda,
      tipo: "reasignada",
      detalle: { actividadId: a.id, antes: a.responsableId, despues: v.responsableId, motivo: v.motivo },
      usuarioId: sesion.usuarioId,
      ocurrioEn: c.ahora,
    });
    await auditarActividad(tx, sesion, h, a, "mejora_actividad_reasignada", { antes: a.responsableId, despues: v.responsableId });
    const cuerpo = cuerpoDeActividad(a);
    const tipo = "mejora.actividad_reasignada";
    if (v.responsableId !== sesion.usuarioId) {
      await avisarA(
        tx,
        { tipo, titulo: SE_LE_REASIGNO, enlace: rutaDeActividad(a.id), entidad: ENTIDAD_ACTIVIDAD, entidadId: a.id },
        [{ usuarioId: v.responsableId, cuerpo }],
      );
    }
    if (anterior?.activo === true && a.responsableId !== sesion.usuarioId) {
      await avisarA(
        tx,
        { tipo, titulo: SE_REASIGNO_SU_ACTIVIDAD, enlace: null, entidad: ENTIDAD_ACTIVIDAD, entidadId: a.id },
        [{ usuarioId: a.responsableId, cuerpo }],
      );
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Lecturas
// ─────────────────────────────────────────────────────────────────────────────

export type SeguimientoDeActividad = {
  id: number;
  fecha: string;
  realizado: string;
  avance: number;
  barreras: string | null;
  quien: string;
  creadoEn: Date;
};

export type DetalleDeActividad = {
  id: number;
  /** «A1.2»: el orden de su acción en la ronda y el suyo. */
  etiqueta: string;
  descripcion: string;
  responsableId: number;
  responsable: string;
  /** Si el responsable sigue activo: si no, la página lo dice y ofrece reasignarla (Review Focus 2). */
  responsableActivo: boolean;
  inicio: string;
  finOriginal: string | null;
  fin: string;
  avance: number;
  estado: EstadoActividad;
  reprogramaciones: number;
  terminadaEn: Date | null;
  terminadaPor: string | null;
  /** La verificación de la implementación (Tarea 16): `devuelta` trae la nota de quien verificó y la fecha para corregir. */
  verificacion: "conforme" | "devuelta" | null;
  verificacionNota: string | null;
  corregirAntesDe: string | null;
  /** El día en que vence (`venceLaActividad`): la fecha para corregir si se devolvió, si no `fin`. */
  vence: string;
  /**
   * Sin terminar ni cancelar y con su fecha ya pasada en la zona (spec §10.2): la fecha para corregir si se devolvió, si no el fin
   * vigente (`venceLaActividad`).
   */
  vencida: boolean;
  accion: { id: number; etiqueta: string; tipo: TipoAccion; descripcion: string };
  hallazgo: {
    id: number;
    codigo: string;
    titulo: string;
    proceso: string;
    estado: EstadoHallazgo;
    etiqueta: string;
    ronda: number;
    /** Cómo ve quien mira el hallazgo (`participacionEnHallazgo`). */
    ve: "completo" | "actividad";
  };
  /** Del más reciente al más antiguo, por fecha. */
  seguimientos: SeguimientoDeActividad[];
  /** Los de la actividad, solo si quien mira los abre (`archivosDe`). */
  archivos: ArchivoDeMejora[];
  esResponsable: boolean;
  /** Puede registrar seguimientos, adjuntar evidencia y terminarla: es suya y sigue abierta en un hallazgo en ejecución. */
  puedeSeguir: boolean;
  /** Puede reasignarla (`puedeReasignar`) y sigue abierta en un hallazgo en ejecución. */
  puedeReasignar: boolean;
  /** El avance más bajo que admite el próximo seguimiento: el del último registrado; 0 si no hay o si está devuelta. */
  avanceMinimo: number;
  /** El ajuste por decidir de la actividad, si hay uno (spec §10.6): su tipo y, en una reprogramación, la fecha que pide. */
  ajustePendiente: { id: number; tipo: string; pedidoEn: Date; finNuevo: string | null } | null;
  /**
   * Puede pedir que se reprograme (spec §10.6, «Pedir ajuste de fecha»): su responsable, un líder del proceso o el Admin SGC,
   * con la actividad abierta en un hallazgo que admite ajustes y sin otro ajuste por decidir.
   */
  puedePedirAjuste: boolean;
  /** Cuándo se escaló a Gerencia (spec §10.7), o nulo. */
  gerenciaEn: Date | null;
  /** Los ajustes de esta actividad (spec §10.6), con su causa y su decisión: la página del hallazgo no se los da a su responsable. */
  ajustes: AjusteDeDetalle[];
};

const fechaHoy = (ahora: Date) => fechaEnZona(ahora, zonaHoraria());

/**
 * La actividad de un plan aprobado para quien puede abrirla (`participacionEnActividad`: quien ve el hallazgo completo, su
 * responsable y quien registró un seguimiento en ella); nulo si no existe **o** si no la ve (la misma respuesta).
 */
export async function leerActividad(sesion: SesionFlujo, id: number, opciones?: Opciones): Promise<DetalleDeActividad | null> {
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  const sql = opciones?.sql ?? obtenerSql();
  const ahora = opciones?.ahora ?? new Date();
  const ve = await participacionEnActividad(id, sesion, { sql });
  if (ve === null) return null;
  const [f] = await sql`
    SELECT a.id, a.orden, a.descripcion, a.responsable_id, u.nombre AS responsable, u.activo AS responsable_activo, a.avance,
      a.estado, a.reprogramaciones, a.terminada_en, ut.nombre AS terminada_por, a.verificacion, a.verificacion_nota, a.gerencia_en,
      to_char(a.inicio, 'YYYY-MM-DD') AS inicio, to_char(a.fin_original, 'YYYY-MM-DD') AS fin_original,
      to_char(a.fin, 'YYYY-MM-DD') AS fin, to_char(a.corregir_antes_de, 'YYYY-MM-DD') AS corregir_antes_de,
      to_char(${venceLaActividad(sql)}, 'YYYY-MM-DD') AS vence, ac.id AS accion_id, ac.orden AS accion_orden, ac.tipo AS accion_tipo, ac.descripcion AS accion_descripcion,
      r.numero AS ronda_numero, h.id AS hallazgo_id, h.codigo, h.titulo, h.estado AS hallazgo_estado, h.ronda,
      h.proceso_id, h.resultado_cierre, h.correccion_requerida, p.nombre AS proceso
    FROM mejora_actividades a
    JOIN mejora_acciones ac ON ac.id = a.accion_id
    JOIN mejora_rondas r ON r.id = ac.ronda_id
    JOIN mejora_hallazgos h ON h.id = a.hallazgo_id
    JOIN procesos p ON p.id = h.proceso_id
    JOIN usuarios u ON u.id = a.responsable_id
    LEFT JOIN usuarios ut ON ut.id = a.terminada_por
    WHERE a.id = ${id}`;
  if (!f) return null;
  const hallazgoId = Number(f.hallazgo_id);
  const [seguimientos, archivos, ajustes, deLaActividad] = await Promise.all([
    sql`SELECT s.id, to_char(s.fecha, 'YYYY-MM-DD') AS fecha, s.realizado, s.avance, s.barreras, s.creado_en, u.nombre AS quien
      FROM mejora_seguimientos s JOIN usuarios u ON u.id = s.registrado_por
      WHERE s.actividad_id = ${id} ORDER BY s.fecha DESC, s.id DESC`,
    archivosDe(sql, sesion, { contexto: "mejora_actividad", contextoId: id }),
    sql`SELECT id, tipo, pedido_en, datos->>'finNuevo' AS fin_nuevo
      FROM mejora_ajustes WHERE actividad_id = ${id} AND estado = 'pendiente' ORDER BY id DESC LIMIT 1`,
    leerAjustes(sql, { actividadId: id }),
  ]);
  const estado = f.estado as EstadoActividad;
  const estadoHallazgo = f.hallazgo_estado as EstadoHallazgo;
  const ronda = Number(f.ronda);
  const deLaRonda = sigueAbierta({ ronda }, { rondaNumero: Number(f.ronda_numero), estado });
  const abierta = estadoHallazgo === "en_ejecucion" && deLaRonda;
  const esResponsable = Number(f.responsable_id) === sesion.usuarioId;
  const devuelta = f.verificacion === "devuelta";
  // El último registrado (por id), como lo compara `registrarSeguimiento`; la lista va por fecha.
  const ultimo = seguimientos.reduce<(typeof seguimientos)[number] | null>((m, s) => (m === null || Number(s.id) > Number(m.id) ? s : m), null);
  const fin = f.fin as string;
  const [ajuste] = ajustes;
  // La regla de `pedirAjuste` para reprogramar, con lo ya leído (el dominio la vuelve a comprobar dentro de su transacción).
  const ajustable = SE_AJUSTA_EN.includes(estadoHallazgo) && deLaRonda && f.fin_original !== null && !ajuste && puede(sesion, "mejora.ejecutar");
  const puedePedirAjuste =
    ajustable && (esResponsable || (await pideAjustesDelPlan(sql, sesion, { procesoId: Number(f.proceso_id) })));
  return {
    id: Number(f.id),
    etiqueta: etiquetaDeActividad(Number(f.accion_orden), Number(f.orden)),
    descripcion: f.descripcion as string,
    responsableId: Number(f.responsable_id),
    responsable: f.responsable as string,
    responsableActivo: f.responsable_activo === true,
    inicio: f.inicio as string,
    finOriginal: (f.fin_original as string | null) ?? null,
    fin,
    avance: Number(f.avance),
    estado,
    reprogramaciones: Number(f.reprogramaciones),
    terminadaEn: (f.terminada_en as Date | null) ?? null,
    terminadaPor: (f.terminada_por as string | null) ?? null,
    verificacion: (f.verificacion as "conforme" | "devuelta" | null) ?? null,
    verificacionNota: (f.verificacion_nota as string | null) ?? null,
    corregirAntesDe: (f.corregir_antes_de as string | null) ?? null,
    vence: f.vence as string,
    // La regla de la pasada y de las tareas (`venceLaActividad`): devuelta, la fecha para corregir.
    vencida: ACTIVIDAD_ABIERTA.includes(estado) && (f.vence as string) < fechaHoy(ahora),
    accion: {
      id: Number(f.accion_id),
      etiqueta: etiquetaDeAccion(Number(f.accion_orden)),
      tipo: f.accion_tipo as TipoAccion,
      descripcion: f.accion_descripcion as string,
    },
    hallazgo: {
      id: hallazgoId,
      codigo: f.codigo as string,
      titulo: f.titulo as string,
      proceso: f.proceso as string,
      estado: estadoHallazgo,
      etiqueta: etiquetaDeEstado(
        {
          estado: estadoHallazgo,
          resultadoCierre: (f.resultado_cierre as ResultadoCierre | null) ?? null,
          correccionRequerida: (f.correccion_requerida as boolean | null) ?? null,
        },
        // «Por evaluar la eficacia» con la misma regla de la lista y la página (R4).
        { yaSePuedeEvaluar: estadoHallazgo === "en_espera" && (await evaluableDesde(sql, hallazgoId, ahora))?.yaSePuede === true },
      ),
      ronda,
      ve,
    },
    seguimientos: seguimientos.map((s) => ({
      id: Number(s.id),
      fecha: s.fecha as string,
      realizado: s.realizado as string,
      avance: Number(s.avance),
      barreras: (s.barreras as string | null) ?? null,
      quien: s.quien as string,
      creadoEn: s.creado_en as Date,
    })),
    archivos,
    esResponsable,
    puedeSeguir: esResponsable && abierta,
    puedeReasignar: abierta && (await puedeReasignar(sql, sesion, { procesoId: Number(f.proceso_id) })),
    avanceMinimo: ultimo && !devuelta ? Number(ultimo.avance) : 0,
    ajustePendiente: ajuste
      ? { id: Number(ajuste.id), tipo: ajuste.tipo as string, pedidoEn: ajuste.pedido_en as Date, finNuevo: (ajuste.fin_nuevo as string | null) ?? null }
      : null,
    puedePedirAjuste,
    gerenciaEn: (f.gerencia_en as Date | null) ?? null,
    ajustes: deLaActividad.map(sinLaFila),
  };
}

/** Cuántas actividades de planes aprobados tiene hoy a su cargo la persona (las de `misActividades`), sin leerlas. */
export async function contarMisActividades(sesion: Pick<SesionFlujo, "usuarioId">, opciones?: Opciones): Promise<number> {
  const sql = opciones?.sql ?? obtenerSql();
  const [f] = await sql`SELECT count(*)::int AS n FROM mejora_actividades
    WHERE responsable_id = ${sesion.usuarioId} AND fin_original IS NOT NULL`;
  return Number(f.n);
}

export type ActividadPropia = {
  id: number;
  descripcion: string;
  hallazgoId: number;
  hallazgoCodigo: string;
  etiqueta: string;
  fin: string;
  /** El día en que vence (`venceLaActividad`): la fecha para corregir si se devolvió, si no `fin`. */
  vence: string;
  avance: number;
  estado: EstadoActividad;
  vencida: boolean;
  devuelta: boolean;
};

/**
 * «Mis actividades» (spec §16.1): las actividades de planes aprobados de las que la persona es responsable hoy, las abiertas
 * primero y por su fin. Una reasignada deja de estar aquí para quien la tenía.
 */
export async function misActividades(sesion: Pick<SesionFlujo, "usuarioId">, opciones?: Opciones): Promise<ActividadPropia[]> {
  const sql = opciones?.sql ?? obtenerSql();
  const hoy = fechaHoy(opciones?.ahora ?? new Date());
  const filas = await sql`
    SELECT a.id, a.descripcion, a.orden, a.avance, a.estado, a.verificacion, to_char(a.fin, 'YYYY-MM-DD') AS fin,
      to_char(${venceLaActividad(sql)}, 'YYYY-MM-DD') AS vence, ac.orden AS accion_orden, h.id AS hallazgo_id, h.codigo
    FROM mejora_actividades a
    JOIN mejora_acciones ac ON ac.id = a.accion_id
    JOIN mejora_hallazgos h ON h.id = a.hallazgo_id
    WHERE a.responsable_id = ${sesion.usuarioId} AND a.fin_original IS NOT NULL
    ORDER BY (a.estado IN ('abierta', 'en_proceso')) DESC, a.fin, a.id`;
  return filas.map((f) => {
    const estado = f.estado as EstadoActividad;
    const fin = f.fin as string;
    return {
      id: Number(f.id),
      descripcion: f.descripcion as string,
      hallazgoId: Number(f.hallazgo_id),
      hallazgoCodigo: f.codigo as string,
      etiqueta: etiquetaDeActividad(Number(f.accion_orden), Number(f.orden)),
      fin,
      avance: Number(f.avance),
      estado,
      vence: f.vence as string,
      vencida: ACTIVIDAD_ABIERTA.includes(estado) && (f.vence as string) < hoy,
      devuelta: f.verificacion === "devuelta",
    };
  });
}
