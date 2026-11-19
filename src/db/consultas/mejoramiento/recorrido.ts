/**
 * El recorrido del hallazgo hasta el plan (spec 15 §8.3 a §8.5): aceptar o rechazar, retirar o sostener tras un rechazo,
 * arbitrar, registrar la corrección, decidir la acción correctiva (también cambiar el «no» por «sí») y validar o devolver
 * la corrección, con el camino corto y el cierre sin acción.
 *
 * Cada acto: su permiso de la matriz, su transacción, el hallazgo bloqueado primero (`bloquearHallazgo`), la condición de
 * persona dentro, después el estado, la escritura de sus columnas y el cambio de estado por `transicionarHallazgo`. Quien
 * no ve el hallazgo recibe «no existe»; quien lo ve y no puede dar el paso, `ErrorPermiso`. Las columnas que escribe un
 * paso que termina el hallazgo van antes de la transición: un hallazgo terminado ya no admite escrituras.
 *
 * Lo que la persona escribe con texto libre (la justificación del rechazo, la réplica, la nota del arbitraje, la descripción
 * de la corrección y el nombre de su responsable, la justificación de la decisión y la nota de la devolución) va a sus
 * columnas y al evento, nunca a la bitácora (`soloEnElEvento`, spec §6.4).
 */
import type { TransactionSql } from "postgres";
import type { z } from "zod";
import { obtenerSql, type Cliente } from "@/db/cliente";
import { enTransaccion, type OpcionesFlujo, type SesionFlujo } from "@/db/consultas/flujo/contrato";
import { lideresDeProceso } from "@/db/consultas/tramites";
import { puedeValidarCorreccion, puedeVerHallazgo } from "@/lib/alcance";
import {
  EsquemaArbitraje,
  EsquemaCorreccion,
  EsquemaDecision,
  EsquemaDevolucion,
  EsquemaPasoDelHallazgo,
  EsquemaRechazo,
  EsquemaSostener,
} from "@/lib/esquemas/mejoramiento";
import { esExterno } from "@/lib/mejoramiento/origenes";
import { formularAntesDe } from "@/lib/mejoramiento/plazos";
import { accionObligada } from "@/lib/mejoramiento/reglas";
import { ErrorMejora, type AccionHallazgo, type EstadoHallazgo, type HallazgoBase } from "@/lib/mejoramiento/tipos";
import { DESDE, YA_CAMBIO } from "@/lib/mejoramiento/transiciones";
import { ErrorPermiso, puede, requerirPermiso } from "@/lib/permisos";
import { fechaEnZona } from "@/lib/tramites/plazos";
import { actuaPorElProceso, arbitrosDe, avisarDelArbitraje, avisarDelCierre, avisarDelRetiro, avisarDelSostenido } from "./avisos";
import { contextoDeMejora, type ContextoMejora } from "./config";
import { bloquearHallazgo, legible, NO_EXISTE, transicionarHallazgo } from "./flujo";

export const EXTERNO_NO_SE_RECHAZA = "Un hallazgo de origen externo no se rechaza: se responde";
export const SIN_EVIDENCIA = "Adjunte la evidencia de la corrección";
export const EVIDENCIA_DEVUELTA = "Adjunte la evidencia nueva de la corrección: la anterior se devolvió";
export const SIN_EVIDENCIA_AL_VALIDAR = "La corrección ya no tiene evidencia: devuélvala";

type Persona = Pick<SesionFlujo, "usuarioId" | "rol" | "verHistorial">;
type Acta = { numero: string; fecha: string } | null;

// ─────────────────────────────────────────────────────────────────────────────
// Quién puede dar cada paso: las mismas reglas para el acto y para la página
// ─────────────────────────────────────────────────────────────────────────────

/** Los pasos de esta parte del recorrido, uno por estado: el formulario que pinta «Lo que sigue». */
export type PasoDelRecorrido = "aceptar" | "tras_rechazo" | "arbitrar" | "corregir" | "decidir" | "validar";

const PASO_DEL_ESTADO: Partial<Record<EstadoHallazgo, PasoDelRecorrido>> = {
  por_aceptar: "aceptar",
  rechazo: "tras_rechazo",
  arbitraje: "arbitrar",
  por_corregir: "corregir",
  por_decidir: "decidir",
  por_validar: "validar",
};

export function pasoDelEstado(estado: EstadoHallazgo): PasoDelRecorrido | null {
  return PASO_DEL_ESTADO[estado] ?? null;
}

/** Acepta un líder del proceso que no lo registró; si el proceso no tiene líder activo, el Admin SGC (F15-DC3). */
async function puedeAceptar(tx: Cliente, p: Persona, h: HallazgoBase): Promise<boolean> {
  return puede(p, "mejora.formular") && h.registradoPor !== p.usuarioId && (await actuaPorElProceso(tx, p, h.procesoId));
}

/**
 * Rechaza solo un líder activo del proceso que no lo registró: un rechazo solo existe en un proceso con líder (§8.3), y
 * F15-DC3 extiende al Admin SGC aceptar, no rechazar. Quien puede aceptar y es líder, puede rechazar.
 */
async function puedeRechazar(tx: Cliente, p: Persona, h: Pick<HallazgoBase, "registradoPor" | "procesoId">): Promise<boolean> {
  return (
    puede(p, "mejora.formular") &&
    p.rol === "lider_proceso" &&
    h.registradoPor !== p.usuarioId &&
    (await lideresDeProceso(h.procesoId, { sql: tx })).includes(p.usuarioId)
  );
}

/**
 * Si a la persona se le ofrece rechazar el hallazgo: puede rechazar (`puedeRechazar`) y el origen es interno (los externos se
 * responden). Lo usan la página, «Lo que sigue» («aceptar el hallazgo o rechazarlo», o solo «aceptar el hallazgo»).
 */
export async function ofreceRechazo(
  tx: Cliente,
  p: Persona,
  h: Pick<HallazgoBase, "registradoPor" | "procesoId" | "origen">,
): Promise<boolean> {
  return !esExterno(h.origen) && (await puedeRechazar(tx, p, h));
}

/** Retira o sostiene quien lo registró, o un Admin SGC en su lugar (spec §6.1). */
function puedeDecidirTrasElRechazo(p: Persona, h: HallazgoBase): boolean {
  return puede(p, "mejora.registrar") && (h.registradoPor === p.usuarioId || p.rol === "admin_sgc");
}

async function puedeArbitrar(tx: Cliente, p: Persona, h: HallazgoBase): Promise<boolean> {
  if (!puede(p, "mejora.gestionar") && !puede(p, "mejora.aprobar")) return false;
  return (await arbitrosDe(tx, h)).includes(p.usuarioId);
}

/** La corrección la registra un líder del proceso, o el Admin SGC si el proceso no tiene ninguno (F15-DC3). */
async function puedeCorregir(tx: Cliente, p: Persona, h: HallazgoBase): Promise<boolean> {
  return puede(p, "mejora.formular") && (await actuaPorElProceso(tx, p, h.procesoId));
}

/**
 * Si la persona puede dar el paso del estado del hallazgo (el formulario de «Lo que sigue»). En «Por validar» es validar
 * la corrección o devolverla; exigir la acción correctiva va aparte (`puedeExigirLaAccion`).
 */
export async function puedeDarElPaso(tx: Cliente, p: Persona, h: HallazgoBase): Promise<boolean> {
  switch (pasoDelEstado(h.estado)) {
    case "aceptar":
      return puedeAceptar(tx, p, h);
    case "tras_rechazo":
      return puedeDecidirTrasElRechazo(p, h);
    case "arbitrar":
      return puedeArbitrar(tx, p, h);
    case "corregir":
      return puedeCorregir(tx, p, h);
    case "decidir":
      return puede(p, "mejora.gestionar");
    case "validar":
      return puedeValidarCorreccion(h.id, p, { sql: tx });
    default:
      return false;
  }
}

/** Mientras está «Por validar», el Admin SGC o Gerencia pueden exigir la acción correctiva (spec §8.5). */
export function puedeExigirLaAccion(p: Persona, h: Pick<HallazgoBase, "estado">): boolean {
  return h.estado === "por_validar" && (puede(p, "mejora.gestionar") || puede(p, "mejora.aprobar"));
}

// ─────────────────────────────────────────────────────────────────────────────
// Lo común de los actos
// ─────────────────────────────────────────────────────────────────────────────

function leer<T extends z.ZodType>(esquema: T, d: unknown): z.output<T> {
  const leido = esquema.safeParse(d);
  if (!leido.success) throw new ErrorMejora(leido.error.issues[0].message);
  return leido.data;
}

/** Quien no puede dar el paso: `ErrorPermiso` si ve el hallazgo; si no lo ve, no existe (spec §6.3). */
async function negar(tx: Cliente, p: Persona, hallazgoId: number): Promise<never> {
  throw (await puedeVerHallazgo(hallazgoId, p, { sql: tx })) ? new ErrorPermiso() : new ErrorMejora(NO_EXISTE);
}

/** El estado admite la acción (la columna «Desde» de §8.2); si no, el hallazgo ya cambió. */
function exigirEstado(h: HallazgoBase, accion: AccionHallazgo): void {
  const desde = DESDE[accion];
  if (typeof desde === "string" || !desde.includes(h.estado)) throw new ErrorMejora(YA_CAMBIO);
}

function exigirActa(acta: Acta, c: ContextoMejora): void {
  if (acta && acta.fecha > fechaEnZona(c.ahora, c.zona)) throw new ErrorMejora("La fecha del acta no puede ser futura");
}

/** Una transacción con el hallazgo bloqueado primero (el orden de candados del módulo) y los plazos a `ahora`. */
function conElHallazgo<T>(
  hallazgoId: number,
  opciones: OpcionesFlujo | undefined,
  fn: (tx: TransactionSql, h: HallazgoBase, c: ContextoMejora) => Promise<T>,
): Promise<T> {
  const ahora = opciones?.ahora ?? new Date();
  return legible(
    enTransaccion(opciones?.sql ?? obtenerSql(), async (tx) => {
      const h = await bloquearHallazgo(tx, hallazgoId);
      return fn(tx, h, await contextoDeMejora(tx, ahora));
    }),
  );
}

/**
 * El plazo de formular se cuenta otra vez desde este acto cuando el plan se vuelve exigible por un acto que no depende del
 * líder: la decisión de un arbitraje y la exigencia de la acción después de un «no» (spec §13.3, F15-DC27). Va antes de
 * la transición, que lo lee de la ronda en curso.
 */
async function contarDeNuevoElPlazoDeFormular(tx: TransactionSql, h: HallazgoBase, c: ContextoMejora): Promise<void> {
  const [f] = await tx`SELECT to_char(fecha_limite_ente, 'YYYY-MM-DD') AS ente FROM mejora_hallazgos WHERE id = ${h.id}`;
  const plazo = formularAntesDe({ registradoEn: c.ahora, fechaLimiteEnte: (f?.ente as string | null) ?? null }, c);
  await tx`UPDATE mejora_rondas SET formular_antes_de = ${plazo} WHERE hallazgo_id = ${h.id} AND numero = ${h.ronda}`;
}

const enLugarDe = (p: Persona, h: HallazgoBase) => (h.registradoPor !== p.usuarioId ? { enLugarDeQuienRegistro: true } : {});

/** Los archivos de la corrección del hallazgo, por id (el orden en que se subieron). */
async function evidenciaDeLaCorreccion(tx: TransactionSql, id: number): Promise<number[]> {
  const filas = await tx`SELECT id FROM archivos
    WHERE contexto = 'mejora_hallazgo' AND contexto_id = ${id} AND rol = 'correccion' AND version_id IS NULL ORDER BY id`;
  return filas.map((f) => Number(f.id));
}

/**
 * La evidencia que se devolvió con la corrección la última vez (`evidenciaDevuelta` del último `devolver_correccion`), o
 * nada si nunca se devolvió. Lo que se sube después tiene un id mayor: el id dice «después» sin depender de dos relojes
 * (`archivos.creado_en` es la hora de la base al subir; la del evento, la de `ahora`).
 */
async function evidenciaDevuelta(tx: TransactionSql, id: number): Promise<number[]> {
  const [e] = await tx`SELECT detalle FROM mejora_eventos
    WHERE hallazgo_id = ${id} AND tipo = 'devolver_correccion' ORDER BY id DESC LIMIT 1`;
  const lista = (e?.detalle as { evidenciaDevuelta?: unknown } | undefined)?.evidenciaDevuelta;
  return Array.isArray(lista) ? lista.map(Number).filter(Number.isSafeInteger) : [];
}

/** La decisión que había, para el evento del acto que la reemplaza o la borra. */
async function decisionAnterior(tx: TransactionSql, id: number) {
  const [f] = await tx`SELECT accion_requerida, accion_justificacion, accion_decidida_por, accion_decidida_en
    FROM mejora_hallazgos WHERE id = ${id}`;
  return {
    accionRequerida: (f.accion_requerida as boolean | null) ?? null,
    justificacion: (f.accion_justificacion as string | null) ?? null,
    decididaPor: f.accion_decidida_por === null ? null : Number(f.accion_decidida_por),
    decididaEn: (f.accion_decidida_en as Date | null) ?? null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Aceptación, rechazo y arbitraje (spec §8.3)
// ─────────────────────────────────────────────────────────────────────────────

/** El líder acepta: la no conformidad pasa a «Por corregir»; la observación y la oportunidad, a «Por formular». */
export async function aceptarHallazgo(sesion: SesionFlujo, d: { hallazgoId: number }, opciones?: OpcionesFlujo): Promise<void> {
  requerirPermiso(sesion, "mejora.formular");
  const v = leer(EsquemaPasoDelHallazgo, d);
  await conElHallazgo(v.hallazgoId, opciones, async (tx, h, c) => {
    if (!(await puedeAceptar(tx, sesion, h))) await negar(tx, sesion, h.id);
    exigirEstado(h, "aceptar");
    await transicionarHallazgo(tx, sesion, h, "aceptar", {}, c);
  });
}

/** El líder lo rechaza, con justificación; solo en un origen interno (los externos se responden, spec §7.2). */
export async function rechazarHallazgo(
  sesion: SesionFlujo,
  d: { hallazgoId: number; justificacion: string },
  opciones?: OpcionesFlujo,
): Promise<void> {
  requerirPermiso(sesion, "mejora.formular");
  const v = leer(EsquemaRechazo, d);
  await conElHallazgo(v.hallazgoId, opciones, async (tx, h, c) => {
    if (!(await puedeRechazar(tx, sesion, h))) await negar(tx, sesion, h.id);
    if (esExterno(h.origen)) throw new ErrorMejora(EXTERNO_NO_SE_RECHAZA);
    exigirEstado(h, "rechazar");
    await transicionarHallazgo(tx, sesion, h, "rechazar", { soloEnElEvento: { justificacion: v.justificacion } }, c);
  });
}

/**
 * Quien lo registró lo retira tras el rechazo: queda «Rechazado», con la justificación del rechazo a la vista en su historial
 * (retirar no pide una razón propia). Los líderes del proceso reciben el aviso del retiro y, si lo retiró el Admin SGC en su lugar,
 * también quien lo registró (`avisarDelRetiro`).
 */
export async function retirarHallazgo(sesion: SesionFlujo, d: { hallazgoId: number }, opciones?: OpcionesFlujo): Promise<void> {
  requerirPermiso(sesion, "mejora.registrar");
  const v = leer(EsquemaPasoDelHallazgo, d);
  await conElHallazgo(v.hallazgoId, opciones, async (tx, h, c) => {
    if (!puedeDecidirTrasElRechazo(sesion, h)) await negar(tx, sesion, h.id);
    exigirEstado(h, "retirar");
    await transicionarHallazgo(tx, sesion, h, "retirar", { detalle: enLugarDe(sesion, h) }, c);
    await avisarDelRetiro(tx, h, sesion.usuarioId);
  });
}

/**
 * Quien lo registró lo sostiene con su réplica y pasa a arbitraje. El evento guarda quién lo sostuvo (su `usuario_id`):
 * de eso depende quién arbitra (`arbitrosDe`). Si lo sostuvo el Admin SGC en su lugar, quien lo registró recibe el aviso
 * (`avisarDelSostenido`).
 */
export async function sostenerHallazgo(
  sesion: SesionFlujo,
  d: { hallazgoId: number; replica: string },
  opciones?: OpcionesFlujo,
): Promise<void> {
  requerirPermiso(sesion, "mejora.registrar");
  const v = leer(EsquemaSostener, d);
  await conElHallazgo(v.hallazgoId, opciones, async (tx, h, c) => {
    if (!puedeDecidirTrasElRechazo(sesion, h)) await negar(tx, sesion, h.id);
    exigirEstado(h, "sostener");
    await transicionarHallazgo(tx, sesion, h, "sostener", { detalle: enLugarDe(sesion, h), soloEnElEvento: { replica: v.replica } }, c);
    await avisarDelSostenido(tx, h, sesion.usuarioId);
  });
}

/**
 * El arbitraje de un rechazo sostenido (spec §8.3): confirma el hallazgo, que sigue como aceptado y con el plazo de formular
 * contado desde ahora, o confirma el rechazo. Es definitivo. Puede citar el acta del Comité. Su resultado se avisa a quien lo
 * registró y, si confirma el rechazo, a los líderes (`avisarDelArbitraje`); si sigue, los líderes reciben su turno.
 */
export async function arbitrarHallazgo(
  sesion: SesionFlujo,
  d: { hallazgoId: number; confirma: "hallazgo" | "rechazo"; nota: string; acta?: Acta },
  opciones?: OpcionesFlujo,
): Promise<void> {
  if (!puede(sesion, "mejora.gestionar") && !puede(sesion, "mejora.aprobar")) throw new ErrorPermiso();
  const v = leer(EsquemaArbitraje, d);
  const accion = v.confirma === "hallazgo" ? "confirmar_hallazgo" : "confirmar_rechazo";
  await conElHallazgo(v.hallazgoId, opciones, async (tx, h, c) => {
    if (!(await puedeArbitrar(tx, sesion, h))) await negar(tx, sesion, h.id);
    exigirEstado(h, accion);
    exigirActa(v.acta, c);
    if (accion === "confirmar_hallazgo") await contarDeNuevoElPlazoDeFormular(tx, h, c);
    const { despues } = await transicionarHallazgo(tx, sesion, h, accion, { soloEnElEvento: { nota: v.nota }, acta: v.acta }, c);
    await avisarDelArbitraje(tx, h, v.confirma, despues, sesion.usuarioId);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// La corrección (spec §8.4)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Registra la corrección de una no conformidad. «Sí requirió»: qué se hizo, el responsable (un usuario activo o un nombre),
 * la fecha en que se implementó (no futura) y al menos un archivo con rol `correccion` ya subido. «No requiere corrección
 * inmediata»: la justificación. Si la acción correctiva es obligada, el sistema deja `accion_requerida` en verdadero y el
 * hallazgo pasa a «Por formular»; si no, a «Por decidir». Tras una devolución se registra otra vez y reemplaza la anterior,
 * que queda en su evento.
 */
export async function registrarCorreccion(
  sesion: SesionFlujo,
  d: {
    hallazgoId: number;
    requerida: boolean;
    descripcion: string;
    responsableId?: number | null;
    responsableNombre?: string | null;
    implementadaEn?: string | null;
  },
  opciones?: OpcionesFlujo,
): Promise<void> {
  requerirPermiso(sesion, "mejora.formular");
  const v = leer(EsquemaCorreccion, d);
  await conElHallazgo(v.hallazgoId, opciones, async (tx, h, c) => {
    if (!(await puedeCorregir(tx, sesion, h))) await negar(tx, sesion, h.id);
    exigirEstado(h, "corregir");
    if (v.requerida) {
      if (v.implementadaEn !== null && v.implementadaEn > fechaEnZona(c.ahora, c.zona)) {
        throw new ErrorMejora("La fecha en que se implementó la corrección no puede ser futura");
      }
      if (v.responsableId !== null) {
        const [u] = await tx`SELECT 1 FROM usuarios WHERE id = ${v.responsableId} AND activo`;
        if (!u) throw new ErrorMejora("Elija un responsable activo, o escriba el nombre de quien hizo la corrección");
      }
      // Después del candado: una subida en curso espera al hallazgo bloqueado, o ya está confirmada y se cuenta. Tras una
      // devolución, la evidencia devuelta no basta: hace falta al menos un archivo subido después.
      const evidencia = await evidenciaDeLaCorreccion(tx, h.id);
      if (evidencia.length === 0) throw new ErrorMejora(SIN_EVIDENCIA);
      const devuelta = await evidenciaDevuelta(tx, h.id);
      if (devuelta.length > 0 && !evidencia.some((a) => a > Math.max(...devuelta))) throw new ErrorMejora(EVIDENCIA_DEVUELTA);
    }
    const obligada = accionObligada(h);
    await tx`UPDATE mejora_hallazgos SET correccion_requerida = ${v.requerida}, correccion_descripcion = ${v.descripcion},
        correccion_responsable_id = ${v.responsableId}, correccion_responsable_nombre = ${v.responsableNombre},
        correccion_implementada_en = ${v.implementadaEn}, correccion_registrada_por = ${sesion.usuarioId},
        correccion_registrada_en = ${c.ahora}
      WHERE id = ${h.id}`;
    if (obligada) await tx`UPDATE mejora_hallazgos SET accion_requerida = true WHERE id = ${h.id}`;
    await transicionarHallazgo(
      tx,
      sesion,
      h,
      "corregir",
      {
        detalle: {
          requerida: v.requerida,
          responsableId: v.responsableId,
          implementadaEn: v.implementadaEn,
          ...(obligada ? { accionObligada: true } : {}),
        },
        soloEnElEvento: { descripcion: v.descripcion, responsableNombre: v.responsableNombre },
      },
      c,
    );
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// La decisión y el camino corto (spec §8.5)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Decide si la no conformidad requiere acción correctiva, con justificación y, si se quiere, el acta del Comité. En «Por
 * decidir» decide el Admin SGC: «sí» pasa a «Por formular» y «no», a «Por validar». En «Por validar», el Admin SGC o
 * Gerencia cambian el «no» por «sí» (literal c del SGC-PR-03 §5.2): pasa a «Por formular» con el plazo de formular contado
 * desde ahora, y el evento guarda la decisión anterior. Una no conformidad con acción obligada no pasa por aquí.
 */
export async function decidirAccionCorrectiva(
  sesion: SesionFlujo,
  d: { hallazgoId: number; requiere: boolean; justificacion: string; acta?: Acta },
  opciones?: OpcionesFlujo,
): Promise<void> {
  if (!puede(sesion, "mejora.gestionar") && !puede(sesion, "mejora.aprobar")) throw new ErrorPermiso();
  const v = leer(EsquemaDecision, d);
  const accion = v.requiere ? "decidir_si" : "decidir_no";
  await conElHallazgo(v.hallazgoId, opciones, async (tx, h, c) => {
    exigirEstado(h, accion);
    const exige = h.estado === "por_validar";
    // La primera decisión es del Admin SGC; Gerencia solo exige la acción después de un «no».
    if (!exige && !puede(sesion, "mejora.gestionar")) await negar(tx, sesion, h.id);
    exigirActa(v.acta, c);
    const antes = exige ? await decisionAnterior(tx, h.id) : null;
    if (exige) await contarDeNuevoElPlazoDeFormular(tx, h, c);
    await tx`UPDATE mejora_hallazgos SET accion_requerida = ${v.requiere}, accion_justificacion = ${v.justificacion},
        accion_decidida_por = ${sesion.usuarioId}, accion_decidida_en = ${c.ahora}
      WHERE id = ${h.id}`;
    await transicionarHallazgo(
      tx,
      sesion,
      h,
      accion,
      { soloEnElEvento: { justificacion: v.justificacion, ...(antes ? { antes } : {}) }, acta: v.acta },
      c,
    );
  });
}

/**
 * Valida la corrección (queda «Cerrado con corrección») o, si no hubo corrección, el cierre sin acción (queda «Cerrado sin
 * acción»). Quién valida lo dice `puedeValidarCorreccion`. Lo que escribe va antes de la transición al cierre. El cierre se avisa
 * como el eficaz (`avisarDelCierre`), con su desenlace en el título.
 */
export async function validarCorreccion(sesion: SesionFlujo, d: { hallazgoId: number }, opciones?: OpcionesFlujo): Promise<void> {
  requerirPermiso(sesion, "mejora.verificar");
  const v = leer(EsquemaPasoDelHallazgo, d);
  await conElHallazgo(v.hallazgoId, opciones, async (tx, h, c) => {
    if (!(await puedeValidarCorreccion(h.id, sesion, { sql: tx }))) await negar(tx, sesion, h.id);
    exigirEstado(h, "validar_correccion");
    // No se cierra con corrección sin evidencia (PC-02): se vuelve a contar aquí, con el hallazgo bloqueado.
    if (h.correccionRequerida === true && (await evidenciaDeLaCorreccion(tx, h.id)).length === 0) {
      throw new ErrorMejora(SIN_EVIDENCIA_AL_VALIDAR);
    }
    const resultado = h.correccionRequerida === false ? "sin_accion" : "con_correccion";
    await tx`UPDATE mejora_hallazgos SET validada_por = ${sesion.usuarioId}, validada_en = ${c.ahora},
        resultado_cierre = ${resultado}, cerrado_en = ${c.ahora}, cerrado_por = ${sesion.usuarioId}
      WHERE id = ${h.id}`;
    await transicionarHallazgo(tx, sesion, h, "validar_correccion", { detalle: { resultado } }, c);
    await avisarDelCierre(tx, h, resultado, sesion.usuarioId);
  });
}

/**
 * Devuelve la corrección con una nota: vuelve a «Por corregir», y la decisión se toma otra vez después de la corrección
 * nueva, así que la de ahora se borra de la fila y queda en el evento (como al reclasificar).
 */
export async function devolverCorreccion(
  sesion: SesionFlujo,
  d: { hallazgoId: number; nota: string },
  opciones?: OpcionesFlujo,
): Promise<void> {
  requerirPermiso(sesion, "mejora.verificar");
  const v = leer(EsquemaDevolucion, d);
  await conElHallazgo(v.hallazgoId, opciones, async (tx, h, c) => {
    if (!(await puedeValidarCorreccion(h.id, sesion, { sql: tx }))) await negar(tx, sesion, h.id);
    exigirEstado(h, "devolver_correccion");
    const antes = await decisionAnterior(tx, h.id);
    // La evidencia que se devuelve: registrar la corrección otra vez pedirá un archivo subido después.
    const devuelta = await evidenciaDeLaCorreccion(tx, h.id);
    await tx`UPDATE mejora_hallazgos SET accion_requerida = NULL, accion_justificacion = NULL, accion_decidida_por = NULL,
        accion_decidida_en = NULL
      WHERE id = ${h.id}`;
    await transicionarHallazgo(
      tx,
      sesion,
      h,
      "devolver_correccion",
      { detalle: { evidenciaDevuelta: devuelta }, soloEnElEvento: { nota: v.nota, decision: { antes } } },
      c,
    );
  });
}
