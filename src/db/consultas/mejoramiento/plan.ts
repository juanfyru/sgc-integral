/**
 * El plan de acción de la ronda en curso, en borrador (spec 15 §8.6, §10 y §11.2; Tarea 12): las acciones con sus
 * actividades, el criterio de eficacia y lo que le falta al plan para enviarse (`examinarPlan`, que usa el envío de la
 * Tarea 13 dentro de su transacción). Solo se escribe con el hallazgo «Por formular» y el plan en borrador, por quien
 * formula (`enBorrador` y `exigirBorrador`, de `analisis.ts`). Guardar no cambia el estado: deja su evento y su bitácora,
 * con la etiqueta de la acción y las cantidades, nunca el texto.
 *
 * Las etiquetas salen del orden: las acciones son «A1», «A2»… en la ronda; las actividades, «A1.1», «A1.2»…; las causas,
 * «La causa 2». Quitar una acción numera otra vez las que quedan.
 *
 * Orden de candados: el hallazgo `FOR UPDATE` y la ronda `FOR UPDATE` (`exigirBorrador`); después, las acciones y sus hijas.
 */
import type { Cliente } from "@/db/cliente";
import type { OpcionesFlujo, SesionFlujo } from "@/db/consultas/flujo/contrato";
import { filtroIndicadores } from "@/lib/alcance";
import { EsquemaAccion, EsquemaCriterio, EsquemaQuitarAccion } from "@/lib/esquemas/mejoramiento";
import { analisisCompleto, leerCambios } from "@/lib/mejoramiento/analisis";
import { fechaMinimaDeEficacia, leerCriterios } from "@/lib/mejoramiento/eficacia";
import { huellaDePlan, type AccionFirmada, type PlanFirmado } from "@/lib/mejoramiento/huellas";
import { ErrorMejora, type Clase, type Criticidad, type Origen, type TipoAccion } from "@/lib/mejoramiento/tipos";
import { requerirPermiso } from "@/lib/permisos";
import { fechaEnZona } from "@/lib/tramites/plazos";
import { auditar, enBorrador, leer } from "./analisis";
import type { ContextoMejora } from "./config";
import { dejarEvento, NO_EXISTE } from "./flujo";
import { indicadorDeEficacia } from "./indicador-de-eficacia";

export const ACCION_AJENA = "La acción no existe en esta ronda";
export const ACTIVIDAD_AJENA = "Una de las actividades ya no existe: vuelva a cargar la página";
export const CAUSA_AJENA = "Esa causa no es de este hallazgo";
export const RESPONSABLE_INACTIVO = "El responsable debe ser un usuario activo";
export const INDICADOR_NO_ELEGIBLE = "Ese indicador no se puede enlazar: elija uno activo que usted pueda ver";

/** «A1»: la etiqueta de una acción por su orden en la ronda. */
export const etiquetaDeAccion = (orden: number) => `A${orden}`;
/** «A1.2»: la de una actividad, por el orden de su acción y el suyo. */
export const etiquetaDeActividad = (ordenAccion: number, orden: number) => `A${ordenAccion}.${orden}`;

/**
 * Guarda una acción de la ronda en curso con sus actividades: una nueva, o `accionId` para reemplazar una de la ronda. Las
 * actividades que llegan con `id` se conservan (y se actualizan); las que no llegan se quitan; las demás se crean. La fecha
 * de fin original queda nula: la fija la aprobación del plan.
 */
export async function guardarAccion(
  sesion: SesionFlujo,
  d: {
    hallazgoId: number;
    accionId?: number | null;
    tipo: TipoAccion;
    descripcion: string;
    causaIds: number[];
    recursos?: string | null;
    indicadorCumplimiento?: string | null;
    meta?: string | null;
    actividades: Array<{ id?: number | null; descripcion: string; responsableId: number; inicio: string; fin: string }>;
  },
  opciones?: OpcionesFlujo,
): Promise<{ id: number }> {
  requerirPermiso(sesion, "mejora.formular");
  const v = leer(EsquemaAccion, d);
  return enBorrador(sesion, v.hallazgoId, opciones, async (tx, h, rondaId, ahora) => {
    let accion: { id: number; orden: number } | null = null;
    if (v.accionId) {
      const [a] = await tx`SELECT id, orden FROM mejora_acciones
        WHERE id = ${v.accionId} AND hallazgo_id = ${h.id} AND ronda_id = ${rondaId} FOR UPDATE`;
      if (!a) throw new ErrorMejora(ACCION_AJENA);
      accion = { id: Number(a.id), orden: Number(a.orden) };
    }
    if (v.causaIds.length > 0) {
      const causas = await tx`SELECT id FROM mejora_causas WHERE ronda_id = ${rondaId} AND hallazgo_id = ${h.id} AND id = ANY(${v.causaIds})`;
      if (causas.length !== v.causaIds.length) throw new ErrorMejora(CAUSA_AJENA);
    }
    const responsables = [...new Set(v.actividades.map((a) => a.responsableId))];
    const activos = await tx`SELECT id FROM usuarios WHERE activo AND id = ANY(${responsables})`;
    if (activos.length !== responsables.length) throw new ErrorMejora(RESPONSABLE_INACTIVO);
    const existentes = accion ? await tx`SELECT id FROM mejora_actividades WHERE accion_id = ${accion.id} ORDER BY id FOR UPDATE` : [];
    const suyas = new Set(existentes.map((f) => Number(f.id)));
    if (v.actividades.some((a) => a.id && !suyas.has(a.id))) throw new ErrorMejora(ACTIVIDAD_AJENA);

    if (accion) {
      await tx`UPDATE mejora_acciones SET tipo = ${v.tipo}, descripcion = ${v.descripcion}, recursos = ${v.recursos},
          indicador_cumplimiento = ${v.indicadorCumplimiento}, meta = ${v.meta}
        WHERE id = ${accion.id}`;
    } else {
      const [o] = await tx`SELECT coalesce(max(orden), 0) + 1 AS orden FROM mejora_acciones WHERE ronda_id = ${rondaId}`;
      const [nueva] = await tx`INSERT INTO mejora_acciones (hallazgo_id, ronda_id, orden, tipo, descripcion, recursos, indicador_cumplimiento, meta)
        VALUES (${h.id}, ${rondaId}, ${Number(o.orden)}, ${v.tipo}, ${v.descripcion}, ${v.recursos}, ${v.indicadorCumplimiento}, ${v.meta})
        RETURNING id, orden`;
      accion = { id: Number(nueva.id), orden: Number(nueva.orden) };
    }

    const accionId = accion.id;
    await tx`DELETE FROM mejora_accion_causas WHERE accion_id = ${accionId}`;
    if (v.causaIds.length > 0) {
      await tx`INSERT INTO mejora_accion_causas ${tx(v.causaIds.map((causaId) => ({ hallazgo_id: h.id, accion_id: accionId, causa_id: causaId })))}`;
    }

    const quedan = new Set(v.actividades.flatMap((a) => (a.id ? [a.id] : [])));
    const quitadas = [...suyas].filter((id) => !quedan.has(id));
    if (quitadas.length > 0) await tx`DELETE FROM mejora_actividades WHERE id = ANY(${quitadas})`;
    let orden = 0;
    for (const a of v.actividades) {
      orden += 1;
      if (a.id) {
        await tx`UPDATE mejora_actividades SET orden = ${orden}, descripcion = ${a.descripcion}, responsable_id = ${a.responsableId},
            inicio = ${a.inicio}, fin = ${a.fin}
          WHERE id = ${a.id}`;
      } else {
        await tx`INSERT INTO mejora_actividades (hallazgo_id, accion_id, orden, descripcion, responsable_id, inicio, fin)
          VALUES (${h.id}, ${accionId}, ${orden}, ${a.descripcion}, ${a.responsableId}, ${a.inicio}, ${a.fin})`;
      }
    }

    const detalle = { accion: etiquetaDeAccion(accion.orden), accionId, actividades: v.actividades.length };
    await dejarEvento(tx, { hallazgoId: h.id, ronda: h.ronda, tipo: "accion_guardada", detalle, usuarioId: sesion.usuarioId, ocurrioEn: ahora });
    await auditar(tx, sesion, h, "mejora_accion_guardada", detalle);
    return { id: accionId };
  });
}

/** Quita una acción de la ronda en curso con sus actividades y sus causas, y numera otra vez las que quedan. */
export async function quitarAccion(sesion: SesionFlujo, d: { hallazgoId: number; accionId: number }, opciones?: OpcionesFlujo): Promise<void> {
  requerirPermiso(sesion, "mejora.formular");
  const v = leer(EsquemaQuitarAccion, d);
  await enBorrador(sesion, v.hallazgoId, opciones, async (tx, h, rondaId, ahora) => {
    const [a] = await tx`SELECT id, orden FROM mejora_acciones
      WHERE id = ${v.accionId} AND hallazgo_id = ${h.id} AND ronda_id = ${rondaId} FOR UPDATE`;
    if (!a) throw new ErrorMejora(ACCION_AJENA);
    // Las llaves foráneas son `RESTRICT`: primero lo que cuelga de la acción.
    await tx`DELETE FROM mejora_accion_causas WHERE accion_id = ${a.id}`;
    const actividades = await tx`DELETE FROM mejora_actividades WHERE accion_id = ${a.id} RETURNING id`;
    await tx`DELETE FROM mejora_acciones WHERE id = ${a.id}`;
    await tx`UPDATE mejora_acciones m SET orden = n.nuevo
      FROM (SELECT id, row_number() OVER (ORDER BY orden, id) AS nuevo FROM mejora_acciones WHERE ronda_id = ${rondaId}) n
      WHERE m.id = n.id AND m.orden <> n.nuevo`;
    const detalle = { accion: etiquetaDeAccion(Number(a.orden)), accionId: Number(a.id), actividades: actividades.length };
    await dejarEvento(tx, { hallazgoId: h.id, ronda: h.ronda, tipo: "accion_quitada", detalle, usuarioId: sesion.usuarioId, ocurrioEn: ahora });
    await auditar(tx, sesion, h, "mejora_accion_quitada", detalle);
  });
}

/**
 * El criterio de eficacia de la ronda (spec §11.2): uno o más criterios; con «mejora del indicador», el indicador enlazado,
 * que debe poder elegirse ahora (activo, con ficha vigente y que quien formula ve: un mismo mensaje si no existe o si no lo
 * ve); con «otro», su descripción; en la observación y la oportunidad, la fecha de evaluación (en la no conformidad se
 * descarta). Que esté completo lo mira `examinarPlan`.
 */
export async function guardarCriterio(
  sesion: SesionFlujo,
  d: { hallazgoId: number; criterios: string[]; criterioOtro?: string | null; indicadorEficaciaId?: number | null; fechaEvaluacion?: string | null },
  opciones?: OpcionesFlujo,
): Promise<void> {
  requerirPermiso(sesion, "mejora.formular");
  const v = leer(EsquemaCriterio, d);
  await enBorrador(sesion, v.hallazgoId, opciones, async (tx, h, rondaId, ahora) => {
    if (v.indicadorEficaciaId !== null) {
      const [elegible] = await tx`SELECT 1 FROM indicadores i
        WHERE i.id = ${v.indicadorEficaciaId} AND i.estado = 'activo'
          AND EXISTS (SELECT 1 FROM indicador_versiones iv WHERE iv.indicador_id = i.id AND iv.estado = 'aprobada')
          AND ${filtroIndicadores(tx, sesion)}`;
      if (!elegible) throw new ErrorMejora(INDICADOR_NO_ELEGIBLE);
    }
    const fechaEvaluacion = h.clase === "no_conformidad" ? null : v.fechaEvaluacion;
    await tx`UPDATE mejora_rondas SET criterios = ${tx.json(v.criterios as never)}, criterio_otro = ${v.criterioOtro},
        indicador_eficacia_id = ${v.indicadorEficaciaId}, fecha_evaluacion = ${fechaEvaluacion}
      WHERE id = ${rondaId}`;
    const detalle = { criterios: v.criterios, conIndicador: v.indicadorEficaciaId !== null };
    await dejarEvento(tx, { hallazgoId: h.id, ronda: h.ronda, tipo: "criterio_guardado", detalle, usuarioId: sesion.usuarioId, ocurrioEn: ahora });
    await auditar(tx, sesion, h, "mejora_criterio_guardado", detalle);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Lo que le falta al plan (spec §8.6)
// ─────────────────────────────────────────────────────────────────────────────

export type ExamenDelPlan = {
  /** Lo que impide enviar el plan, en frases para la persona; vacío si se puede enviar. */
  faltas: string[];
  plan: PlanFirmado;
  huella: string;
  /** El día desde el que la eficacia se podría evaluar con las fechas planeadas; `null` sin actividades. */
  evaluableDesde: string | null;
};

const texto = (v: unknown): string | null => (typeof v === "string" ? v : null);

/**
 * Lee el plan de la ronda en curso, sin candados, con el `Cliente` que recibe (el envío lo llama dentro de su transacción,
 * con el hallazgo ya bloqueado), y dice lo que le falta para enviarse (spec §8.6), lo que se firmaría (`plan`, con su
 * huella) y desde cuándo se podría evaluar la eficacia con las fechas planeadas (§11.3). Las faltas se juzgan con la clase
 * que el hallazgo tiene ahora; «hoy» es el día de `c.ahora` en la zona.
 */
export async function examinarPlan(sql: Cliente, hallazgoId: number, c: ContextoMejora): Promise<ExamenDelPlan> {
  const [f] = await sql`SELECT h.codigo, h.clase, h.criticidad, h.origen, h.fuente, h.referencia_caso, h.titulo, h.descripcion,
      h.requisito_clausula, h.riesgo, h.ronda, h.correccion_requerida, h.correccion_descripcion,
      coalesce(uc.nombre, h.correccion_responsable_nombre) AS correccion_responsable,
      to_char(h.detectado_en, 'YYYY-MM-DD') AS detectado, to_char(h.fecha_limite_ente, 'YYYY-MM-DD') AS limite_ente,
      to_char(h.correccion_implementada_en, 'YYYY-MM-DD') AS implementada,
      p.nombre AS proceso, s.nombre AS subproceso,
      CASE WHEN n.id IS NOT NULL THEN concat_ws(' ', tn.nombre, n.numero, 'de', n.anio::text) END AS norma,
      CASE WHEN d.id IS NOT NULL THEN concat_ws(' ', d.codigo, d.titulo) END AS documento,
      r.codigo AS reincidente
    FROM mejora_hallazgos h
    JOIN procesos p ON p.id = h.proceso_id
    LEFT JOIN subprocesos s ON s.id = h.subproceso_id
    LEFT JOIN normas n ON n.id = h.requisito_norma_id
    LEFT JOIN tipos_norma tn ON tn.id = n.tipo_norma_id
    LEFT JOIN documentos d ON d.id = h.requisito_documento_id
    LEFT JOIN mejora_hallazgos r ON r.id = h.reincidente_de
    LEFT JOIN usuarios uc ON uc.id = h.correccion_responsable_id
    WHERE h.id = ${hallazgoId}`;
  if (!f) throw new ErrorMejora(NO_EXISTE);
  const clase = f.clase as Clase;
  const ronda = Number(f.ronda);
  const [r] = await sql`SELECT id, similares, similares_detalle, cambios, criterios, criterio_otro, indicador_eficacia_id,
      to_char(fecha_evaluacion, 'YYYY-MM-DD') AS fecha_evaluacion
    FROM mejora_rondas WHERE hallazgo_id = ${hallazgoId} AND numero = ${ronda}`;
  if (!r) throw new ErrorMejora(NO_EXISTE);
  const [analisis, causas, acciones, vinculos, actividades] = await Promise.all([
    sql`SELECT orden, metodo, equipo, observaciones, contenido FROM mejora_analisis WHERE ronda_id = ${r.id} ORDER BY orden, id`,
    sql`SELECT id, orden, texto, sin_accion_porque FROM mejora_causas WHERE ronda_id = ${r.id} ORDER BY orden, id`,
    sql`SELECT id, orden, tipo, descripcion, recursos, indicador_cumplimiento, meta FROM mejora_acciones WHERE ronda_id = ${r.id} ORDER BY orden, id`,
    sql`SELECT ac.accion_id, ac.causa_id FROM mejora_accion_causas ac JOIN mejora_acciones a ON a.id = ac.accion_id
      WHERE a.ronda_id = ${r.id}`,
    sql`SELECT a.accion_id, a.orden, a.descripcion, a.responsable_id, a.estado, u.nombre AS responsable, u.activo,
        to_char(a.inicio, 'YYYY-MM-DD') AS inicio, to_char(a.fin, 'YYYY-MM-DD') AS fin
      FROM mejora_actividades a
      JOIN mejora_acciones ac ON ac.id = a.accion_id
      JOIN usuarios u ON u.id = a.responsable_id
      WHERE ac.ronda_id = ${r.id}
      ORDER BY a.orden, a.id`,
  ]);

  const criterios = leerCriterios(r.criterios);
  const conIndicador = criterios.includes("mejora_indicador");
  const indicador = conIndicador && r.indicador_eficacia_id !== null ? await indicadorDeEficacia(sql, Number(r.indicador_eficacia_id)) : null;
  const fechaEvaluacion = clase === "no_conformidad" ? null : ((r.fecha_evaluacion as string | null) ?? null);
  const ordenDeCausa = new Map(causas.map((x) => [Number(x.id), Number(x.orden)]));

  const accionesFirmadas: AccionFirmada[] = acciones.map((a) => ({
    numero: etiquetaDeAccion(Number(a.orden)),
    tipo: a.tipo as TipoAccion,
    descripcion: a.descripcion as string,
    causas: vinculos
      .filter((x) => Number(x.accion_id) === Number(a.id))
      .map((x) => ordenDeCausa.get(Number(x.causa_id)) ?? 0)
      .sort((x, y) => x - y),
    recursos: texto(a.recursos),
    indicadorCumplimiento: texto(a.indicador_cumplimiento),
    meta: texto(a.meta),
    actividades: actividades
      .filter((x) => Number(x.accion_id) === Number(a.id))
      .map((x) => ({
        numero: etiquetaDeActividad(Number(a.orden), Number(x.orden)),
        descripcion: x.descripcion as string,
        responsableId: Number(x.responsable_id),
        responsable: x.responsable as string,
        inicio: x.inicio as string,
        fin: x.fin as string,
      })),
  }));

  const plan: PlanFirmado = {
    ronda,
    identificacion: {
      codigo: f.codigo as string,
      clase,
      criticidad: (f.criticidad as Criticidad | null) ?? null,
      origen: f.origen as Origen,
      fuente: texto(f.fuente),
      referenciaCaso: texto(f.referencia_caso),
      detectadoEn: f.detectado as string,
      proceso: f.proceso as string,
      subproceso: texto(f.subproceso),
      titulo: f.titulo as string,
      descripcion: f.descripcion as string,
      requisitoClausula: texto(f.requisito_clausula),
      requisitoNorma: texto(f.norma),
      requisitoDocumento: texto(f.documento),
      riesgo: texto(f.riesgo),
      fechaLimiteEnte: texto(f.limite_ente),
      reincidenteDe: texto(f.reincidente),
    },
    correccion: {
      requerida: (f.correccion_requerida as boolean | null) ?? null,
      descripcion: texto(f.correccion_descripcion),
      responsable: texto(f.correccion_responsable),
      implementadaEn: texto(f.implementada),
    },
    analisis: analisis.map((a) => ({
      orden: Number(a.orden),
      metodo: a.metodo as string,
      equipo: texto(a.equipo),
      observaciones: texto(a.observaciones),
      contenido: a.contenido ?? null,
    })),
    causas: causas.map((x) => ({ orden: Number(x.orden), texto: x.texto as string, sinAccionPorque: texto(x.sin_accion_porque) })),
    preguntas: { similares: (r.similares as boolean | null) ?? null, similaresDetalle: texto(r.similares_detalle), cambios: r.cambios ?? null },
    acciones: accionesFirmadas,
    criterio: {
      criterios,
      criterioOtro: criterios.includes("otro") ? texto(r.criterio_otro) : null,
      indicador: indicador ? { id: indicador.id, codigo: indicador.codigo, nombre: indicador.nombre, periodicidad: indicador.periodicidad } : null,
      fechaEvaluacion,
    },
  };

  const faltas: string[] = [];
  const hoy = fechaEnZona(c.ahora, c.zona);
  const esNc = clase === "no_conformidad";

  // El análisis, obligatorio en la no conformidad (§9.5).
  if (esNc) {
    if (!analisis.some((a) => analisisCompleto({ metodo: a.metodo, contenido: a.contenido }))) faltas.push("Falta el análisis de causa raíz");
    if (causas.length === 0) faltas.push("Escriba al menos una causa raíz");
    if (r.similares === null || !leerCambios(r.cambios)) faltas.push("Responda las dos preguntas de cierre del análisis");
  }

  // Las acciones y sus actividades.
  if (acciones.length === 0 || (esNc && !acciones.some((a) => a.tipo === "correctiva"))) {
    faltas.push(esNc ? "El plan de una no conformidad lleva al menos una acción correctiva" : "El plan lleva al menos una acción");
  }
  const vigentes = actividades.filter((x) => x.estado !== "cancelada");
  for (const a of acciones) {
    const etiqueta = etiquetaDeAccion(Number(a.orden));
    const suyas = vigentes.filter((x) => Number(x.accion_id) === Number(a.id));
    if (suyas.length === 0) faltas.push(`La acción ${etiqueta} no tiene actividades`);
    if (a.tipo === "correctiva" && !vinculos.some((x) => Number(x.accion_id) === Number(a.id))) {
      faltas.push(`La acción ${etiqueta} no dice qué causa ataca`);
    }
    for (const x of suyas) {
      const actividad = etiquetaDeActividad(Number(a.orden), Number(x.orden));
      if (x.activo !== true) faltas.push(`El responsable de la actividad ${actividad} ya no está activo`);
      if ((x.inicio as string) > (x.fin as string)) faltas.push(`La actividad ${actividad} empieza después de su fin`);
      if ((x.fin as string) < hoy) faltas.push(`La actividad ${actividad} termina en una fecha pasada`);
    }
  }

  // Cada causa, con al menos una acción o con la justificación de por qué no la requiere.
  for (const x of causas) {
    if (!vinculos.some((v) => Number(v.causa_id) === Number(x.id)) && !texto(x.sin_accion_porque)?.trim()) {
      faltas.push(`La causa ${Number(x.orden)} no tiene acción ni justificación`);
    }
  }

  // El criterio de eficacia (§11.2).
  if (criterios.length === 0) faltas.push("Defina el criterio de eficacia");
  if (conIndicador) {
    if (r.indicador_eficacia_id === null) faltas.push("Elija el indicador");
    else if (!indicador?.activo) faltas.push("El indicador elegido ya no está activo: elija otro");
  }
  if (criterios.includes("otro") && !texto(r.criterio_otro)?.trim()) faltas.push("Describa el otro criterio de eficacia");

  const ultimoFin = vigentes.reduce<string | null>((m, x) => (m === null || (x.fin as string) > m ? (x.fin as string) : m), null);
  if (!esNc) {
    if (fechaEvaluacion === null) faltas.push("Escriba la fecha de evaluación");
    else if (ultimoFin !== null && fechaEvaluacion < ultimoFin) faltas.push("La evaluación no puede ser anterior al fin de la última actividad");
  }

  const evaluableDesde =
    ultimoFin === null
      ? null
      : fechaMinimaDeEficacia({ clase, r: ultimoFin, fechaEvaluacion, periodicidad: indicador?.activo ? indicador.periodicidad : null }, c.zona);
  return { faltas, plan, huella: huellaDePlan(plan), evaluableDesde };
}

/** Los usuarios activos que pueden ser responsables de una actividad (cualquiera, spec §10.2), con su cargo. */
export async function usuariosAsignables(sql: Cliente): Promise<Array<{ id: number; nombre: string; cargo: string | null }>> {
  const filas = await sql`SELECT u.id, u.nombre, c.nombre AS cargo
    FROM usuarios u LEFT JOIN cargos c ON c.id = u.cargo_id
    WHERE u.activo ORDER BY u.nombre, u.id`;
  return filas.map((f) => ({ id: Number(f.id), nombre: f.nombre as string, cargo: texto(f.cargo) }));
}
