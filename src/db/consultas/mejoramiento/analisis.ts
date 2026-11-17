/**
 * El análisis de causa raíz de la ronda en curso (spec 15 §9, Tarea 11): los análisis de cada método, la lista de causas
 * raíz y las dos preguntas de cierre. Solo se escribe con el hallazgo «Por formular» y el plan de la ronda en borrador, por
 * quien actúa por el proceso (`actuaPorElProceso`). Guardar no cambia el estado del hallazgo: deja un evento sin el
 * contenido (el contenido es de la ronda, y la ronda lo congela al enviar el plan).
 *
 * Orden de candados del módulo: el hallazgo `FOR UPDATE` primero (`bloquearHallazgo`) y sus hijas después.
 */
import type { TransactionSql } from "postgres";
import type { z } from "zod";
import { obtenerSql, type Cliente } from "@/db/cliente";
import { enTransaccion, type OpcionesFlujo, type SesionFlujo } from "@/db/consultas/flujo/contrato";
import { puedeVerHallazgo } from "@/lib/alcance";
import { EsquemaCausas, EsquemaPreguntasDeCierre, EsquemaQuitarAnalisis } from "@/lib/esquemas/mejoramiento";
import { leerContenido } from "@/lib/mejoramiento/analisis";
import { ErrorMejora, METODOS_ANALISIS, type HallazgoBase, type MetodoAnalisis } from "@/lib/mejoramiento/tipos";
import { YA_CAMBIO } from "@/lib/mejoramiento/transiciones";
import { ErrorPermiso, puede, requerirPermiso } from "@/lib/permisos";
import { actuaPorElProceso } from "./avisos";
import { bloquearHallazgo, dejarEvento, legible, NO_EXISTE } from "./flujo";

type Persona = Pick<SesionFlujo, "usuarioId" | "rol" | "verHistorial">;

export const CAUSA_CON_ACCIONES = "Esa causa tiene acciones: quítelas antes";

function leer<T extends z.ZodType>(esquema: T, d: unknown): z.output<T> {
  const leido = esquema.safeParse(d);
  if (!leido.success) throw new ErrorMejora(leido.error.issues[0].message);
  return leido.data;
}

/** Quien formula: tiene `mejora.formular` y actúa por el proceso (un líder de él o, sin líder activo, el Admin SGC). */
export async function puedeFormular(tx: Cliente, sesion: Persona, h: Pick<HallazgoBase, "procesoId">): Promise<boolean> {
  return puede(sesion, "mejora.formular") && (await actuaPorElProceso(tx, sesion, h.procesoId));
}

/**
 * El hallazgo bloqueado, listo para escribir su análisis: quien no lo ve, no existe; quien lo ve y no formula,
 * `ErrorPermiso`; en otro estado que «Por formular», o con el plan ya enviado, `YA_CAMBIO`. Devuelve la ronda en curso.
 */
export async function exigirBorrador(
  tx: TransactionSql,
  sesion: Persona,
  hallazgoId: number,
): Promise<{ h: HallazgoBase; rondaId: number }> {
  const h = await bloquearHallazgo(tx, hallazgoId);
  if (!(await puedeFormular(tx, sesion, h))) {
    throw (await puedeVerHallazgo(h.id, sesion, { sql: tx })) ? new ErrorPermiso() : new ErrorMejora(NO_EXISTE);
  }
  if (h.estado !== "por_formular") throw new ErrorMejora(YA_CAMBIO);
  const [r] = await tx`SELECT id, estado_plan FROM mejora_rondas WHERE hallazgo_id = ${h.id} AND numero = ${h.ronda} FOR UPDATE`;
  if (!r || r.estado_plan !== "borrador") throw new ErrorMejora(YA_CAMBIO);
  return { h, rondaId: Number(r.id) };
}

function enBorrador<T>(
  sesion: SesionFlujo,
  hallazgoId: number,
  opciones: OpcionesFlujo | undefined,
  fn: (tx: TransactionSql, h: HallazgoBase, rondaId: number, ahora: Date) => Promise<T>,
): Promise<T> {
  requerirPermiso(sesion, "mejora.formular");
  const ahora = opciones?.ahora ?? new Date();
  return legible(
    enTransaccion(opciones?.sql ?? obtenerSql(), async (tx) => {
      const { h, rondaId } = await exigirBorrador(tx, sesion, hallazgoId);
      return fn(tx, h, rondaId, ahora);
    }),
  );
}

/**
 * Guarda un análisis de la ronda (uno nuevo, o `analisisId` para reemplazar uno de ella). El contenido se valida y se
 * normaliza con el esquema de su método antes de abrir la transacción.
 */
export async function guardarAnalisis(
  sesion: SesionFlujo,
  d: {
    hallazgoId: number;
    analisisId?: number | null;
    metodo: MetodoAnalisis;
    equipo?: string | null;
    observaciones?: string | null;
    contenido: unknown;
  },
  opciones?: OpcionesFlujo,
): Promise<{ id: number }> {
  requerirPermiso(sesion, "mejora.formular");
  if (!(METODOS_ANALISIS as readonly string[]).includes(d.metodo)) throw new ErrorMejora("Elija el método del análisis");
  const contenido = leerContenido(d.metodo, d.contenido);
  const equipo = d.equipo?.trim() || null;
  const observaciones = d.observaciones?.trim() || null;
  return enBorrador(sesion, d.hallazgoId, opciones, async (tx, h, rondaId, ahora) => {
    let id: number;
    if (d.analisisId) {
      const [a] = await tx`SELECT id FROM mejora_analisis WHERE id = ${d.analisisId} AND hallazgo_id = ${h.id} AND ronda_id = ${rondaId} FOR UPDATE`;
      if (!a) throw new ErrorMejora("El análisis no existe en esta ronda");
      await tx`UPDATE mejora_analisis SET metodo = ${d.metodo}, equipo = ${equipo}, observaciones = ${observaciones},
          contenido = ${tx.json(contenido as never)}
        WHERE id = ${a.id}`;
      id = Number(a.id);
    } else {
      const [o] = await tx`SELECT coalesce(max(orden), 0) + 1 AS orden FROM mejora_analisis WHERE ronda_id = ${rondaId}`;
      const [nuevo] = await tx`INSERT INTO mejora_analisis (hallazgo_id, ronda_id, orden, metodo, equipo, observaciones, contenido)
        VALUES (${h.id}, ${rondaId}, ${Number(o.orden)}, ${d.metodo}, ${equipo}, ${observaciones}, ${tx.json(contenido as never)})
        RETURNING id`;
      id = Number(nuevo.id);
    }
    await dejarEvento(tx, {
      hallazgoId: h.id,
      ronda: h.ronda,
      tipo: "analisis_guardado",
      detalle: { metodo: d.metodo, analisisId: id },
      usuarioId: sesion.usuarioId,
      ocurrioEn: ahora,
    });
    return { id };
  });
}

/** Quita un análisis de la ronda en curso (todavía borrador): el contenido no se conserva, el evento sí. */
export async function quitarAnalisis(
  sesion: SesionFlujo,
  d: { hallazgoId: number; analisisId: number },
  opciones?: OpcionesFlujo,
): Promise<void> {
  const v = leer(EsquemaQuitarAnalisis, d);
  await enBorrador(sesion, v.hallazgoId, opciones, async (tx, h, rondaId, ahora) => {
    const [a] = await tx`SELECT id, metodo FROM mejora_analisis WHERE id = ${v.analisisId} AND hallazgo_id = ${h.id} AND ronda_id = ${rondaId} FOR UPDATE`;
    if (!a) throw new ErrorMejora("El análisis no existe en esta ronda");
    await tx`DELETE FROM mejora_analisis WHERE id = ${a.id}`;
    await dejarEvento(tx, {
      hallazgoId: h.id,
      ronda: h.ronda,
      tipo: "analisis_quitado",
      detalle: { metodo: a.metodo, analisisId: Number(a.id) },
      usuarioId: sesion.usuarioId,
      ocurrioEn: ahora,
    });
  });
}

/**
 * Reemplaza la lista de causas raíz de la ronda, conservando los `id` que llegan (las acciones ya enlazadas no pierden su
 * causa). Quitar una causa que una acción ataca se rechaza.
 */
export async function guardarCausas(
  sesion: SesionFlujo,
  d: { hallazgoId: number; causas: Array<{ id?: number | null; texto: string; sinAccionPorque?: string | null }> },
  opciones?: OpcionesFlujo,
): Promise<void> {
  const v = leer(EsquemaCausas, d);
  await enBorrador(sesion, v.hallazgoId, opciones, async (tx, h, rondaId, ahora) => {
    const actuales = await tx`SELECT id FROM mejora_causas WHERE ronda_id = ${rondaId} ORDER BY id FOR UPDATE`;
    const deLaRonda = new Set(actuales.map((f) => Number(f.id)));
    const quedan = new Set<number>();
    for (const x of v.causas) {
      if (x.id === null || x.id === undefined) continue;
      if (!deLaRonda.has(x.id)) throw new ErrorMejora("Una de las causas ya no existe: vuelva a cargar la página");
      quedan.add(x.id);
    }
    const quitadas = [...deLaRonda].filter((id) => !quedan.has(id));
    if (quitadas.length > 0) {
      const [usada] = await tx`SELECT 1 FROM mejora_accion_causas WHERE causa_id = ANY(${quitadas})`;
      if (usada) throw new ErrorMejora(CAUSA_CON_ACCIONES);
      await tx`DELETE FROM mejora_causas WHERE id = ANY(${quitadas})`;
    }
    let orden = 0;
    for (const x of v.causas) {
      orden += 1;
      if (x.id === null || x.id === undefined) {
        await tx`INSERT INTO mejora_causas (hallazgo_id, ronda_id, orden, texto, sin_accion_porque)
          VALUES (${h.id}, ${rondaId}, ${orden}, ${x.texto}, ${x.sinAccionPorque})`;
      } else {
        await tx`UPDATE mejora_causas SET orden = ${orden}, texto = ${x.texto}, sin_accion_porque = ${x.sinAccionPorque} WHERE id = ${x.id}`;
      }
    }
    await dejarEvento(tx, {
      hallazgoId: h.id,
      ronda: h.ronda,
      tipo: "causas_guardadas",
      detalle: { causas: v.causas.length },
      usuarioId: sesion.usuarioId,
      ocurrioEn: ahora,
    });
  });
}

/** Las dos preguntas de cierre de la ronda (spec §9.3). */
export async function responderPreguntas(
  sesion: SesionFlujo,
  d: {
    hallazgoId: number;
    similares: boolean;
    similaresDetalle?: string | null;
    cambios: { documentos: boolean; riesgos: boolean; controles: boolean; descripcion?: string | null };
  },
  opciones?: OpcionesFlujo,
): Promise<void> {
  const v = leer(EsquemaPreguntasDeCierre, d);
  await enBorrador(sesion, v.hallazgoId, opciones, async (tx, h, rondaId, ahora) => {
    await tx`UPDATE mejora_rondas SET similares = ${v.similares}, similares_detalle = ${v.similaresDetalle},
        cambios = ${tx.json(v.cambios as never)}
      WHERE id = ${rondaId}`;
    await dejarEvento(tx, {
      hallazgoId: h.id,
      ronda: h.ronda,
      tipo: "preguntas_respondidas",
      detalle: {},
      usuarioId: sesion.usuarioId,
      ocurrioEn: ahora,
    });
  });
}

/**
 * Lo que el formulario muestra de un reincidente sin pedirlo (spec §9.4): las causas y las acciones de la última ronda del
 * hallazgo anterior. `null` si el hallazgo no es reincidente. Quien llama decide si la persona ve el hallazgo anterior.
 */
export async function laVezPasada(
  sql: Cliente,
  hallazgoId: number,
): Promise<{ codigo: string; causas: string[]; acciones: string[] } | null> {
  const [h] = await sql`SELECT a.id, a.codigo FROM mejora_hallazgos h JOIN mejora_hallazgos a ON a.id = h.reincidente_de WHERE h.id = ${hallazgoId}`;
  if (!h) return null;
  const [r] = await sql`SELECT id FROM mejora_rondas WHERE hallazgo_id = ${h.id} ORDER BY numero DESC LIMIT 1`;
  if (!r) return { codigo: h.codigo as string, causas: [], acciones: [] };
  const [causas, acciones] = await Promise.all([
    sql`SELECT texto FROM mejora_causas WHERE ronda_id = ${r.id} ORDER BY orden, id`,
    sql`SELECT descripcion FROM mejora_acciones WHERE ronda_id = ${r.id} ORDER BY orden, id`,
  ]);
  return { codigo: h.codigo as string, causas: causas.map((f) => f.texto as string), acciones: acciones.map((f) => f.descripcion as string) };
}
