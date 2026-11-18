/**
 * Los ajustes al plan aprobado (spec 15 §10.6) y la escalada a Gerencia (§10.7); Tarea 15. Un plan aprobado solo cambia por un
 * ajuste: reprogramar una actividad sin terminar, añadir una actividad (en una acción del plan o en una nueva) o cancelar una
 * actividad sin terminar. Lo pide el responsable (solo reprogramar la suya), un líder del proceso o el Admin SGC, siempre con la
 * causa; lo decide el rol que aprobó el plan de la ronda en curso (`quienDecideAjustes`), nunca quien lo pidió. Mientras se
 * decide, la actividad sigue como está: si venció, sigue vencida. Aprobado, el cambio entra en la misma transacción y el hallazgo
 * pasa por `transicionarHallazgo(…, "ajustar")`: queda «En ejecución» si alguna actividad de la ronda sigue sin terminar, o «Por
 * verificar» si no. **Nunca** toca la fecha de fin original de una actividad existente, el cierre previsto ni el evento con el
 * plan congelado: una actividad añadida nace con su fin como fecha original (si no, su responsable no vería el hallazgo).
 *
 * Escalar a Gerencia no cambia ningún estado: deja `gerencia_en`, su evento y un aviso a cada usuario de Gerencia, que responde
 * una vez por escalada con su nota y, si quiere, el acta. La nota de la escalada y la de la respuesta solo tienen el evento:
 * van en él (como el motivo de una reasignación) y no en la bitácora.
 *
 * Orden de candados del módulo: el hallazgo `FOR UPDATE` (`bloquearHallazgo`), después el ajuste `FOR UPDATE`, después la
 * actividad y, al decidir cómo queda el hallazgo, las demás actividades de la ronda; al final, el responsable nuevo `FOR SHARE`.
 * La condición de persona y el estado se comprueban dentro, después de los candados. Quien no ve el hallazgo recibe «no
 * existe»; quien lo ve y no puede dar el paso, `ErrorPermiso`. Los eventos y la bitácora llevan ids, el tipo, las etiquetas
 * («A1.2») y las fechas, nunca la causa, la nota de la decisión ni el texto de la actividad nueva: quedan en su fila.
 */
import type { TransactionSql } from "postgres";
import type { z } from "zod";
import { obtenerSql, type Cliente } from "@/db/cliente";
import { registrarAuditoria } from "@/db/consultas/admin";
import { avisarA } from "@/db/consultas/avisos-vencimiento";
import { enTransaccion, type OpcionesFlujo, type SesionFlujo } from "@/db/consultas/flujo/contrato";
import { participacionEnActividad, puedeVerHallazgo, type SujetoVisibilidad } from "@/lib/alcance";
import {
  cambioDeAjuste,
  DEMASIADAS_ACTIVIDADES,
  EsquemaDecidirAjuste,
  EsquemaEscalar,
  EsquemaPedirAjuste,
  EsquemaResponderEscalada,
  type ActividadQueSeAnade,
} from "@/lib/esquemas/mejoramiento";
import { fechaLargaDeDia } from "@/lib/mejoramiento/formato";
import { venceEn } from "@/lib/mejoramiento/plazos";
import { FECHA_DEL_AJUSTE_PASADA, fechaDelAjustePasada } from "@/lib/mejoramiento/reglas";
import { rutaDeActividad, rutaDeHallazgo } from "@/lib/mejoramiento/rutas";
import { fraseDelAjuste } from "@/lib/mejoramiento/textos";
import {
  ACTIVIDAD_ABIERTA,
  ErrorMejora,
  MAXIMO_DE_ACCIONES,
  MAXIMO_DE_ACTIVIDADES,
  SE_AJUSTA_EN,
  type EstadoActividad,
  type EstadoAjuste,
  type HallazgoBase,
  type TipoAjuste,
} from "@/lib/mejoramiento/tipos";
import { YA_CAMBIO } from "@/lib/mejoramiento/transiciones";
import { ErrorPermiso, puede, requerirPermiso } from "@/lib/permisos";
import type { Rol } from "@/lib/roles";
import { fechaEnZona } from "@/lib/tramites/plazos";
import { ACTIVIDAD_CERRADA, ACTIVIDAD_NO_EXISTE, pideAjustesDelPlan } from "./actividades";
import { leer } from "./analisis";
import { ACTIVIDAD_ASIGNADA } from "./aprobacion";
import { activosDeRol, avisarDeMejora, ENTIDAD_ACTIVIDAD, ENTIDAD_HALLAZGO } from "./avisos";
import { contextoDeMejora, type ContextoMejora } from "./config";
import { bloquearHallazgo, dejarEvento, legible, NO_EXISTE, transicionarHallazgo } from "./flujo";
import { ACCION_AJENA, CAUSA_AJENA, DEMASIADAS_ACCIONES, etiquetaDeAccion, etiquetaDeActividad, RESPONSABLE_INACTIVO } from "./plan";
import { venceLaActividad } from "./vence-actividad";

type Persona = Pick<SesionFlujo, "usuarioId" | "rol" | "verHistorial">;
type Acta = { numero: string; fecha: string } | null;

export const AJUSTE_NO_EXISTE = "El ajuste no existe";
export const YA_SE_DECIDIO = "Ese ajuste ya se decidió";
export const UN_PENDIENTE_POR_ACTIVIDAD = "Ya hay un ajuste por decidir para esa actividad";
export const FIN_NUEVO_PASADO = "La fecha nueva debe ser de hoy en adelante";
export const FIN_NUEVO_IGUAL = "La fecha nueva es la que ya tiene la actividad";
export const FIN_NUEVO_ANTES_DEL_INICIO = "La fecha nueva no puede ser anterior al inicio de la actividad";
export const FIN_DE_LA_NUEVA_PASADO = "La fecha de fin de la actividad nueva debe ser de hoy en adelante";
export const CORRECTIVA_SIN_CAUSA = "La acción correctiva nueva debe decir qué causa ataca";
export const UNICA_ACTIVIDAD = "No se puede cancelar la única actividad del hallazgo";
export const AJUSTE_ILEGIBLE = "Lo que pide ese ajuste no se puede leer: niéguelo para que se pida otra vez";
export const SOLO_VENCIDA = "Solo se escala una actividad vencida";
export const YA_ESCALADA = "La actividad ya está escalada a Gerencia";
export const NO_ESCALADA = "Esa actividad no está escalada a Gerencia";
export const YA_RESPONDIDA = "Esa escalada ya tiene respuesta";
export const SIN_GERENCIA_ACTIVA = "No hay ningún usuario de Gerencia activo a quien escalar";

/** Los avisos de un ajuste decidido, a quien lo pidió (spec §14.2), y de una escalada, a Gerencia (§10.7). */
export const AJUSTE_APROBADO = "Se aprobó el ajuste que pidió";
export const AJUSTE_NEGADO = "Se negó el ajuste que pidió";
export const ESCALADA_RESPONDIDA = "Gerencia respondió una escalada";

/** El índice único parcial de un ajuste pendiente por actividad (migración 0018). */
const INDICE_UN_PENDIENTE = "mejora_ajustes_un_pendiente_idx";

// ─────────────────────────────────────────────────────────────────────────────
// Lo común
// ─────────────────────────────────────────────────────────────────────────────

/** La actividad como la necesitan los ajustes y la escalada: su etiqueta, su ronda y sus fechas. */
type ActividadDelAjuste = {
  id: number;
  hallazgoId: number;
  rondaNumero: number;
  etiqueta: string;
  descripcion: string;
  responsableId: number;
  inicio: string;
  fin: string;
  finOriginal: string | null;
  /** El día en que vence (`venceLaActividad`): la fecha para corregir si se devolvió, si no `fin`. */
  vence: string;
  estado: EstadoActividad;
  gerenciaEn: Date | null;
};

async function bloquearActividad(tx: TransactionSql, id: number): Promise<ActividadDelAjuste> {
  const [a] = await tx`SELECT a.id, a.hallazgo_id, a.orden, a.descripcion, a.responsable_id, a.estado, a.gerencia_en,
      to_char(a.inicio, 'YYYY-MM-DD') AS inicio, to_char(a.fin, 'YYYY-MM-DD') AS fin,
      to_char(a.fin_original, 'YYYY-MM-DD') AS fin_original, to_char(${venceLaActividad(tx)}, 'YYYY-MM-DD') AS vence,
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
    inicio: a.inicio as string,
    fin: a.fin as string,
    finOriginal: (a.fin_original as string | null) ?? null,
    vence: a.vence as string,
    estado: a.estado as EstadoActividad,
    gerenciaEn: (a.gerencia_en as Date | null) ?? null,
  };
}

/** De un plan aprobado, de la ronda en curso y sin terminar ni cancelar: la única que se reprograma, se cancela o se escala. */
const sigueAbierta = (h: Pick<HallazgoBase, "ronda">, a: ActividadDelAjuste) =>
  a.finOriginal !== null && a.rondaNumero === h.ronda && ACTIVIDAD_ABIERTA.includes(a.estado);

/** Quien no puede dar el paso: `ErrorPermiso` si ve el hallazgo; si no lo ve, no existe (spec §6.3). */
async function negar(tx: Cliente, p: Persona, hallazgoId: number, noExiste = NO_EXISTE): Promise<never> {
  throw (await puedeVerHallazgo(hallazgoId, p, { sql: tx })) ? new ErrorPermiso() : new ErrorMejora(noExiste);
}

function exigirActa(acta: Acta, c: ContextoMejora): void {
  if (acta && acta.fecha > fechaEnZona(c.ahora, c.zona)) throw new ErrorMejora("La fecha del acta no puede ser futura");
}

const conActa = (acta: Acta) => (acta ? { acta } : {});

/**
 * Una transacción con el orden de candados del módulo sobre una actividad: su hallazgo `FOR UPDATE` y después ella. El hallazgo
 * de una actividad no cambia nunca: se lee sin candado para tomar primero el del hallazgo.
 */
function conLaActividad<T>(
  actividadId: number,
  opciones: OpcionesFlujo | undefined,
  fn: (tx: TransactionSql, h: HallazgoBase, a: ActividadDelAjuste, c: ContextoMejora) => Promise<T>,
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

/** Las actividades de la ronda en curso `FOR UPDATE`, después del hallazgo, el ajuste y la actividad del ajuste. */
async function bloquearLasDeLaRonda(tx: TransactionSql, h: Pick<HallazgoBase, "id" | "ronda">): Promise<Array<{ id: number; estado: EstadoActividad }>> {
  const filas = await tx`SELECT a.id, a.estado FROM mejora_actividades a
    JOIN mejora_acciones ac ON ac.id = a.accion_id
    JOIN mejora_rondas r ON r.id = ac.ronda_id
    WHERE a.hallazgo_id = ${h.id} AND r.numero = ${h.ronda}
    ORDER BY a.id FOR UPDATE OF a`;
  return filas.map((f) => ({ id: Number(f.id), estado: f.estado as EstadoActividad }));
}

/** «No se puede cancelar la última actividad no cancelada» (spec §10.6), contada sobre la ronda en curso (R5). */
async function exigirOtraSinCancelar(tx: TransactionSql, h: Pick<HallazgoBase, "id" | "ronda">, actividadId: number): Promise<void> {
  const otras = (await bloquearLasDeLaRonda(tx, h)).filter((a) => a.id !== actividadId);
  if (!otras.some((a) => a.estado !== "cancelada")) throw new ErrorMejora(UNICA_ACTIVIDAD);
}

/** La acción existente de la actividad que se añade: de la ronda en curso de este hallazgo. */
async function accionDeLaRonda(tx: TransactionSql, h: Pick<HallazgoBase, "id">, rondaId: number, accionId: number): Promise<{ id: number; orden: number }> {
  const [a] = await tx`SELECT id, orden FROM mejora_acciones
    WHERE id = ${accionId} AND hallazgo_id = ${h.id} AND ronda_id = ${rondaId} FOR UPDATE`;
  if (!a) throw new ErrorMejora(ACCION_AJENA);
  return { id: Number(a.id), orden: Number(a.orden) };
}

/**
 * Lo que se revisa de una actividad que se añade, como al guardar una acción del plan (`guardarAccion`): la acción, de la ronda
 * en curso y con cupo (treinta actividades); una acción nueva, con cupo en la ronda y, si es correctiva, con al menos una causa,
 * todas de la ronda; y el
 * responsable, activo (`FOR SHARE` al aprobar, después de las actividades: nadie lo desactiva hasta que el acto termine).
 * Devuelve la acción existente, o nula si va en una nueva.
 */
async function revisarLaNueva(
  tx: TransactionSql,
  h: Pick<HallazgoBase, "id" | "ronda">,
  rondaId: number,
  nueva: ActividadQueSeAnade,
  bloquear: boolean,
): Promise<{ id: number; orden: number } | null> {
  const accion = nueva.accionId !== null ? await accionDeLaRonda(tx, h, rondaId, nueva.accionId) : null;
  if (accion) {
    const [{ cuantas }] = await tx`SELECT count(*)::int AS cuantas FROM mejora_actividades WHERE accion_id = ${accion.id}`;
    if (Number(cuantas) >= MAXIMO_DE_ACTIVIDADES) throw new ErrorMejora(DEMASIADAS_ACTIVIDADES);
  }
  if (nueva.accion) {
    const [{ cuantas }] = await tx`SELECT count(*)::int AS cuantas FROM mejora_acciones WHERE ronda_id = ${rondaId}`;
    if (Number(cuantas) >= MAXIMO_DE_ACCIONES) throw new ErrorMejora(DEMASIADAS_ACCIONES);
    const causaIds = nueva.accion.causaIds;
    if (nueva.accion.tipo === "correctiva" && causaIds.length === 0) throw new ErrorMejora(CORRECTIVA_SIN_CAUSA);
    if (causaIds.length > 0) {
      const causas = await tx`SELECT id FROM mejora_causas WHERE ronda_id = ${rondaId} AND hallazgo_id = ${h.id} AND id = ANY(${causaIds})`;
      if (causas.length !== causaIds.length) throw new ErrorMejora(CAUSA_AJENA);
    }
  }
  if (bloquear) await bloquearLasDeLaRonda(tx, h);
  const [activo] = await tx`SELECT id FROM usuarios WHERE id = ${nueva.responsableId} AND activo ${bloquear ? tx`FOR SHARE` : tx``}`;
  if (!activo) throw new ErrorMejora(RESPONSABLE_INACTIVO);
  return accion;
}

/** El `23505` del índice de un pendiente por actividad, con su propia frase; los demás errores pasan tal cual (a `legible`). */
function conUnPendiente(err: unknown): never {
  const e = err as { code?: unknown; constraint_name?: unknown } | null;
  if (e?.code === "23505" && e.constraint_name === INDICE_UN_PENDIENTE) throw new ErrorMejora(UN_PENDIENTE_POR_ACTIVIDAD);
  throw err;
}

// ─────────────────────────────────────────────────────────────────────────────
// Quién decide (spec §10.6)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Quién decide los ajustes del plan de la ronda en curso (spec §10.6, F15-DC21): el rol que lo aprobó
 * (`mejora_rondas.aprobado_rol`): si lo aprobó Gerencia, cualquier usuario activo de Gerencia; si valió la revisión, los Admin
 * SGC activos. En un hallazgo cargado, el rol que se declaró, o Gerencia si es de criticidad alta u origen externo
 * (`rolQueAproboEnPapel`, que la carga deja en esa columna, spec §15). **Quien pidió no decide:** si lo pidió el único Admin SGC activo, decide Gerencia. Del mismo modo, si el rol que
 * aprobó no tiene a nadie más activo, decide el otro (F15-DC15: la falta de una persona nunca traba el camino). Una sola regla:
 * la usan el acto, «Lo que sigue» y las tareas.
 */
export async function quienDecideAjustes(
  tx: Cliente,
  hallazgoId: number,
  pedidoPor: number,
): Promise<{ rol: "admin_sgc" | "gerencia"; usuarios: number[] }> {
  const [r] = await tx`SELECT r.aprobado_rol FROM mejora_rondas r
    JOIN mejora_hallazgos h ON h.id = r.hallazgo_id AND h.ronda = r.numero
    WHERE r.hallazgo_id = ${hallazgoId}`;
  const aprobo: "admin_sgc" | "gerencia" = r?.aprobado_rol === "gerencia" ? "gerencia" : "admin_sgc";
  const sinQuienPidio = async (rol: "admin_sgc" | "gerencia") => (await activosDeRol(tx, [rol])).filter((u) => u !== pedidoPor);
  const primero = await sinQuienPidio(aprobo);
  if (primero.length > 0) return { rol: aprobo, usuarios: primero };
  const otro = aprobo === "admin_sgc" ? "gerencia" : "admin_sgc";
  const segundo = await sinQuienPidio(otro);
  return segundo.length > 0 ? { rol: otro, usuarios: segundo } : { rol: aprobo, usuarios: [] };
}

// ─────────────────────────────────────────────────────────────────────────────
// Pedir (spec §10.6)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Pide un ajuste al plan aprobado, con la causa. El responsable solo pide reprogramar la suya; un líder del proceso o el Admin
 * SGC, cualquiera de los tres. Con el hallazgo «En ejecución» o «Por verificar». Reprogramar: una actividad sin terminar y su
 * fecha de fin nueva, de hoy en adelante (en la zona de la instalación), distinta de la que tiene y no anterior a su inicio.
 * Cancelar: una actividad sin terminar que no sea la última no cancelada de la ronda. Añadir: la actividad nueva, revisada como
 * en `guardarAccion`, con su fin de hoy en adelante. Un solo pendiente por actividad (lo garantiza el índice). Deja la fila con
 * su plazo (`venceEn("decision")`), el evento `ajuste_pedido`, su bitácora y el aviso a quienes lo deciden.
 */
export async function pedirAjuste(
  sesion: SesionFlujo,
  d: z.input<typeof EsquemaPedirAjuste>,
  opciones?: OpcionesFlujo,
): Promise<{ id: number }> {
  requerirPermiso(sesion, "mejora.ejecutar");
  const v = leer(EsquemaPedirAjuste, d);
  const ahora = opciones?.ahora ?? new Date();
  return legible(
    enTransaccion(opciones?.sql ?? obtenerSql(), async (tx) => {
      const h = await bloquearHallazgo(tx, v.hallazgoId);
      // La actividad, solo si es de este hallazgo: tomar el candado de una de otro rompería el orden (su hallazgo primero).
      let a: ActividadDelAjuste | null = null;
      if (v.actividadId !== null) {
        const [suya] = await tx`SELECT hallazgo_id FROM mejora_actividades WHERE id = ${v.actividadId}`;
        if (suya && Number(suya.hallazgo_id) === h.id) a = await bloquearActividad(tx, v.actividadId);
      }
      const porElPlan = await pideAjustesDelPlan(tx, sesion, h);
      const esSuya = a !== null && a.responsableId === sesion.usuarioId && a.finOriginal !== null;
      if (!porElPlan && !(v.tipo === "reprogramar" && esSuya)) await negar(tx, sesion, h.id);
      if (!SE_AJUSTA_EN.includes(h.estado)) throw new ErrorMejora(YA_CAMBIO);
      if (v.actividadId !== null && a === null) throw new ErrorMejora(ACTIVIDAD_NO_EXISTE);

      const c = await contextoDeMejora(tx, ahora);
      const hoy = fechaEnZona(ahora, c.zona);
      const [ronda] = await tx`SELECT id FROM mejora_rondas WHERE hallazgo_id = ${h.id} AND numero = ${h.ronda}`;
      if (!ronda) throw new ErrorMejora(YA_CAMBIO);
      let datos: Record<string, unknown>;
      let cambio: Record<string, unknown>;
      if (v.tipo === "agregar") {
        const nueva = v.nueva!;
        if (nueva.fin < hoy) throw new ErrorMejora(FIN_DE_LA_NUEVA_PASADO);
        const accion = await revisarLaNueva(tx, h, Number(ronda.id), nueva, false);
        datos = nueva;
        cambio = { ...(accion ? { accion: etiquetaDeAccion(accion.orden) } : { accionNueva: true }), finNuevo: nueva.fin };
      } else {
        if (!sigueAbierta(h, a!)) throw new ErrorMejora(ACTIVIDAD_CERRADA);
        if (v.tipo === "reprogramar") {
          const finNuevo = v.finNuevo!;
          if (finNuevo < hoy) throw new ErrorMejora(FIN_NUEVO_PASADO);
          if (finNuevo === a!.fin) throw new ErrorMejora(FIN_NUEVO_IGUAL);
          if (finNuevo < a!.inicio) throw new ErrorMejora(FIN_NUEVO_ANTES_DEL_INICIO);
          datos = { finAntes: a!.fin, finNuevo };
          cambio = { finAntes: a!.fin, finNuevo };
        } else {
          await exigirOtraSinCancelar(tx, h, a!.id);
          datos = { estadoAntes: a!.estado };
          cambio = {};
        }
      }

      const [fila] = await tx`INSERT INTO mejora_ajustes (hallazgo_id, ronda_id, tipo, actividad_id, datos, causa, pedido_por, pedido_en,
          estado, vence_en)
        VALUES (${h.id}, ${ronda.id}, ${v.tipo}, ${a?.id ?? null}, ${tx.json(datos as never)}, ${v.causa}, ${sesion.usuarioId}, ${ahora},
          'pendiente', ${venceEn("decision", ahora, c)})
        RETURNING id`.catch(conUnPendiente);
      const id = Number(fila.id);
      const detalle = { ajusteId: id, tipo: v.tipo, ...(a ? { actividadId: a.id, actividad: a.etiqueta } : {}), ...cambio };
      await dejarEvento(tx, { hallazgoId: h.id, ronda: h.ronda, tipo: "ajuste_pedido", detalle, usuarioId: sesion.usuarioId, ocurrioEn: ahora });
      await registrarAuditoria(tx, {
        usuarioId: sesion.usuarioId,
        accion: "mejora_ajuste_pedido",
        entidad: ENTIDAD_HALLAZGO,
        entidadId: h.id,
        detalle: { codigo: h.codigo, ronda: h.ronda, hallazgoId: h.id, ...detalle },
      });
      const { usuarios } = await quienDecideAjustes(tx, h.id, sesion.usuarioId);
      const cuerpo = fraseDelAjuste({ tipo: v.tipo, actividad: a?.etiqueta ?? null, ...cambio });
      await avisarDeMejora(
        tx,
        { tipo: "mejora.ajuste_pedido", titulo: `Decidir el ajuste de ${h.codigo}`, hallazgoId: h.id },
        usuarios.map((usuarioId) => ({ usuarioId, cuerpo })),
      );
      return { id };
    }),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Decidir (spec §10.6)
// ─────────────────────────────────────────────────────────────────────────────

type AjusteBloqueado = {
  id: number;
  rondaId: number;
  rondaNumero: number;
  tipo: TipoAjuste;
  actividadId: number | null;
  datos: unknown;
  pedidoPor: number;
  estado: EstadoAjuste;
};

/**
 * El aviso de la decisión a quien la pidió (spec §14.2), salvo que la decida él mismo o ya no esté activo. Sin código ni título
 * del hallazgo: pudo perder su alcance mientras se decidía (una reasignación). Por eso el enlace va solo si todavía abre lo
 * enlazado: su actividad en una reprogramación; el hallazgo en lo demás.
 */
async function avisarAQuienPidio(
  tx: TransactionSql,
  sesion: SesionFlujo,
  h: HallazgoBase,
  ajuste: AjusteBloqueado,
  aprobado: boolean,
  cuerpo: string,
): Promise<void> {
  if (ajuste.pedidoPor === sesion.usuarioId) return;
  const [u] = await tx`SELECT id, rol, ver_historial FROM usuarios WHERE id = ${ajuste.pedidoPor} AND activo`;
  if (!u) return;
  const sujeto: SujetoVisibilidad = { usuarioId: Number(u.id), rol: u.rol as Rol, verHistorial: u.ver_historial === true };
  const titulo = aprobado ? AJUSTE_APROBADO : AJUSTE_NEGADO;
  const destinatarios = [{ usuarioId: sujeto.usuarioId, cuerpo }];
  if (ajuste.tipo === "reprogramar" && ajuste.actividadId !== null) {
    const enlace = (await participacionEnActividad(ajuste.actividadId, sujeto, { sql: tx })) ? rutaDeActividad(ajuste.actividadId) : null;
    await avisarA(tx, { tipo: "mejora.ajuste_decidido", titulo, enlace, entidad: ENTIDAD_ACTIVIDAD, entidadId: ajuste.actividadId }, destinatarios);
    return;
  }
  const enlace = (await puedeVerHallazgo(h.id, sujeto, { sql: tx })) ? rutaDeHallazgo(h.id) : null;
  await avisarA(tx, { tipo: "mejora.ajuste_decidido", titulo, enlace, entidad: ENTIDAD_HALLAZGO, entidadId: h.id }, destinatarios);
}

/**
 * Lo que hace un ajuste al aprobarse, con todo vuelto a comprobar después de los candados. Devuelve el detalle del paso
 * `ajustar` (sin la causa ni la nota) y, si añadió una actividad, su id, su responsable, su descripción y su fin para el aviso.
 */
async function aplicar(
  tx: TransactionSql,
  h: HallazgoBase,
  ajuste: AjusteBloqueado,
  a: ActividadDelAjuste | null,
  c: ContextoMejora,
): Promise<{ detalle: Record<string, unknown>; nueva: { id: number; responsableId: number; descripcion: string; fin: string } | null }> {
  const cambio = cambioDeAjuste(ajuste.tipo, ajuste.datos);
  if (!cambio) throw new ErrorMejora(AJUSTE_ILEGIBLE);
  const base = { ajusteId: ajuste.id, tipo: ajuste.tipo };
  if (cambio.tipo === "agregar") {
    const accion = await revisarLaNueva(tx, h, ajuste.rondaId, cambio, true);
    let destino = accion;
    if (!destino) {
      const n = cambio.accion!;
      const [{ orden }] = await tx`SELECT coalesce(max(orden), 0) + 1 AS orden FROM mejora_acciones WHERE ronda_id = ${ajuste.rondaId}`;
      const [creada] = await tx`INSERT INTO mejora_acciones (hallazgo_id, ronda_id, orden, tipo, descripcion)
        VALUES (${h.id}, ${ajuste.rondaId}, ${Number(orden)}, ${n.tipo}, ${n.descripcion}) RETURNING id, orden`;
      destino = { id: Number(creada.id), orden: Number(creada.orden) };
      if (n.causaIds.length > 0) {
        await tx`INSERT INTO mejora_accion_causas ${tx(n.causaIds.map((causaId) => ({ hallazgo_id: h.id, accion_id: destino!.id, causa_id: causaId })))}`;
      }
    }
    const [{ siguiente }] = await tx`SELECT coalesce(max(orden), 0) + 1 AS siguiente FROM mejora_actividades WHERE accion_id = ${destino.id}`;
    // Nace con su fin como fecha original: es una actividad de un plan aprobado (y da alcance a su responsable, spec §6.3).
    const [creada] = await tx`INSERT INTO mejora_actividades (hallazgo_id, accion_id, orden, descripcion, responsable_id, inicio, fin_original, fin)
      VALUES (${h.id}, ${destino.id}, ${Number(siguiente)}, ${cambio.descripcion}, ${cambio.responsableId}, ${cambio.inicio}, ${cambio.fin}, ${cambio.fin})
      RETURNING id`;
    const id = Number(creada.id);
    await tx`UPDATE mejora_ajustes SET actividad_id = ${id} WHERE id = ${ajuste.id}`;
    return {
      detalle: {
        ...base,
        actividadId: id,
        actividad: etiquetaDeActividad(destino.orden, Number(siguiente)),
        accion: etiquetaDeAccion(destino.orden),
        ...(accion ? {} : { accionNueva: true }),
        finNuevo: cambio.fin,
      },
      nueva: { id, responsableId: cambio.responsableId, descripcion: cambio.descripcion, fin: cambio.fin },
    };
  }
  if (!a || !sigueAbierta(h, a)) throw new ErrorMejora(ACTIVIDAD_CERRADA);
  const deLaActividad = { ...base, actividadId: a.id, actividad: a.etiqueta };
  if (cambio.tipo === "reprogramar") {
    // El fin vigente y sus marcas; la fecha de fin original no cambia nunca (spec §10.6).
    await tx`UPDATE mejora_actividades
      SET fin = ${cambio.finNuevo}, reprogramaciones = reprogramaciones + 1, aviso_vencido_en = NULL, escalado_en = NULL, gerencia_en = NULL
      WHERE id = ${a.id}`;
    return { detalle: { ...deLaActividad, finAntes: a.fin, finNuevo: cambio.finNuevo }, nueva: null };
  }
  await exigirOtraSinCancelar(tx, h, a.id);
  await tx`UPDATE mejora_actividades SET estado = 'cancelada', cancelada_en = ${c.ahora} WHERE id = ${a.id}`;
  return { detalle: deLaActividad, nueva: null };
}

/**
 * Aprueba o niega un ajuste pendiente (spec §10.6), con nota (obligatoria al negar) y, si se quiere, el acta del Comité. Lo
 * decide quien dice `quienDecideAjustes`, nunca quien lo pidió. Aprobado, el cambio se aplica (`aplicar`, con todo vuelto a
 * comprobar) y el hallazgo pasa por `transicionarHallazgo(…, "ajustar")`, que lo audita y queda en «En ejecución» si alguna
 * actividad de la ronda sigue sin terminar, o en «Por verificar» si no. Negado, solo la fila cambia, con su evento y su
 * bitácora. Negar se puede aunque la actividad haya terminado mientras tanto. Dos decisiones del mismo ajuste van en fila (el
 * ajuste `FOR UPDATE`): la segunda lanza `YA_SE_DECIDIO` y no escribe nada.
 */
export async function decidirAjuste(
  sesion: SesionFlujo,
  d: { ajusteId: number; aprueba: boolean; nota?: string | null; acta?: Acta },
  opciones?: OpcionesFlujo,
): Promise<void> {
  if (!puede(sesion, "mejora.gestionar") && !puede(sesion, "mejora.aprobar")) throw new ErrorPermiso();
  const v = leer(EsquemaDecidirAjuste, d);
  const ahora = opciones?.ahora ?? new Date();
  await legible(
    enTransaccion(opciones?.sql ?? obtenerSql(), async (tx) => {
      // El hallazgo de un ajuste no cambia nunca: se lee sin candado para tomar primero el del hallazgo.
      const [dueno] = await tx`SELECT hallazgo_id FROM mejora_ajustes WHERE id = ${v.ajusteId}`;
      if (!dueno) throw new ErrorMejora(AJUSTE_NO_EXISTE);
      const h = await bloquearHallazgo(tx, Number(dueno.hallazgo_id));
      const [f] = await tx`SELECT aj.id, aj.ronda_id, aj.tipo, aj.actividad_id, aj.datos, aj.pedido_por, aj.estado, r.numero AS ronda_numero
        FROM mejora_ajustes aj JOIN mejora_rondas r ON r.id = aj.ronda_id
        WHERE aj.id = ${v.ajusteId} FOR UPDATE OF aj`;
      const ajuste: AjusteBloqueado = {
        id: Number(f.id),
        rondaId: Number(f.ronda_id),
        rondaNumero: Number(f.ronda_numero),
        tipo: f.tipo as TipoAjuste,
        actividadId: f.actividad_id === null ? null : Number(f.actividad_id),
        datos: f.datos,
        pedidoPor: Number(f.pedido_por),
        estado: f.estado as EstadoAjuste,
      };
      if (!(await quienDecideAjustes(tx, h.id, ajuste.pedidoPor)).usuarios.includes(sesion.usuarioId)) {
        await negar(tx, sesion, h.id, AJUSTE_NO_EXISTE);
      }
      if (ajuste.estado !== "pendiente") throw new ErrorMejora(YA_SE_DECIDIO);
      if (!SE_AJUSTA_EN.includes(h.estado) || ajuste.rondaNumero !== h.ronda) throw new ErrorMejora(YA_CAMBIO);
      const c = await contextoDeMejora(tx, ahora);
      exigirActa(v.acta, c);
      const a = ajuste.actividadId !== null ? await bloquearActividad(tx, ajuste.actividadId) : null;
      // Lo que pidió, como lo dicen el pedido y su evento: las fechas y, en uno que añade, la acción por su etiqueta.
      const leido = cambioDeAjuste(ajuste.tipo, ajuste.datos);
      const [accionDeLaNueva] =
        leido?.tipo === "agregar" && leido.accionId !== null ? await tx`SELECT orden FROM mejora_acciones WHERE id = ${leido.accionId}` : [];
      const cambio: Record<string, unknown> =
        leido?.tipo === "reprogramar"
          ? { finAntes: leido.finAntes, finNuevo: leido.finNuevo }
          : leido?.tipo === "agregar"
            ? {
                ...(accionDeLaNueva ? { accion: etiquetaDeAccion(Number(accionDeLaNueva.orden)) } : leido.accion ? { accionNueva: true } : {}),
                finNuevo: leido.fin,
              }
            : {};
      const frase = fraseDelAjuste({ tipo: ajuste.tipo, actividad: a?.etiqueta ?? null, ...cambio });

      if (!v.aprueba) {
        await tx`UPDATE mejora_ajustes
          SET estado = 'negado', decidido_por = ${sesion.usuarioId}, decidido_en = ${ahora}, nota = ${v.nota},
            acta_numero = ${v.acta?.numero ?? null}, acta_fecha = ${v.acta?.fecha ?? null}
          WHERE id = ${ajuste.id}`;
        const detalle = {
          ajusteId: ajuste.id,
          tipo: ajuste.tipo,
          ...(a ? { actividadId: a.id, actividad: a.etiqueta } : {}),
          ...cambio,
          ...conActa(v.acta),
        };
        await dejarEvento(tx, { hallazgoId: h.id, ronda: h.ronda, tipo: "ajuste_negado", detalle, usuarioId: sesion.usuarioId, ocurrioEn: ahora });
        await registrarAuditoria(tx, {
          usuarioId: sesion.usuarioId,
          accion: "mejora_ajuste_negado",
          entidad: ENTIDAD_HALLAZGO,
          entidadId: h.id,
          detalle: { codigo: h.codigo, ronda: h.ronda, hallazgoId: h.id, ...detalle },
        });
        await avisarAQuienPidio(tx, sesion, h, ajuste, false, frase);
        return;
      }

      // La fecha que da el ajuste se mira otra vez al aprobarlo, en el día de la zona: si ya pasó, se niega y se pide otro.
      if (fechaDelAjustePasada(leido, fechaEnZona(c.ahora, c.zona))) throw new ErrorMejora(FECHA_DEL_AJUSTE_PASADA);
      const { detalle, nueva } = await aplicar(tx, h, ajuste, a, c);
      const abiertas = (await bloquearLasDeLaRonda(tx, h)).filter((x) => ACTIVIDAD_ABIERTA.includes(x.estado));
      await tx`UPDATE mejora_ajustes
        SET estado = 'aprobado', decidido_por = ${sesion.usuarioId}, decidido_en = ${ahora}, nota = ${v.nota},
          acta_numero = ${v.acta?.numero ?? null}, acta_fecha = ${v.acta?.fecha ?? null}
        WHERE id = ${ajuste.id}`;
      await transicionarHallazgo(
        tx,
        sesion,
        h,
        "ajustar",
        {
          rumbo: { quedaEn: abiertas.length > 0 ? "en_ejecucion" : "por_verificar" },
          detalle,
          acta: v.acta,
          // La actividad añadida avisa a su responsable por su cuenta (abajo): el turno de «En ejecución» sería el mismo aviso.
          sinAvisoDelTurno: nueva !== null,
        },
        c,
      );
      await avisarAQuienPidio(tx, sesion, h, ajuste, true, frase);
      if (nueva && nueva.responsableId !== sesion.usuarioId) {
        const descripcion = nueva.descripcion.trim().replace(/[.\s]+$/, "");
        await avisarA(
          tx,
          { tipo: "mejora.actividad_asignada", titulo: ACTIVIDAD_ASIGNADA, enlace: rutaDeActividad(nueva.id), entidad: ENTIDAD_ACTIVIDAD, entidadId: nueva.id },
          [{ usuarioId: nueva.responsableId, cuerpo: `${descripcion}. Fecha de fin: ${fechaLargaDeDia(nueva.fin)}.` }],
        );
      }
    }),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Escalar a Gerencia (spec §10.7)
// ─────────────────────────────────────────────────────────────────────────────

/** El último paso de la escalada de una actividad (`escalada` o `escalada_respondida`) y quién lo dio, o nada. */
async function ultimoDeLaEscalada(
  tx: TransactionSql,
  h: Pick<HallazgoBase, "id">,
  actividadId: number,
): Promise<{ tipo: string; usuarioId: number | null } | null> {
  const [e] = await tx`SELECT tipo, usuario_id FROM mejora_eventos
    WHERE hallazgo_id = ${h.id} AND tipo IN ('escalada', 'escalada_respondida') AND detalle->>'actividadId' = ${String(actividadId)}
    ORDER BY id DESC LIMIT 1`;
  return e ? { tipo: e.tipo as string, usuarioId: e.usuario_id === null ? null : Number(e.usuario_id) } : null;
}

/**
 * El Admin SGC escala a Gerencia una actividad vencida (sin terminar, de un plan aprobado y con su fecha ya pasada en la zona: la
 * de corregir si se devolvió, si no el fin vigente, `venceLaActividad`), con una nota. No cambia ningún estado: deja `gerencia_en`, el evento `escalada` (con la nota, que no tiene otra
 * columna), su bitácora sin la nota y un aviso a cada usuario activo de Gerencia; sin ninguno, no se escala. Una escalada vigente
 * no se repite: la borra una reprogramación aprobada.
 */
export async function escalarAGerencia(sesion: SesionFlujo, d: { actividadId: number; nota: string }, opciones?: OpcionesFlujo): Promise<void> {
  requerirPermiso(sesion, "mejora.gestionar");
  const v = leer(EsquemaEscalar, d);
  await conLaActividad(v.actividadId, opciones, async (tx, h, a, c) => {
    if (!sigueAbierta(h, a) || a.vence >= fechaEnZona(c.ahora, c.zona)) throw new ErrorMejora(SOLO_VENCIDA);
    if (h.estado !== "en_ejecucion") throw new ErrorMejora(YA_CAMBIO);
    if (a.gerenciaEn !== null) throw new ErrorMejora(YA_ESCALADA);
    const gerencia = (await activosDeRol(tx, ["gerencia"])).filter((u) => u !== sesion.usuarioId);
    if (gerencia.length === 0) throw new ErrorMejora(SIN_GERENCIA_ACTIVA);
    await tx`UPDATE mejora_actividades SET gerencia_en = ${c.ahora} WHERE id = ${a.id}`;
    await dejarEvento(tx, {
      hallazgoId: h.id,
      ronda: h.ronda,
      tipo: "escalada",
      detalle: { actividadId: a.id, actividad: a.etiqueta, nota: v.nota },
      usuarioId: sesion.usuarioId,
      ocurrioEn: c.ahora,
    });
    await registrarAuditoria(tx, {
      usuarioId: sesion.usuarioId,
      accion: "mejora_escalada",
      entidad: ENTIDAD_ACTIVIDAD,
      entidadId: a.id,
      detalle: { codigo: h.codigo, ronda: h.ronda, hallazgoId: h.id, actividad: a.etiqueta, fin: a.fin },
    });
    const cuerpo = `La actividad ${a.etiqueta} venció el ${fechaLargaDeDia(a.vence)}.`;
    await avisarA(
      tx,
      { tipo: "mejora.escalada", titulo: `Escalada a Gerencia: una actividad de ${h.codigo}`, enlace: rutaDeActividad(a.id), entidad: ENTIDAD_ACTIVIDAD, entidadId: a.id },
      gerencia.map((usuarioId) => ({ usuarioId, cuerpo })),
    );
  });
}

/**
 * Gerencia responde una escalada (spec §10.7) con su nota y, si quiere, el acta del Comité: una vez por escalada. No cambia
 * ningún estado: deja el evento `escalada_respondida` (con la nota y el acta), su bitácora sin la nota y un aviso a quien la
 * escaló.
 */
export async function responderEscalada(
  sesion: SesionFlujo,
  d: { actividadId: number; nota: string; acta?: Acta },
  opciones?: OpcionesFlujo,
): Promise<void> {
  requerirPermiso(sesion, "mejora.aprobar");
  const v = leer(EsquemaResponderEscalada, d);
  await conLaActividad(v.actividadId, opciones, async (tx, h, a, c) => {
    if (a.gerenciaEn === null) throw new ErrorMejora(NO_ESCALADA);
    const escalada = await ultimoDeLaEscalada(tx, h, a.id);
    if (escalada?.tipo !== "escalada") throw new ErrorMejora(YA_RESPONDIDA);
    exigirActa(v.acta, c);
    await dejarEvento(tx, {
      hallazgoId: h.id,
      ronda: h.ronda,
      tipo: "escalada_respondida",
      detalle: { actividadId: a.id, actividad: a.etiqueta, nota: v.nota, ...conActa(v.acta) },
      usuarioId: sesion.usuarioId,
      ocurrioEn: c.ahora,
    });
    await registrarAuditoria(tx, {
      usuarioId: sesion.usuarioId,
      accion: "mejora_escalada_respondida",
      entidad: ENTIDAD_ACTIVIDAD,
      entidadId: a.id,
      detalle: { codigo: h.codigo, ronda: h.ronda, hallazgoId: h.id, actividad: a.etiqueta, ...conActa(v.acta) },
    });
    // A quien escaló, si sigue activo: sin el contenido del hallazgo ni la nota (la lee en el historial).
    const [quienEscalo] =
      escalada.usuarioId !== null && escalada.usuarioId !== sesion.usuarioId
        ? await tx`SELECT id FROM usuarios WHERE id = ${escalada.usuarioId} AND activo`
        : [];
    if (quienEscalo) {
      await avisarA(
        tx,
        { tipo: "mejora.escalada_respondida", titulo: ESCALADA_RESPONDIDA, enlace: rutaDeActividad(a.id), entidad: ENTIDAD_ACTIVIDAD, entidadId: a.id },
        [{ usuarioId: Number(quienEscalo.id), cuerpo: `Respondió la escalada de la actividad ${a.etiqueta} de ${h.codigo}.` }],
      );
    }
  });
}
