/**
 * El motor del hallazgo (spec 15 §8.2, F15-DC12): como `transicionar` en los trámites, todo cambio de estado entra por
 * `transicionarHallazgo` y todo hallazgo nace por `nacerHallazgo`. Ningún otro código inserta en `mejora_hallazgos` ni
 * cambia su `estado` o su `ronda`. Cada paso deja su evento, su vencimiento, su bitácora y sus avisos.
 *
 * El evento va antes del cambio de estado: un hallazgo cerrado, rechazado o anulado no admite hijas nuevas (trigger
 * `sgc_impedir_si_hallazgo_terminado`, `42501`). El orden de candados de todo camino del módulo: el hallazgo `FOR UPDATE`
 * primero (`bloquearHallazgo`) y sus hijas después.
 */
import type { Row, TransactionSql } from "postgres";
import type { Cliente } from "@/db/cliente";
import { registrarAuditoria } from "@/db/consultas/admin";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { formularAntesDe, venceEn, type Paso } from "@/lib/mejoramiento/plazos";
import { destinoDe, YA_CAMBIO, type Rumbo } from "@/lib/mejoramiento/transiciones";
import {
  ErrorMejora,
  TERMINALES,
  type AccionHallazgo,
  type Clase,
  type Criticidad,
  type EstadoHallazgo,
  type HallazgoBase,
  type Origen,
  type ResultadoCierre,
} from "@/lib/mejoramiento/tipos";
import { avisarDelTurno, ENTIDAD_HALLAZGO } from "./avisos";
import type { ContextoMejora } from "./config";
import { avisarAQuienesReportaron } from "./reportes-base";

export const NO_EXISTE = "El hallazgo no existe";

/**
 * Lo que acompaña a un paso: el rumbo de la tabla, el detalle del evento y, si se hizo en papel, su fecha real. El detalle
 * llega tal cual al evento y a la bitácora; el motor le añade `estado: { antes, despues }`, `acta` y, en la bitácora,
 * `codigo` y `ronda`, y rechaza un detalle que ya traiga alguna de esas claves (`CLAVES_DEL_MOTOR`). `soloEnElEvento` va
 * al detalle del evento y nunca a la bitácora: el plan congelado al enviarlo y al aprobarlo (spec §12.2) y todo texto escrito por
 * una persona (justificaciones, réplica, notas, observaciones, la descripción de la corrección; spec §6.4). Sus claves no
 * pueden ser del motor ni repetir las de `detalle`. `sinAvisoDelTurno` no avisa el turno del estado nuevo: lo pasa solo quien
 * avisa por su cuenta a quienes lo reciben (la aprobación del plan, con un aviso por actividad, spec §14.2). `nuevaRonda` abre
 * la ronda siguiente (spec §8.7: la evaluación «no eficaz»): solo hacia «Por formular».
 */
export type Paso_x = {
  rumbo?: Rumbo;
  detalle?: Record<string, unknown>;
  soloEnElEvento?: Record<string, unknown>;
  sinAvisoDelTurno?: boolean;
  nuevaRonda?: boolean;
  fuera?: boolean;
  ocurrioEn?: Date;
  acta?: { numero: string; fecha: string } | null;
};

/** Las columnas de la identificación (spec §7.1), con el código ya tomado (`tomarCodigo`). */
export type FilaNueva = {
  codigo: string;
  anio: number;
  consecutivo: number;
  clase: Clase;
  origen: Origen;
  fuente: string | null;
  referenciaCaso: string | null;
  detectadoEn: string;
  procesoId: number;
  subprocesoId: number | null;
  criticidad: Criticidad | null;
  titulo: string;
  descripcion: string;
  requisitoClausula: string | null;
  requisitoNormaId: number | null;
  requisitoDocumentoId: number | null;
  documentoId: number | null;
  indicadorId: number | null;
  medicionId: number | null;
  riesgo: string | null;
  fechaLimiteEnte: string | null;
  reincidenteDe: number | null;
  /** El hallazgo en cuya verificación se encontró este (spec §11.4); quien registra lo ve (`registrarHallazgo`). */
  derivadoDe?: number | null;
  /** El hallazgo de verificación de Distribución del que nace la no conformidad (Fase 15B, anexo §7.2). */
  verificacionHallazgoId?: number | null;
  /**
   * La acción correctiva requerida desde que nace (anexo §7.2): la fila guarda la decisión, su justificación y quién la tomó, en las
   * columnas de la decisión de la 15A.
   */
  accion?: { justificacion: string; decididaPor: number; decididaEn: Date } | null;
};

const idONulo = (v: unknown) => (v === null || v === undefined ? null : Number(v));

/** El hallazgo de una fila con sus columnas (las de `hallazgoBase`). Lo reutilizan las tareas y la pasada de vencimientos. */
export function aBase(f: Row): HallazgoBase {
  return {
    id: Number(f.id),
    codigo: f.codigo as string,
    clase: f.clase as Clase,
    criticidad: (f.criticidad as Criticidad | null) ?? null,
    origen: f.origen as Origen,
    estado: f.estado as EstadoHallazgo,
    ronda: Number(f.ronda),
    procesoId: Number(f.proceso_id),
    reincidenteDe: idONulo(f.reincidente_de),
    correccionRequerida: (f.correccion_requerida as boolean | null) ?? null,
    accionRequerida: (f.accion_requerida as boolean | null) ?? null,
    resultadoCierre: (f.resultado_cierre as ResultadoCierre | null) ?? null,
    registradoPor: Number(f.registrado_por),
    verificacionHallazgoId: idONulo(f.verificacion_hallazgo_id),
  };
}

/** El hallazgo sin candado: para el validador de solo lectura de un acto con firma (F13A-R4), antes de abrir la transacción. */
export async function hallazgoBase(sql: Cliente, id: number): Promise<HallazgoBase | null> {
  const [f] = await sql`SELECT id, codigo, clase, criticidad, origen, estado, ronda, proceso_id, reincidente_de,
      correccion_requerida, accion_requerida, resultado_cierre, registrado_por, verificacion_hallazgo_id
    FROM mejora_hallazgos WHERE id = ${id}`;
  return f ? aBase(f) : null;
}

/** El hallazgo `FOR UPDATE`, con su título (el cuerpo de los avisos). */
async function releer(tx: TransactionSql, id: number): Promise<{ h: HallazgoBase; titulo: string }> {
  const [f] = await tx`SELECT id, codigo, clase, criticidad, origen, estado, ronda, proceso_id, reincidente_de,
      correccion_requerida, accion_requerida, resultado_cierre, registrado_por, verificacion_hallazgo_id, titulo
    FROM mejora_hallazgos WHERE id = ${id} FOR UPDATE`;
  if (!f) throw new ErrorMejora(NO_EXISTE);
  return { h: aBase(f), titulo: f.titulo as string };
}

/** El primer candado de todo camino que escribe en un hallazgo. */
export async function bloquearHallazgo(tx: TransactionSql, id: number): Promise<HallazgoBase> {
  return (await releer(tx, id)).h;
}

/** El paso cuyo plazo corre en cada estado (spec §13.3); `por_formular` tiene su regla propia. */
const PASO_DEL_ESTADO: Partial<Record<EstadoHallazgo, Paso>> = {
  por_aceptar: "aceptar",
  rechazo: "decision",
  arbitraje: "decision",
  por_decidir: "decision",
  por_validar: "decision",
  por_cerrar: "decision",
  por_corregir: "correccion",
  en_revision: "revisar",
  en_aprobacion: "aprobar",
  por_verificar: "verificar",
};

/**
 * El vencimiento del estado nuevo. En `por_formular`, el plazo fijado en la ronda (no se corre por lo que tardaron la
 * aceptación o la corrección), salvo tras una devolución del plan, que da el de reenviar. Nulo en `en_ejecucion`,
 * `en_espera` y los terminales.
 */
function vencimientoDe(estado: EstadoHallazgo, accion: AccionHallazgo, formularAntes: Date | null, c: ContextoMejora): Date | null {
  if (estado === "por_formular") {
    if (accion === "devolver_plan") return venceEn("reenviar", c.ahora, c);
    return formularAntes ?? venceEn("formular", c.ahora, c);
  }
  const paso = PASO_DEL_ESTADO[estado];
  return paso ? venceEn(paso, c.ahora, c) : null;
}

async function formularDeLaRonda(tx: TransactionSql, hallazgoId: number, ronda: number): Promise<Date | null> {
  const [r] = await tx`SELECT formular_antes_de FROM mejora_rondas WHERE hallazgo_id = ${hallazgoId} AND numero = ${ronda}`;
  return (r?.formular_antes_de as Date | null | undefined) ?? null;
}

const conActa = (x: Paso_x) => (x.acta ? { acta: x.acta } : {});

/**
 * Las claves del detalle que pone el motor: el cambio de estado va en `estado: { antes, despues }`, aparte del de quien llama;
 * la ronda que abre `nuevaRonda`, en `rondaNueva`.
 */
const CLAVES_DEL_MOTOR = ["estado", "codigo", "ronda", "acta", "rondaNueva"] as const;

/**
 * El detalle de quien llama, tal cual, y lo que va solo al evento; si alguno trae una clave del motor, o lo del evento repite
 * una del detalle, es un error de programación, no de la persona.
 */
function detalleDeQuienLlama(x: Paso_x): { detalle: Record<string, unknown>; soloEvento: Record<string, unknown> } {
  const detalle = x.detalle ?? {};
  const soloEvento = x.soloEnElEvento ?? {};
  const chocan = CLAVES_DEL_MOTOR.filter((k) => Object.hasOwn(detalle, k) || Object.hasOwn(soloEvento, k));
  if (chocan.length > 0) {
    throw new Error(`El detalle de un paso del hallazgo no puede traer ${chocan.join(", ")}: las pone el motor`);
  }
  const repetidas = Object.keys(soloEvento).filter((k) => Object.hasOwn(detalle, k));
  if (repetidas.length > 0) throw new Error(`Lo que va solo al evento repite ${repetidas.join(", ")} del detalle`);
  return { detalle, soloEvento };
}

export async function dejarEvento(
  tx: TransactionSql,
  e: {
    hallazgoId: number;
    ronda: number;
    tipo: string;
    detalle?: Record<string, unknown>;
    usuarioId: number | null;
    fuera?: boolean;
    ocurrioEn: Date;
  },
): Promise<void> {
  await tx`INSERT INTO mejora_eventos (hallazgo_id, ronda, tipo, detalle, usuario_id, fuera, ocurrio_en)
    VALUES (${e.hallazgoId}, ${e.ronda}, ${e.tipo}, ${tx.json((e.detalle ?? {}) as never)}, ${e.usuarioId},
      ${e.fuera ?? false}, ${e.ocurrioEn})`;
}

/**
 * La única función que inserta en `mejora_hallazgos`: el estado sale de la tabla (`registrar` o `cargar`), la fila nace
 * con él y en la ronda 1, y la ronda 1 con su plazo de formular (la fecha del ente, si la hay, spec §13.4). De ahí en
 * adelante, lo mismo que una transición, también `sinAvisoDelTurno`. Con `fila.accion` (la no conformidad de un hallazgo de
 * verificación, Fase 15B §7.2), la acción correctiva nace requerida, con su justificación, quién la decidió y cuándo.
 */
export async function nacerHallazgo(
  tx: TransactionSql,
  sesion: SesionFlujo,
  fila: FilaNueva,
  accion: "registrar" | "cargar",
  x: Paso_x,
  c: ContextoMejora,
): Promise<HallazgoBase> {
  const { detalle, soloEvento } = detalleDeQuienLlama(x);
  const verificacionHallazgoId = fila.verificacionHallazgoId ?? null;
  const decision = fila.accion ?? null;
  // Un hallazgo nuevo no tiene estado: para `registrar` y `cargar`, `DESDE` es «nuevo» y no lo mira.
  const estado = destinoDe(accion, { ...fila, estado: "por_aceptar", correccionRequerida: null, verificacionHallazgoId }, x.rumbo ?? {});
  const formularAntes = formularAntesDe({ registradoEn: c.ahora, fechaLimiteEnte: fila.fechaLimiteEnte }, c);
  const vence = vencimientoDe(estado, accion, formularAntes, c);
  const [nuevo] = await tx`INSERT INTO mejora_hallazgos
      (codigo, anio, consecutivo, clase, origen, fuente, referencia_caso, detectado_en, proceso_id, subproceso_id,
       criticidad, titulo, descripcion, requisito_clausula, requisito_norma_id, requisito_documento_id, documento_id,
       indicador_id, medicion_id, riesgo, estado, ronda, registrado_por, registrado_en, reincidente_de, derivado_de, cargado,
       fecha_limite_ente, vence_en, verificacion_hallazgo_id, accion_requerida, accion_justificacion, accion_decidida_por,
       accion_decidida_en)
    VALUES (${fila.codigo}, ${fila.anio}, ${fila.consecutivo}, ${fila.clase}, ${fila.origen}, ${fila.fuente},
      ${fila.referenciaCaso}, ${fila.detectadoEn}, ${fila.procesoId}, ${fila.subprocesoId}, ${fila.criticidad},
      ${fila.titulo}, ${fila.descripcion}, ${fila.requisitoClausula}, ${fila.requisitoNormaId},
      ${fila.requisitoDocumentoId}, ${fila.documentoId}, ${fila.indicadorId}, ${fila.medicionId}, ${fila.riesgo},
      ${estado}, 1, ${sesion.usuarioId}, ${c.ahora}, ${fila.reincidenteDe}, ${fila.derivadoDe ?? null}, ${accion === "cargar"},
      ${fila.fechaLimiteEnte}, ${vence}, ${verificacionHallazgoId}, ${decision ? true : null}, ${decision?.justificacion ?? null},
      ${decision?.decididaPor ?? null}, ${decision?.decididaEn ?? null})
    RETURNING id`;
  const id = Number(nuevo.id);
  await tx`INSERT INTO mejora_rondas (hallazgo_id, numero, formular_antes_de) VALUES (${id}, 1, ${formularAntes})`;
  await dejarEvento(tx, {
    hallazgoId: id,
    ronda: 1,
    tipo: accion,
    detalle: { ...detalle, ...soloEvento, ...conActa(x), estado: { antes: null, despues: estado } },
    usuarioId: sesion.usuarioId,
    fuera: x.fuera,
    ocurrioEn: x.ocurrioEn ?? c.ahora,
  });
  await registrarAuditoria(tx, {
    usuarioId: sesion.usuarioId,
    accion: `mejora_${accion}`,
    entidad: ENTIDAD_HALLAZGO,
    entidadId: id,
    detalle: {
      titulo: fila.titulo,
      ...detalle,
      ...conActa(x),
      codigo: fila.codigo,
      estado: { antes: null, despues: estado },
      ronda: 1,
    },
  });
  const h: HallazgoBase = {
    id,
    codigo: fila.codigo,
    clase: fila.clase,
    criticidad: fila.criticidad,
    origen: fila.origen,
    estado,
    ronda: 1,
    procesoId: fila.procesoId,
    reincidenteDe: fila.reincidenteDe,
    correccionRequerida: null,
    accionRequerida: decision ? true : null,
    resultadoCierre: null,
    registradoPor: sesion.usuarioId,
    verificacionHallazgoId,
  };
  // Un hallazgo cargado no avisa al nacer: su plan se entrega cuando llega su formato firmado (`confirmarCarga`).
  if (!x.sinAvisoDelTurno) await avisarDelTurno(tx, h, fila.titulo, sesion.usuarioId);
  return h;
}

/**
 * La única función que cambia `estado` y `ronda`. Relee la fila `FOR UPDATE`: si el estado (o la ronda) no es el de `h`,
 * otra transacción lo cambió después de que quien llama lo leyó, y lanza `YA_CAMBIO` sin escribir nada. El destino, el
 * turno y el vencimiento salen de la fila releída. Un paso que deja el hallazgo en el mismo estado (`reclasificar`,
 * `ajustar`) no cambia de paso: deja su evento y su bitácora, conserva el vencimiento y sus marcas y no vuelve a avisar.
 *
 * Con `nuevaRonda` (spec §8.7), el evento y la bitácora son de la ronda que termina (la evaluada), con `rondaNueva`; después se
 * inserta la fila de la ronda siguiente con su plazo de formular (antes de leerlo para el vencimiento), el hallazgo pasa a
 * ella en el mismo `UPDATE` que su estado y el turno se avisa con la ronda nueva. Las filas de la ronda anterior no se tocan.
 */
export async function transicionarHallazgo(
  tx: TransactionSql,
  sesion: SesionFlujo | null,
  h: HallazgoBase,
  accion: Exclude<AccionHallazgo, "registrar" | "cargar">,
  x: Paso_x,
  c: ContextoMejora,
): Promise<{ antes: EstadoHallazgo; despues: EstadoHallazgo; ronda: number }> {
  const { detalle, soloEvento } = detalleDeQuienLlama(x);
  const { h: actual, titulo } = await releer(tx, h.id);
  if (actual.estado !== h.estado || actual.ronda !== h.ronda) throw new ErrorMejora(YA_CAMBIO);
  const antes = actual.estado;
  const despues = destinoDe(accion, actual, x.rumbo ?? {});
  if (x.nuevaRonda && despues !== "por_formular") {
    throw new Error(`Una ronda nueva empieza en «Por formular», no en ${despues}`);
  }
  const ronda = actual.ronda;
  const rondaSiguiente = x.nuevaRonda ? ronda + 1 : ronda;
  const deLaRondaNueva = x.nuevaRonda ? { rondaNueva: rondaSiguiente } : {};
  const usuarioId = sesion?.usuarioId ?? null;

  await dejarEvento(tx, {
    hallazgoId: actual.id,
    ronda,
    tipo: accion,
    detalle: { ...detalle, ...soloEvento, ...conActa(x), ...deLaRondaNueva, estado: { antes, despues } },
    usuarioId,
    fuera: x.fuera,
    ocurrioEn: x.ocurrioEn ?? c.ahora,
  });
  if (x.nuevaRonda) {
    await tx`INSERT INTO mejora_rondas (hallazgo_id, numero, formular_antes_de)
      VALUES (${actual.id}, ${rondaSiguiente}, ${venceEn("formular", c.ahora, c)})`;
  }
  const cambia = despues !== antes;
  if (cambia) {
    const formularAntes =
      despues === "por_formular" && accion !== "devolver_plan" ? await formularDeLaRonda(tx, actual.id, rondaSiguiente) : null;
    const vence = vencimientoDe(despues, accion, formularAntes, c);
    await tx`UPDATE mejora_hallazgos
      SET estado = ${despues}, ronda = ${rondaSiguiente}, vence_en = ${vence}, aviso_vencido_en = NULL, escalado_en = NULL,
        aviso_evaluar_en = NULL
      WHERE id = ${actual.id}`;
  }
  await registrarAuditoria(tx, {
    usuarioId,
    accion: `mejora_${accion}`,
    entidad: ENTIDAD_HALLAZGO,
    entidadId: actual.id,
    detalle: { ...detalle, ...conActa(x), ...deLaRondaNueva, codigo: actual.codigo, estado: { antes, despues }, ronda },
  });
  if (cambia && !x.sinAvisoDelTurno) {
    await avisarDelTurno(tx, { ...actual, estado: despues, ronda: rondaSiguiente }, titulo, usuarioId);
  }
  // Quien reportó lo que dio origen al hallazgo (o se le sumó) sabe que terminó, sin su contenido (spec §7.3).
  if (cambia && TERMINALES.includes(despues)) await avisarAQuienesReportaron(tx, actual.id, usuarioId);
  return { antes, despues, ronda: rondaSiguiente };
}

// La traducción de los errores crudos de PostgreSQL vive en un módulo hoja (la usan también `archivos.ts` y `config.ts`).
export { legible } from "./legible";
