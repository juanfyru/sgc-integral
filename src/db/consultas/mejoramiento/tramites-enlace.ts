/**
 * El cambio documental desde una actividad (Fase 15B, anexo §9): el enlace de una actividad de un plan de acción aprobado con un
 * trámite documental (`mejora_actividad_tramites`). Una actividad tiene varios trámites; un trámite, a lo sumo una actividad. Se pide
 * desde la actividad (`crearSolicitud` con `actividadId`: el único punto donde el motor del trámite conoce a Mejoramiento) o se enlaza
 * después uno que ya existe; el estado del trámite se lee cada vez, y un trámite que terminó bien («publicado» o «eliminado») vale como
 * evidencia para terminar la actividad y para el cierre (§9.4 y §9.6). El aviso de que terminó lo da la pasada de vencimientos (§9.5).
 *
 * Qué actividad admite un trámite (§9.2), una sola regla para pedir, enlazar y lo que pinta la página: de un plan aprobado
 * (`fin_original`), sin terminar ni cancelar, de un hallazgo sin terminar y, si es una carga, con su formato firmado
 * (`cargaResuelta`). Pide o enlaza quien la ve (`puedeVerActividad`) y tiene `tramites.solicitar`. Las reglas del trámite no cambian:
 * `crearSolicitud` sigue exigiendo que el líder pida sobre sus procesos.
 *
 * Módulo liviano: lo importa `crearSolicitud` (`tramites-flujo.ts`). No importa `flujo.ts`, `lectura.ts`, `actividades.ts`, `admin.ts`
 * ni `tramites-flujo.ts`: escribe sus eventos y su bitácora por SQL, con ids y etiquetas, nunca el texto libre (decisión 42 de la 15A).
 */
import type { TransactionSql } from "postgres";
import { obtenerSql, type Cliente } from "@/db/cliente";
import { enTransaccion, type OpcionesFlujo, type SesionFlujo } from "@/db/consultas/flujo/contrato";
import { listarTramites, tramiteVisto } from "@/db/consultas/tramites";
import { cargaResuelta, puedeVerActividad } from "@/lib/alcance";
import { ACTIVIDAD_NO_ADMITE, ENLACE_NO_EXISTE, ENLACE_NO_SE_QUITA, TRAMITE_NO_SIRVE } from "@/lib/mejoramiento/enganches";
import { ACTIVIDAD_ABIERTA, ErrorMejora, TERMINALES, type EstadoActividad, type EstadoHallazgo } from "@/lib/mejoramiento/tipos";
import { puede, requerirPermiso } from "@/lib/permisos";
import type { Etapa, TipoSolicitud } from "@/lib/tramites/tipos";
import { zonaHoraria } from "@/lib/zona-horaria";
import { ENTIDAD_ACTIVIDAD } from "./avisos";
import { legible } from "./legible";

type Opciones = { sql?: Cliente; ahora?: Date };

/** Los estados finales de un trámite que valen como evidencia (§9.4). Los otros dos finales, «rechazado» y «cancelado», no. */
export const TERMINO_BIEN = ["publicado", "eliminado"] as const;

/** Los que terminaron mal: quedan enlazados como historia (§9.4) y no se enlazan (§9.3). */
const TERMINO_MAL = ["rechazado", "cancelado"];

/** Cuántos trámites ofrece a lo sumo el selector: la búsqueda afina el resto. */
export const TRAMITES_POR_PAGINA = 50;

export const terminoBien = (etapa: string) => (TERMINO_BIEN as readonly string[]).includes(etapa);

// ─────────────────────────────────────────────────────────────────────────────
// La actividad que admite un trámite (§9.2)
// ─────────────────────────────────────────────────────────────────────────────

type ActividadDelEnlace = {
  id: number;
  hallazgoId: number;
  codigo: string;
  ronda: number;
  clase: string;
  /** «A1.2». */
  etiqueta: string;
  descripcion: string;
  estado: EstadoActividad;
  hallazgoEstado: EstadoHallazgo;
  /** De un plan aprobado: `fin_original` no nula. */
  aprobada: boolean;
  /** No es una carga, o ya tiene su formato firmado (`cargaResuelta`). */
  entregada: boolean;
  /** El día en que se detectó el hallazgo (`yyyy-mm-dd`): un trámite anterior no puede ser su respuesta (§9.3). */
  detectadoEn: string;
  /** El código del documento que el hallazgo cita (al que se refiere o, si no, el que nombra como requisito), o nulo. */
  documentoCodigo: string | null;
};

/**
 * Si la actividad admite que se le pida o se le enlace un trámite (§9.2): de un plan aprobado, sin terminar ni cancelar, de un hallazgo
 * sin terminar y, si es una carga, con su formato firmado. La misma regla la usan el dominio y la página de la actividad.
 */
export function admiteTramite(a: { aprobada: boolean; estado: string; hallazgoEstado: string; entregada: boolean }): boolean {
  return (
    a.aprobada &&
    (ACTIVIDAD_ABIERTA as readonly string[]).includes(a.estado) &&
    !(TERMINALES as readonly string[]).includes(a.hallazgoEstado) &&
    a.entregada
  );
}

/**
 * La actividad con lo de su hallazgo que decide el enlace; nula si no existe. Con `bloquear`, antes de leerla toma el hallazgo
 * `FOR SHARE` (su id se lee sin candado: el hallazgo de una actividad no cambia nunca): todo acto del módulo que termina la actividad
 * o el hallazgo lo toma `FOR UPDATE`, así que espera a esta transacción, o esta lo ve ya terminado.
 */
async function actividadDelEnlace(sql: Cliente, actividadId: number, bloquear: boolean): Promise<ActividadDelEnlace | null> {
  if (!Number.isSafeInteger(actividadId) || actividadId <= 0) return null;
  if (bloquear) {
    const [d] = await sql`SELECT hallazgo_id FROM mejora_actividades WHERE id = ${actividadId}`;
    if (!d) return null;
    await sql`SELECT 1 FROM mejora_hallazgos WHERE id = ${d.hallazgo_id} FOR SHARE`;
  }
  const [f] = await sql`SELECT a.id, a.hallazgo_id, a.orden, a.descripcion, a.estado, a.fin_original IS NOT NULL AS aprobada,
      ac.orden AS accion_orden, h.codigo, h.ronda, h.clase, h.estado AS hallazgo_estado,
      to_char(h.detectado_en, 'YYYY-MM-DD') AS detectado_en, d.codigo AS documento_codigo, ${cargaResuelta(sql)} AS entregada
    FROM mejora_actividades a
    JOIN mejora_acciones ac ON ac.id = a.accion_id
    JOIN mejora_hallazgos h ON h.id = a.hallazgo_id
    LEFT JOIN documentos d ON d.id = coalesce(h.documento_id, h.requisito_documento_id)
    WHERE a.id = ${actividadId}`;
  if (!f) return null;
  return {
    id: Number(f.id),
    hallazgoId: Number(f.hallazgo_id),
    codigo: f.codigo as string,
    ronda: Number(f.ronda),
    clase: f.clase as string,
    etiqueta: `A${Number(f.accion_orden)}.${Number(f.orden)}`,
    descripcion: f.descripcion as string,
    estado: f.estado as EstadoActividad,
    hallazgoEstado: f.hallazgo_estado as EstadoHallazgo,
    aprobada: f.aprobada === true,
    entregada: f.entregada === true,
    detectadoEn: f.detectado_en as string,
    documentoCodigo: (f.documento_codigo as string | null) ?? null,
  };
}

/** La actividad, si la persona puede pedirle o enlazarle un trámite: la ve, tiene `tramites.solicitar` y la actividad lo admite. */
async function actividadQueAdmite(sql: Cliente, sesion: SesionFlujo, actividadId: number, bloquear: boolean): Promise<ActividadDelEnlace | null> {
  if (!puede(sesion, "tramites.solicitar")) return null;
  const a = await actividadDelEnlace(sql, actividadId, bloquear);
  if (!a || !admiteTramite(a)) return null;
  return (await puedeVerActividad(a.id, sesion, { sql })) ? a : null;
}

/**
 * La actividad oculta de una solicitud (`crearSolicitud`, §9.2), dentro de su transacción y antes de insertar nada: toma el hallazgo
 * `FOR SHARE` y comprueba que la persona puede pedirle un trámite. Para toda causa (no existe, no la ve, no admite el pedido) lanza
 * `ACTIVIDAD_NO_ADMITE`: la solicitud se rechaza entera y el trigger del hallazgo terminado nunca salta dentro de su transacción.
 */
export async function validarActividadParaTramite(tx: TransactionSql, sesion: SesionFlujo, actividadId: number): Promise<{ hallazgoId: number }> {
  const a = await actividadQueAdmite(tx, sesion, actividadId, true);
  if (!a) throw new ErrorMejora(ACTIVIDAD_NO_ADMITE);
  return { hallazgoId: a.hallazgoId };
}

// ─────────────────────────────────────────────────────────────────────────────
// Escribir y quitar el enlace
// ─────────────────────────────────────────────────────────────────────────────

/** El evento del hallazgo, por SQL (`dejarEvento` vive en `flujo.ts`, que este módulo no importa). */
async function dejarEventoDelEnlace(
  tx: TransactionSql,
  e: { hallazgoId: number; ronda: number; tipo: "tramite_enlazado" | "tramite_desenlazado"; detalle: Record<string, unknown>; usuarioId: number; ocurrioEn: Date },
): Promise<void> {
  await tx`INSERT INTO mejora_eventos (hallazgo_id, ronda, tipo, detalle, usuario_id, fuera, ocurrio_en)
    VALUES (${e.hallazgoId}, ${e.ronda}, ${e.tipo}, ${tx.json(e.detalle as never)}, ${e.usuarioId}, false, ${e.ocurrioEn})`;
}

/**
 * La bitácora del enlace (regla 5), por SQL con las columnas de `registrarAuditoria` (que vive en `admin.ts`, que este módulo no
 * importa): la actividad es la entidad; el código del hallazgo, la etiqueta, los ids y el número del trámite, nunca su justificación.
 */
async function auditarEnlace(
  tx: TransactionSql,
  e: { usuarioId: number; accion: "mejora_tramite_enlazado" | "mejora_tramite_desenlazado"; actividadId: number; detalle: Record<string, unknown> },
): Promise<void> {
  await tx`INSERT INTO auditoria (usuario_id, accion, entidad, entidad_id, detalle)
    VALUES (${e.usuarioId}, ${e.accion}, ${ENTIDAD_ACTIVIDAD}, ${e.actividadId}, ${tx.json(e.detalle as never)})`;
}

/** Inserta el enlace y deja su evento y su bitácora. Un `23505` (el trámite ya tiene actividad) sale tal cual: lo traduce quien llama. */
async function escribirEnlace(
  tx: TransactionSql,
  a: ActividadDelEnlace,
  d: { tramiteId: number; usuarioId: number; ahora: Date; origen: "pedido" | "enlazado" },
): Promise<void> {
  await tx`INSERT INTO mejora_actividad_tramites (hallazgo_id, actividad_id, tramite_id, origen, enlazado_por, enlazado_en)
    VALUES (${a.hallazgoId}, ${a.id}, ${d.tramiteId}, ${d.origen}, ${d.usuarioId}, ${d.ahora})`;
  const [t] = await tx`SELECT numero FROM tramites WHERE id = ${d.tramiteId}`;
  await dejarEventoDelEnlace(tx, {
    hallazgoId: a.hallazgoId,
    ronda: a.ronda,
    tipo: "tramite_enlazado",
    detalle: { actividadId: a.id, actividad: a.etiqueta, tramiteId: d.tramiteId, origen: d.origen },
    usuarioId: d.usuarioId,
    ocurrioEn: d.ahora,
  });
  await auditarEnlace(tx, {
    usuarioId: d.usuarioId,
    accion: "mejora_tramite_enlazado",
    actividadId: a.id,
    detalle: {
      codigo: a.codigo,
      hallazgoId: a.hallazgoId,
      ronda: a.ronda,
      actividad: a.etiqueta,
      actividadId: a.id,
      tramiteId: d.tramiteId,
      numero: (t?.numero as string | undefined) ?? null,
      origen: d.origen,
    },
  });
}

/**
 * El enlace de la solicitud pedida desde la actividad (`crearSolicitud`, §9.2), en su misma transacción y después del `INSERT` del
 * trámite, con la actividad ya validada (`validarActividadParaTramite`): origen `pedido`, su evento `tramite_enlazado` y su bitácora.
 */
export async function enlazarAlCrear(
  tx: TransactionSql,
  d: { actividadId: number; hallazgoId: number; tramiteId: number; usuarioId: number; ahora: Date },
): Promise<void> {
  const a = await actividadDelEnlace(tx, d.actividadId, false);
  if (!a || a.hallazgoId !== d.hallazgoId) throw new ErrorMejora(ACTIVIDAD_NO_ADMITE);
  await escribirEnlace(tx, a, { tramiteId: d.tramiteId, usuarioId: d.usuarioId, ahora: d.ahora, origen: "pedido" });
}

/**
 * Lo que un trámite cumple para enlazarse (§9.3), para el SQL sobre `tramites t`: no terminó mal, no está enlazado a ninguna actividad
 * y se solicitó desde el día en que se detectó el hallazgo (en la zona de la instalación; el mismo día cuenta). Una sola regla para el
 * selector y para `enlazarTramite`; que la persona lo vea lo decide `puedeVerTramite`.
 */
function sirveParaEnlazar(sql: Cliente, detectadoEn: string, zona: string) {
  return sql`(NOT (t.etapa = ANY(${TERMINO_MAL})) AND (t.creado_en AT TIME ZONE ${zona})::date >= ${detectadoEn}::date
    AND NOT EXISTS (SELECT 1 FROM mejora_actividad_tramites en_e WHERE en_e.tramite_id = t.id))`;
}

/**
 * Enlaza a una actividad un trámite que ya existe (§9.3), con origen `enlazado`. La actividad, con la regla de pedir
 * (`ACTIVIDAD_NO_ADMITE`); el trámite, que la persona lo vea y que sirva (`sirveParaEnlazar`): si no, `TRAMITE_NO_SIRVE`, el mismo
 * mensaje para toda causa, también cuando otra persona lo enlazó a la vez (la unicidad del trámite).
 */
export async function enlazarTramite(sesion: SesionFlujo, d: { actividadId: number; tramiteId: number }, opciones?: OpcionesFlujo): Promise<void> {
  requerirPermiso(sesion, "tramites.solicitar");
  const ahora = opciones?.ahora ?? new Date();
  await legible(
    enTransaccion(opciones?.sql ?? obtenerSql(), async (tx) => {
      const a = await actividadQueAdmite(tx, sesion, d.actividadId, true);
      if (!a) throw new ErrorMejora(ACTIVIDAD_NO_ADMITE);
      const visto = Number.isSafeInteger(d.tramiteId) && d.tramiteId > 0 ? await tramiteVisto(tx, d.tramiteId, sesion) : null;
      if (!visto?.visible) throw new ErrorMejora(TRAMITE_NO_SIRVE);
      const [sirve] = await tx`SELECT 1 FROM tramites t WHERE t.id = ${d.tramiteId} AND ${sirveParaEnlazar(tx, a.detectadoEn, zonaHoraria())}`;
      if (!sirve) throw new ErrorMejora(TRAMITE_NO_SIRVE);
      await escribirEnlace(tx, a, { tramiteId: d.tramiteId, usuarioId: sesion.usuarioId, ahora, origen: "enlazado" }).catch((err: { code?: unknown }) => {
        if (err?.code === "23505") throw new ErrorMejora(TRAMITE_NO_SIRVE);
        throw err;
      });
    }),
  );
}

/**
 * Si quien mira quita el enlace (§9.3): uno `enlazado`, quien lo puso o el Admin SGC, con `tramites.solicitar`, mientras la actividad
 * siga abierta y su hallazgo sin terminar. El de un trámite pedido desde la actividad no se quita nunca.
 */
function sePuedeQuitar(
  sesion: Pick<SesionFlujo, "usuarioId" | "rol" | "verHistorial">,
  e: { origen: string; enlazadoPor: number; actividadEstado: string; hallazgoEstado: string },
): boolean {
  return (
    puede(sesion, "tramites.solicitar") &&
    e.origen === "enlazado" &&
    (e.enlazadoPor === sesion.usuarioId || sesion.rol === "admin_sgc") &&
    (ACTIVIDAD_ABIERTA as readonly string[]).includes(e.actividadEstado) &&
    !(TERMINALES as readonly string[]).includes(e.hallazgoEstado)
  );
}

/**
 * Quita un enlace puesto después (§9.3), con su evento `tramite_desenlazado` (antes de borrar la fila: el historial lo conserva) y su
 * bitácora. Orden de candados del módulo: el hallazgo (`FOR SHARE`: no transiciona) y después el enlace `FOR UPDATE`. A quien no ve la
 * actividad, `ENLACE_NO_EXISTE`, lo mismo que ante un id que no existe; a quien la ve y no puede quitarlo, `ENLACE_NO_SE_QUITA`.
 */
export async function quitarEnlace(sesion: SesionFlujo, d: { enlaceId: number }, opciones?: OpcionesFlujo): Promise<void> {
  requerirPermiso(sesion, "tramites.solicitar");
  const ahora = opciones?.ahora ?? new Date();
  await legible(
    enTransaccion(opciones?.sql ?? obtenerSql(), async (tx) => {
      if (!Number.isSafeInteger(d.enlaceId) || d.enlaceId <= 0) throw new ErrorMejora(ENLACE_NO_EXISTE);
      const [x] = await tx`SELECT hallazgo_id, actividad_id FROM mejora_actividad_tramites WHERE id = ${d.enlaceId}`;
      if (!x) throw new ErrorMejora(ENLACE_NO_EXISTE);
      await tx`SELECT 1 FROM mejora_hallazgos WHERE id = ${x.hallazgo_id} FOR SHARE`;
      const [e] = await tx`SELECT id, tramite_id, origen, enlazado_por FROM mejora_actividad_tramites WHERE id = ${d.enlaceId} FOR UPDATE`;
      const a = e ? await actividadDelEnlace(tx, Number(x.actividad_id), false) : null;
      if (!e || !a || !(await puedeVerActividad(a.id, sesion, { sql: tx }))) throw new ErrorMejora(ENLACE_NO_EXISTE);
      const enlace = { origen: e.origen as string, enlazadoPor: Number(e.enlazado_por), actividadEstado: a.estado, hallazgoEstado: a.hallazgoEstado };
      if (!sePuedeQuitar(sesion, enlace)) throw new ErrorMejora(ENLACE_NO_SE_QUITA);
      const tramiteId = Number(e.tramite_id);
      const [t] = await tx`SELECT numero FROM tramites WHERE id = ${tramiteId}`;
      await dejarEventoDelEnlace(tx, {
        hallazgoId: a.hallazgoId,
        ronda: a.ronda,
        tipo: "tramite_desenlazado",
        detalle: { actividadId: a.id, actividad: a.etiqueta, tramiteId },
        usuarioId: sesion.usuarioId,
        ocurrioEn: ahora,
      });
      await auditarEnlace(tx, {
        usuarioId: sesion.usuarioId,
        accion: "mejora_tramite_desenlazado",
        actividadId: a.id,
        detalle: {
          codigo: a.codigo,
          hallazgoId: a.hallazgoId,
          ronda: a.ronda,
          actividad: a.etiqueta,
          actividadId: a.id,
          tramiteId,
          numero: (t?.numero as string | undefined) ?? null,
        },
      });
      await tx`DELETE FROM mejora_actividad_tramites WHERE id = ${d.enlaceId}`;
    }),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Lecturas
// ─────────────────────────────────────────────────────────────────────────────

export type TramiteEnlazado = {
  enlaceId: number;
  tramiteId: number;
  origen: "pedido" | "enlazado";
  etapa: string;
  /** Quedó «publicado» o «eliminado» (§9.4). */
  terminoBien: boolean;
  /** Cuándo llegó a un estado final, o nulo si sigue en curso. */
  terminoEn: Date | null;
  /** El código y el título del documento (o el título propuesto), solo a quien ve el trámite; nulo a los demás. */
  documento: string | null;
  tipo: string;
  /** Si quien mira ve el trámite (`puedeVerTramite`): solo entonces se nombra y se enlaza (§9.7). */
  visible: boolean;
  /** Si quien mira puede quitar el enlace (`sePuedeQuitar`). */
  seQuita: boolean;
};

/**
 * Los trámites de cada actividad, en el orden en que se enlazaron, como los ve `sesion` (§9.7): el trámite se nombra solo a quien lo
 * ve (`tramiteVisto`, la regla del trámite); su tipo y su estado, a quien ve la actividad. Quien llama ya decidió que la persona ve
 * esas actividades.
 */
export async function tramitesDeActividades(sql: Cliente, sesion: SesionFlujo, actividadIds: number[]): Promise<Map<number, TramiteEnlazado[]>> {
  const salida = new Map<number, TramiteEnlazado[]>();
  const ids = actividadIds.filter((id) => Number.isSafeInteger(id) && id > 0);
  if (ids.length === 0) return salida;
  const filas = await sql`SELECT e.id, e.actividad_id, e.tramite_id, e.origen, e.enlazado_por, t.etapa, t.tipo, t.cerrado_en,
      a.estado AS actividad_estado, h.estado AS hallazgo_estado
    FROM mejora_actividad_tramites e
    JOIN tramites t ON t.id = e.tramite_id
    JOIN mejora_actividades a ON a.id = e.actividad_id
    JOIN mejora_hallazgos h ON h.id = e.hallazgo_id
    WHERE e.actividad_id = ANY(${ids})
    ORDER BY e.enlazado_en, e.id`;
  for (const f of filas) {
    const visto = await tramiteVisto(sql, Number(f.tramite_id), sesion);
    const visible = visto?.visible === true;
    const etapa = f.etapa as Etapa;
    const final = terminoBien(etapa) || TERMINO_MAL.includes(etapa);
    const fila: TramiteEnlazado = {
      enlaceId: Number(f.id),
      tramiteId: Number(f.tramite_id),
      origen: f.origen as "pedido" | "enlazado",
      etapa,
      terminoBien: terminoBien(etapa),
      terminoEn: final ? ((f.cerrado_en as Date | null) ?? null) : null,
      documento: visible && visto ? [visto.codigo, visto.titulo].filter(Boolean).join(" ") || null : null,
      tipo: f.tipo as TipoSolicitud,
      visible,
      seQuita: sePuedeQuitar(sesion, {
        origen: f.origen as string,
        enlazadoPor: Number(f.enlazado_por),
        actividadEstado: f.actividad_estado as string,
        hallazgoEstado: f.hallazgo_estado as string,
      }),
    };
    const actividadId = Number(f.actividad_id);
    salida.set(actividadId, [...(salida.get(actividadId) ?? []), fila]);
  }
  return salida;
}

/**
 * Cuántos trámites enlazados a la actividad terminaron bien (§9.4); con `despuesDe` (la devolución de la verificación), solo los que
 * terminaron después (decisión 22 de la 15A). La regla de `terminarActividad` y de lo que la página dice que falta.
 */
export async function tramitesQueValen(sql: Cliente, actividadId: number, despuesDe: Date | null): Promise<number> {
  const [f] = await sql`SELECT count(*)::int AS n FROM mejora_actividad_tramites e JOIN tramites t ON t.id = e.tramite_id
    WHERE e.actividad_id = ${actividadId} AND t.etapa = ANY(${[...TERMINO_BIEN]})
      ${despuesDe ? sql`AND t.cerrado_en > ${despuesDe}` : sql``}`;
  return Number(f.n);
}

/**
 * Los trámites que terminaron bien, enlazados a actividades de la ronda `ronda` del hallazgo (§9.6): los de otra ronda no cuentan. Lo
 * que comprueba el cierre y lo que guarda su evento: el id del trámite y el código de su documento.
 */
export async function tramitesQueTerminaronBien(sql: Cliente, hallazgoId: number, ronda: number): Promise<Array<{ tramiteId: number; documento: string | null }>> {
  const filas = await sql`SELECT e.tramite_id, d.codigo
    FROM mejora_actividad_tramites e
    JOIN mejora_actividades a ON a.id = e.actividad_id
    JOIN mejora_acciones ac ON ac.id = a.accion_id
    JOIN mejora_rondas r ON r.id = ac.ronda_id
    JOIN tramites t ON t.id = e.tramite_id
    LEFT JOIN documentos d ON d.id = t.documento_id
    WHERE e.hallazgo_id = ${hallazgoId} AND r.numero = ${ronda} AND t.etapa = ANY(${[...TERMINO_BIEN]})
    ORDER BY t.cerrado_en, e.id`;
  return filas.map((f) => ({ tramiteId: Number(f.tramite_id), documento: (f.codigo as string | null) ?? null }));
}

/**
 * Con qué llega `/tramites/nueva?actividad=…` (§9.2): el documento que el hallazgo cita (si cita alguno), el motivo por su clase («No
 * conformidad» o «Mejora») y la descripción de la actividad como justificación; nunca el título ni la descripción del hallazgo. Nulo
 * para quien no puede pedirle un trámite (no la ve, no tiene `tramites.solicitar` o la actividad no lo admite): la página lo ignora sin
 * decir por qué.
 */
export async function datosParaPedir(
  sesion: SesionFlujo,
  actividadId: number,
  opciones?: Opciones,
): Promise<{ actividadId: number; documentoCodigo: string | null; motivo: "no_conformidad" | "mejora"; justificacion: string } | null> {
  const a = await actividadQueAdmite(opciones?.sql ?? obtenerSql(), sesion, actividadId, false);
  if (!a) return null;
  return {
    actividadId: a.id,
    documentoCodigo: a.documentoCodigo,
    motivo: a.clase === "no_conformidad" ? "no_conformidad" : "mejora",
    justificacion: a.descripcion,
  };
}

/** Sin mayúsculas ni tildes, para comparar lo que se busca. */
const normalizar = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/**
 * El selector de «Enlazar un trámite que ya existe» (§9.3): los trámites que la persona ve (`listarTramites`, la regla del trámite),
 * en curso o que terminaron bien, que sirven (`sirveParaEnlazar`) y, con `q`, cuyo número, código o título lo contienen (sin
 * mayúsculas ni tildes); los más recientes primero, hasta `TRAMITES_POR_PAGINA`. Vacío para quien no puede enlazarle un trámite.
 */
export async function candidatosParaEnlazar(
  sesion: SesionFlujo,
  actividadId: number,
  q: string | undefined,
  opciones?: Opciones,
): Promise<Array<{ id: number; numero: string; documento: string; tipo: string; etapa: string; solicitadoEn: Date }>> {
  const sql = opciones?.sql ?? obtenerSql();
  const a = await actividadQueAdmite(sql, sesion, actividadId, false);
  if (!a) return [];
  const enCurso = await listarTramites(sesion, "en_curso", { sql });
  const cerrados = (await listarTramites(sesion, "cerrados", { sql })).filter((t) => terminoBien(t.etapa));
  const buscado = q ? normalizar(q) : "";
  const vistos = [...enCurso, ...cerrados].filter((t) => !buscado || normalizar(`${t.numero} ${t.codigo ?? ""} ${t.titulo}`).includes(buscado));
  if (vistos.length === 0) return [];
  const filas = await sql`SELECT t.id, t.creado_en FROM tramites t
    WHERE t.id = ANY(${vistos.map((t) => t.id)}) AND ${sirveParaEnlazar(sql, a.detectadoEn, zonaHoraria())}`;
  const solicitado = new Map(filas.map((f) => [Number(f.id), f.creado_en as Date]));
  return vistos
    .filter((t) => solicitado.has(t.id))
    .map((t) => ({
      id: t.id,
      numero: t.numero,
      documento: [t.codigo, t.titulo].filter(Boolean).join(" "),
      tipo: t.tipo,
      etapa: t.etapa,
      solicitadoEn: solicitado.get(t.id)!,
    }))
    .sort((x, y) => y.solicitadoEn.getTime() - x.solicitadoEn.getTime() || y.id - x.id)
    .slice(0, TRAMITES_POR_PAGINA);
}

/**
 * La actividad que atiende el trámite (§9.7), para la línea «Atiende una actividad de mejoramiento» de su página: solo a quien ve esa
 * actividad (`puedeVerActividad`); nulo a los demás y si el trámite no tiene ninguna.
 */
export async function actividadDelTramite(sesion: SesionFlujo, tramiteId: number, opciones?: Opciones): Promise<{ actividadId: number } | null> {
  if (!Number.isSafeInteger(tramiteId) || tramiteId <= 0) return null;
  const sql = opciones?.sql ?? obtenerSql();
  const [e] = await sql`SELECT actividad_id FROM mejora_actividad_tramites WHERE tramite_id = ${tramiteId}`;
  if (!e) return null;
  const actividadId = Number(e.actividad_id);
  return (await puedeVerActividad(actividadId, sesion, { sql })) ? { actividadId } : null;
}
