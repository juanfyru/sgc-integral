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
import { registrarAuditoria } from "@/db/consultas/admin";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { formularAntesDe, venceEn, type Paso } from "@/lib/mejoramiento/plazos";
import { destinoDe, YA_CAMBIO, type Rumbo } from "@/lib/mejoramiento/transiciones";
import {
  ErrorMejora,
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

export const NO_EXISTE = "El hallazgo no existe";

/** Lo que acompaña a un paso: el rumbo de la tabla, el detalle del evento y, si se hizo en papel, su fecha real. */
export type Paso_x = {
  rumbo?: Rumbo;
  detalle?: Record<string, unknown>;
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
};

const idONulo = (v: unknown) => (v === null || v === undefined ? null : Number(v));

function aBase(f: Row): HallazgoBase {
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
  };
}

/** El hallazgo `FOR UPDATE`, con su título (el cuerpo de los avisos). */
async function releer(tx: TransactionSql, id: number): Promise<{ h: HallazgoBase; titulo: string }> {
  const [f] = await tx`SELECT id, codigo, clase, criticidad, origen, estado, ronda, proceso_id, reincidente_de,
      correccion_requerida, accion_requerida, resultado_cierre, registrado_por, titulo
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
 * adelante, lo mismo que una transición.
 */
export async function nacerHallazgo(
  tx: TransactionSql,
  sesion: SesionFlujo,
  fila: FilaNueva,
  accion: "registrar" | "cargar",
  x: Paso_x,
  c: ContextoMejora,
): Promise<HallazgoBase> {
  // Un hallazgo nuevo no tiene estado: para `registrar` y `cargar`, `DESDE` es «nuevo» y no lo mira.
  const estado = destinoDe(accion, { ...fila, estado: "por_aceptar", correccionRequerida: null }, x.rumbo ?? {});
  const formularAntes = formularAntesDe({ registradoEn: c.ahora, fechaLimiteEnte: fila.fechaLimiteEnte }, c);
  const vence = vencimientoDe(estado, accion, formularAntes, c);
  const [nuevo] = await tx`INSERT INTO mejora_hallazgos
      (codigo, anio, consecutivo, clase, origen, fuente, referencia_caso, detectado_en, proceso_id, subproceso_id,
       criticidad, titulo, descripcion, requisito_clausula, requisito_norma_id, requisito_documento_id, documento_id,
       indicador_id, medicion_id, riesgo, estado, ronda, registrado_por, registrado_en, reincidente_de, cargado,
       fecha_limite_ente, vence_en)
    VALUES (${fila.codigo}, ${fila.anio}, ${fila.consecutivo}, ${fila.clase}, ${fila.origen}, ${fila.fuente},
      ${fila.referenciaCaso}, ${fila.detectadoEn}, ${fila.procesoId}, ${fila.subprocesoId}, ${fila.criticidad},
      ${fila.titulo}, ${fila.descripcion}, ${fila.requisitoClausula}, ${fila.requisitoNormaId},
      ${fila.requisitoDocumentoId}, ${fila.documentoId}, ${fila.indicadorId}, ${fila.medicionId}, ${fila.riesgo},
      ${estado}, 1, ${sesion.usuarioId}, ${c.ahora}, ${fila.reincidenteDe}, ${accion === "cargar"},
      ${fila.fechaLimiteEnte}, ${vence})
    RETURNING id`;
  const id = Number(nuevo.id);
  await tx`INSERT INTO mejora_rondas (hallazgo_id, numero, formular_antes_de) VALUES (${id}, 1, ${formularAntes})`;
  await dejarEvento(tx, {
    hallazgoId: id,
    ronda: 1,
    tipo: accion,
    detalle: { ...x.detalle, ...conActa(x), antes: null, despues: estado },
    usuarioId: sesion.usuarioId,
    fuera: x.fuera,
    ocurrioEn: x.ocurrioEn ?? c.ahora,
  });
  await registrarAuditoria(tx, {
    usuarioId: sesion.usuarioId,
    accion: `mejora_${accion}`,
    entidad: ENTIDAD_HALLAZGO,
    entidadId: id,
    detalle: { ...x.detalle, ...conActa(x), codigo: fila.codigo, titulo: fila.titulo, antes: null, despues: estado, ronda: 1 },
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
    accionRequerida: null,
    resultadoCierre: null,
    registradoPor: sesion.usuarioId,
  };
  await avisarDelTurno(tx, h, fila.titulo, sesion.usuarioId);
  return h;
}

/**
 * La única función que cambia `estado` y `ronda`. Relee la fila `FOR UPDATE`: si el estado (o la ronda) no es el de `h`,
 * otra transacción lo cambió después de que quien llama lo leyó, y lanza `YA_CAMBIO` sin escribir nada. El destino, el
 * turno y el vencimiento salen de la fila releída. Un paso que deja el hallazgo en el mismo estado (`reclasificar`,
 * `ajustar`) no cambia de paso: deja su evento y su bitácora, conserva el vencimiento y sus marcas y no vuelve a avisar.
 */
export async function transicionarHallazgo(
  tx: TransactionSql,
  sesion: SesionFlujo | null,
  h: HallazgoBase,
  accion: Exclude<AccionHallazgo, "registrar" | "cargar">,
  x: Paso_x,
  c: ContextoMejora,
): Promise<{ antes: EstadoHallazgo; despues: EstadoHallazgo; ronda: number }> {
  const { h: actual, titulo } = await releer(tx, h.id);
  if (actual.estado !== h.estado || actual.ronda !== h.ronda) throw new ErrorMejora(YA_CAMBIO);
  const antes = actual.estado;
  const despues = destinoDe(accion, actual, x.rumbo ?? {});
  const ronda = actual.ronda;
  const usuarioId = sesion?.usuarioId ?? null;

  await dejarEvento(tx, {
    hallazgoId: actual.id,
    ronda,
    tipo: accion,
    detalle: { ...x.detalle, ...conActa(x), antes, despues },
    usuarioId,
    fuera: x.fuera,
    ocurrioEn: x.ocurrioEn ?? c.ahora,
  });
  const cambia = despues !== antes;
  if (cambia) {
    const formularAntes =
      despues === "por_formular" && accion !== "devolver_plan" ? await formularDeLaRonda(tx, actual.id, ronda) : null;
    const vence = vencimientoDe(despues, accion, formularAntes, c);
    await tx`UPDATE mejora_hallazgos
      SET estado = ${despues}, vence_en = ${vence}, aviso_vencido_en = NULL, escalado_en = NULL, aviso_evaluar_en = NULL
      WHERE id = ${actual.id}`;
  }
  await registrarAuditoria(tx, {
    usuarioId,
    accion: `mejora_${accion}`,
    entidad: ENTIDAD_HALLAZGO,
    entidadId: actual.id,
    detalle: { ...x.detalle, ...conActa(x), codigo: actual.codigo, antes, despues, ronda },
  });
  if (cambia) await avisarDelTurno(tx, { ...actual, estado: despues }, titulo, usuarioId);
  return { antes, despues, ronda };
}

/** Lo que el dominio dice de cada error crudo de PostgreSQL que puede escaparse de una escritura del módulo. */
const LEGIBLES: Record<string, string> = {
  "23503": "Uno de los datos elegidos ya no existe: vuelva a cargar la página",
  "23505": "Otra persona guardó lo mismo a la vez: vuelva a cargar la página",
  "42501": "El hallazgo ya terminó y no admite cambios",
  "40P01": "Otra persona cambió el hallazgo a la vez: vuelva a intentarlo",
};

/**
 * Traduce `23503`, `23505`, `42501` y `40P01` a `ErrorMejora` antes de que salgan del dominio: `mutacion` le muestra a
 * la persona el mensaje de cualquier error. Los demás errores (los del dominio, entre ellos) pasan tal cual.
 */
export async function legible<T>(p: Promise<T>): Promise<T> {
  try {
    return await p;
  } catch (err) {
    const codigo = (err as { code?: unknown } | null)?.code;
    if (typeof codigo === "string" && Object.hasOwn(LEGIBLES, codigo)) {
      const traducido = new ErrorMejora(LEGIBLES[codigo]);
      traducido.cause = err;
      throw traducido;
    }
    throw err;
  }
}
