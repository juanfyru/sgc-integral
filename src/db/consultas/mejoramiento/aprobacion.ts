/**
 * Las firmas del plan de acción (spec 15 §8.6, §12.1 y §12.2; Tarea 13): enviar con «Elaboró», devolver con observaciones,
 * revisar con «Revisó» (que vale como aprobación si no aplica Gerencia) y aprobar con «Aprobó». Cada acto con firma sigue
 * F13A-R4, con el molde de `aprobarFichas`: un validador de solo lectura antes, la clave con `verificarParaFirmar` fuera de la
 * transacción y, dentro, los candados y el mismo validador otra vez. El cambio de estado va por `transicionarHallazgo`.
 *
 * Lo firmado es el plan congelado al enviarlo: `enviarPlan` lo guarda con su huella en el evento `enviar_plan`
 * (`detalle.plan`, solo en el evento, nunca en la bitácora) y firma «Elaboró» con esa huella. «Revisó» y «Aprobó» firman el
 * envío vigente de la ronda, el de la última «Elaboró» (`envioVigente`), nunca una huella recalculada con los nombres de hoy;
 * el evento que deja el plan aprobado lleva ese mismo plan y esa misma huella. Entre el envío y la aprobación el plan no se
 * edita: `exigirBorrador` (`analisis.ts`) solo deja escribir con el plan en borrador.
 *
 * Orden de candados: el hallazgo `FOR UPDATE` (`bloquearHallazgo`), después la ronda en curso y después sus actividades.
 */
import type { TransactionSql } from "postgres";
import { obtenerSql, type Cliente } from "@/db/cliente";
import { avisarA } from "@/db/consultas/avisos-vencimiento";
import { registrarFirma } from "@/db/consultas/firmas";
import { ErrorFirma, enTransaccion, type OpcionesFlujo, type SesionFlujo } from "@/db/consultas/flujo/contrato";
import { adminsActivos } from "@/db/consultas/tramites";
import { puedeVerHallazgo } from "@/lib/alcance";
import { EsquemaDevolverPlan, EsquemaPasoDelHallazgo, EsquemaRevisarPlan } from "@/lib/esquemas/mejoramiento";
import { verificarParaFirmar, type ContextoFirma, type CredencialesFirma } from "@/lib/firma";
import { cierrePrevisto } from "@/lib/mejoramiento/eficacia";
import { fechaLargaDeDia } from "@/lib/mejoramiento/formato";
import type { PlanFirmado } from "@/lib/mejoramiento/huellas";
import { apruebaGerencia } from "@/lib/mejoramiento/reglas";
import { rutaDeActividad } from "@/lib/mejoramiento/rutas";
import { ErrorMejora, type HallazgoBase } from "@/lib/mejoramiento/tipos";
import { YA_CAMBIO } from "@/lib/mejoramiento/transiciones";
import { ErrorPermiso, puede, requerirPermiso } from "@/lib/permisos";
import type { Firma } from "@/lib/tramites/tipos";
import { leer, puedeFormular } from "./analisis";
import { revisoresDe } from "./avisos";
import { contextoDeMejora, type ContextoMejora } from "./config";
import { bloquearHallazgo, hallazgoBase, legible, NO_EXISTE, transicionarHallazgo } from "./flujo";
import { indicadorDeEficacia } from "./indicador-de-eficacia";
import { etiquetaDeActividad, examinarPlan, type ExamenDelPlan } from "./plan";

type Persona = Pick<SesionFlujo, "usuarioId" | "rol" | "verHistorial">;

/** El aviso a cada responsable cuando el plan queda aprobado (spec §8.6 y §14.2): es la «delegación». */
export const ACTIVIDAD_ASIGNADA = "Tiene una actividad a su cargo";

/** La entidad del aviso de una actividad. */
const ENTIDAD_ACTIVIDAD = "mejora_actividad";

// ─────────────────────────────────────────────────────────────────────────────
// Quién da cada paso: la misma regla para el acto y para la página
// ─────────────────────────────────────────────────────────────────────────────

/** Revisa el plan un Admin SGC activo que no lo elaboró (spec §6.1 y §8.6, `revisoresDe`). */
export async function puedeRevisar(sql: Cliente, p: Persona, h: Pick<HallazgoBase, "id" | "ronda">): Promise<boolean> {
  return puede(p, "mejora.gestionar") && (await revisoresDe(sql, h)).includes(p.usuarioId);
}

/** Aprueba el plan Gerencia (spec §6.1): `mejora.aprobar`. */
export function puedeAprobar(p: Persona): boolean {
  return puede(p, "mejora.aprobar");
}

/**
 * Si el envío de quien formula pasa directo a «En aprobación»: elabora un Admin SGC (el proceso no tiene líder) y no hay otro
 * Admin SGC activo que lo revise (F15-DC15). Nadie firma «Revisó» sobre lo que elaboró.
 */
export async function saltaLaRevision(sql: Cliente, p: Persona): Promise<boolean> {
  return p.rol === "admin_sgc" && (await adminsActivos({ sql })).every((u) => u === p.usuarioId);
}

// ─────────────────────────────────────────────────────────────────────────────
// Lo común de los actos
// ─────────────────────────────────────────────────────────────────────────────

/** Quien no puede dar el paso: `ErrorPermiso` si ve el hallazgo; si no lo ve, no existe (spec §6.3). */
async function negar(sql: Cliente, p: Persona, hallazgoId: number): Promise<never> {
  throw (await puedeVerHallazgo(hallazgoId, p, { sql })) ? new ErrorPermiso() : new ErrorMejora(NO_EXISTE);
}

/** El hallazgo está en otro paso: `YA_CAMBIO` a quien lo ve; a quien no, no existe. */
async function yaCambio(sql: Cliente, p: Persona, hallazgoId: number): Promise<never> {
  throw (await puedeVerHallazgo(hallazgoId, p, { sql })) ? new ErrorMejora(YA_CAMBIO) : new ErrorMejora(NO_EXISTE);
}

async function existente(sql: Cliente, hallazgoId: number): Promise<HallazgoBase> {
  const h = await hallazgoBase(sql, hallazgoId);
  if (!h) throw new ErrorMejora(NO_EXISTE);
  return h;
}

/** La ronda en curso y sus actividades `FOR UPDATE`, después del hallazgo (el orden de candados del módulo). */
async function bloquearRondaYActividades(tx: TransactionSql, h: Pick<HallazgoBase, "id" | "ronda">): Promise<void> {
  await tx`SELECT id FROM mejora_rondas WHERE hallazgo_id = ${h.id} AND numero = ${h.ronda} FOR UPDATE`;
  await tx`SELECT a.id FROM mejora_actividades a
    JOIN mejora_acciones ac ON ac.id = a.accion_id
    JOIN mejora_rondas r ON r.id = ac.ronda_id
    WHERE a.hallazgo_id = ${h.id} AND r.numero = ${h.ronda}
    ORDER BY a.id FOR UPDATE OF a`;
}

/** La clave, fuera de la transacción (F13A-R4): sus fallos cuentan para el bloqueo de la cuenta aunque el acto no siga. */
async function verificarFirma(
  sesion: SesionFlujo,
  credenciales: CredencialesFirma,
  opciones: OpcionesFlujo,
  ahora: Date,
): Promise<{ metodo: "clave" | "clave_totp"; contexto: ContextoFirma }> {
  const contexto = opciones.contexto ?? { ip: null, userAgent: null };
  const verificar = opciones.verificar ?? verificarParaFirmar;
  const r = await verificar(sesion, credenciales, contexto, ahora);
  if (!r.ok) throw new ErrorFirma(r.mensaje, r.sesionCerrada, r.bloqueada);
  return { metodo: r.metodo, contexto };
}

/** El envío vigente de la ronda en curso: la última firma «Elaboró» y el plan que congeló el último evento `enviar_plan`. */
export type EnvioDelPlan = { huella: string; plan: PlanFirmado; elaboroAdmin: boolean; elaboradoPor: number };

/**
 * El envío vigente de la ronda en curso del hallazgo, por orden (la última «Elaboró» y el último `enviar_plan`), nunca por
 * huella: un reenvío sin cambios da la misma. Lo que firman «Revisó» y «Aprobó».
 */
export async function envioVigente(sql: Cliente, h: Pick<HallazgoBase, "id" | "ronda">): Promise<EnvioDelPlan> {
  const [f] = await sql`SELECT usuario_id, hash_sha256 FROM firmas
    WHERE mejora_hallazgo_id = ${h.id} AND ronda = ${h.ronda} AND firma = 'elaboro' ORDER BY id DESC LIMIT 1`;
  const [e] = await sql`SELECT detalle FROM mejora_eventos
    WHERE hallazgo_id = ${h.id} AND ronda = ${h.ronda} AND tipo = 'enviar_plan' ORDER BY id DESC LIMIT 1`;
  const d = (e?.detalle ?? null) as { huella?: unknown; plan?: unknown; elaboroAdmin?: unknown } | null;
  if (!f || !d || d.huella !== f.hash_sha256 || typeof d.plan !== "object" || d.plan === null) {
    throw new ErrorMejora("El plan enviado no coincide con su firma «Elaboró»: devuélvalo para que se envíe otra vez");
  }
  return { huella: f.hash_sha256 as string, plan: d.plan as PlanFirmado, elaboroAdmin: d.elaboroAdmin === true, elaboradoPor: Number(f.usuario_id) };
}

/** Ninguna actividad sin cancelar de la ronda tiene un responsable inactivo: el plan no se aprueba con una actividad sin dueño. */
async function exigirResponsablesActivos(sql: Cliente, h: Pick<HallazgoBase, "id" | "ronda">): Promise<void> {
  const [f] = await sql`SELECT ac.orden AS accion, a.orden
    FROM mejora_actividades a
    JOIN mejora_acciones ac ON ac.id = a.accion_id
    JOIN mejora_rondas r ON r.id = ac.ronda_id
    JOIN usuarios u ON u.id = a.responsable_id
    WHERE a.hallazgo_id = ${h.id} AND r.numero = ${h.ronda} AND a.estado <> 'cancelada' AND NOT u.activo
    ORDER BY ac.orden, a.orden LIMIT 1`;
  if (f) {
    throw new ErrorMejora(`El responsable de la actividad ${etiquetaDeActividad(Number(f.accion), Number(f.orden))} ya no está activo: devuelva el plan`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Enviar (firma «Elaboró»)
// ─────────────────────────────────────────────────────────────────────────────

type Envio = { h: HallazgoBase; rondaId: number; examen: ExamenDelPlan; elaboroAdmin: boolean; saltaRevision: boolean };

/** Lo que debe cumplirse para enviar, sin escribir nada: quien formula, «Por formular» con el plan en borrador y sin faltas. */
async function validarEnvio(sql: Cliente, sesion: Persona, hallazgoId: number, c: ContextoMejora): Promise<Envio> {
  const h = await existente(sql, hallazgoId);
  if (!(await puedeFormular(sql, sesion, h))) await negar(sql, sesion, h.id);
  if (h.estado !== "por_formular") throw new ErrorMejora(YA_CAMBIO);
  const [r] = await sql`SELECT id, estado_plan FROM mejora_rondas WHERE hallazgo_id = ${h.id} AND numero = ${h.ronda}`;
  if (!r || r.estado_plan !== "borrador") throw new ErrorMejora(YA_CAMBIO);
  const examen = await examinarPlan(sql, h.id, c);
  if (examen.faltas.length > 0) throw new ErrorMejora(examen.faltas[0]);
  const elaboroAdmin = sesion.rol === "admin_sgc";
  return { h, rondaId: Number(r.id), examen, elaboroAdmin, saltaRevision: elaboroAdmin && (await saltaLaRevision(sql, sesion)) };
}

/**
 * Envía la causa raíz y el plan de la ronda en curso con la firma «Elaboró» (spec §8.6): pasa a «En revisión» o, si elabora
 * un Admin SGC sin otro que lo revise, a «En aprobación». Congela el plan en el evento con su huella; la ronda guarda quién
 * lo elaboró y cuándo se envió por primera vez (una devolución no lo cambia: es lo que mide «Planes formulados a tiempo»).
 * Si otra sesión cambia el plan entre el validador y la transacción, la huella de dentro no es la de fuera: `YA_CAMBIO`.
 */
export async function enviarPlan(
  sesion: SesionFlujo,
  d: { hallazgoId: number; credenciales: CredencialesFirma },
  opciones: OpcionesFlujo = {},
): Promise<void> {
  requerirPermiso(sesion, "mejora.formular");
  const { hallazgoId } = leer(EsquemaPasoDelHallazgo, { hallazgoId: d.hallazgoId });
  const sql = opciones.sql ?? obtenerSql();
  const ahora = opciones.ahora ?? new Date();
  const fuera = await legible(validarEnvio(sql, sesion, hallazgoId, await contextoDeMejora(sql, ahora)));
  const { metodo, contexto } = await verificarFirma(sesion, d.credenciales, opciones, ahora);

  await legible(
    enTransaccion(sql, async (tx) => {
      const h = await bloquearHallazgo(tx, hallazgoId);
      await bloquearRondaYActividades(tx, h);
      const c = await contextoDeMejora(tx, ahora);
      const e = await validarEnvio(tx, sesion, h.id, c);
      // Se firma lo que se validó antes de pedir la clave: si el plan cambió mientras tanto, no.
      if (e.examen.huella !== fuera.examen.huella) throw new ErrorMejora(YA_CAMBIO);
      const { huella, plan } = e.examen;
      await tx`UPDATE mejora_rondas
        SET estado_plan = 'enviado', enviado_en = coalesce(enviado_en, ${ahora}), elaborado_por = ${sesion.usuarioId}
        WHERE id = ${e.rondaId}`;
      await registrarFirma(tx, {
        tramiteId: null,
        versionId: null,
        mejoraHallazgoId: h.id,
        usuarioId: sesion.usuarioId,
        firma: "elaboro",
        ronda: h.ronda,
        hashSha256: huella,
        metodo,
        contexto,
        ahora,
      });
      await transicionarHallazgo(
        tx,
        sesion,
        h,
        "enviar_plan",
        {
          rumbo: { saltaRevision: e.saltaRevision },
          detalle: { huella, ...(e.elaboroAdmin ? { elaboroAdmin: true } : {}), ...(e.saltaRevision ? { sinRevision: true } : {}) },
          soloEnElEvento: { plan },
        },
        c,
      );
    }),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Devolver (sin firma)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Devuelve el plan con observaciones (spec §8.6): desde «En revisión», quien puede revisarlo; desde «En aprobación»,
 * Gerencia. Vuelve a «Por formular» en borrador, con el plazo de reenviar (lo pone el motor), y la revisión de la ronda se
 * borra: el reenvío pide otra «Elaboró» y pasa otra vez por la revisión. Las firmas anteriores quedan en `firmas`.
 */
export async function devolverPlan(
  sesion: SesionFlujo,
  d: { hallazgoId: number; observaciones: string },
  opciones?: OpcionesFlujo,
): Promise<void> {
  if (!puede(sesion, "mejora.gestionar") && !puede(sesion, "mejora.aprobar")) throw new ErrorPermiso();
  const v = leer(EsquemaDevolverPlan, d);
  const ahora = opciones?.ahora ?? new Date();
  await legible(
    enTransaccion(opciones?.sql ?? obtenerSql(), async (tx) => {
      const h = await bloquearHallazgo(tx, v.hallazgoId);
      await bloquearRondaYActividades(tx, h);
      if (h.estado !== "en_revision" && h.estado !== "en_aprobacion") await yaCambio(tx, sesion, h.id);
      const puedeDevolver = h.estado === "en_revision" ? await puedeRevisar(tx, sesion, h) : puedeAprobar(sesion);
      if (!puedeDevolver) await negar(tx, sesion, h.id);
      await tx`UPDATE mejora_rondas
        SET estado_plan = 'borrador', revisado_por = NULL, revisado_en = NULL, requiere_recursos = false, nota_recursos = NULL
        WHERE hallazgo_id = ${h.id} AND numero = ${h.ronda}`;
      await transicionarHallazgo(tx, sesion, h, "devolver_plan", { detalle: { observaciones: v.observaciones } }, await contextoDeMejora(tx, ahora));
    }),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Lo que pasa al quedar aprobado (spec §8.6)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Deja el plan de la ronda aprobado, por la «Aprobó» o por la «Revisó» que vale como aprobación, en la transacción del acto:
 * el estado del plan, quién lo aprobó y con qué rol; la fecha de fin original de cada actividad (no cambia nunca después);
 * el cierre previsto (§11.3); el paso por `transicionarHallazgo` con el plan congelado y su huella; y el aviso a cada
 * responsable por su actividad, sin el contenido del hallazgo. La respuesta al ente de un hallazgo externo la calcula la
 * Tarea 19.
 */
async function dejarAprobado(
  tx: TransactionSql,
  sesion: SesionFlujo,
  h: HallazgoBase,
  envio: EnvioDelPlan,
  x: { accion: "revisar_plan" | "aprobar_plan"; rol: "admin_sgc" | "gerencia"; detalle: Record<string, unknown> },
  c: ContextoMejora,
): Promise<void> {
  const [r] = await tx`SELECT id FROM mejora_rondas WHERE hallazgo_id = ${h.id} AND numero = ${h.ronda}`;
  await tx`UPDATE mejora_actividades a SET fin_original = a.fin
    FROM mejora_acciones ac
    WHERE ac.id = a.accion_id AND ac.ronda_id = ${r.id} AND a.fin_original IS NULL`;
  const actividades = await tx`SELECT a.id, a.responsable_id, a.descripcion, to_char(a.fin, 'YYYY-MM-DD') AS fin
    FROM mejora_actividades a JOIN mejora_acciones ac ON ac.id = a.accion_id
    WHERE ac.ronda_id = ${r.id} AND a.estado <> 'cancelada'
    ORDER BY a.id`;
  // El cierre previsto, con la misma cuenta de la fecha mínima que `examinarPlan` (el indicador, si sigue enlazable).
  const finPlaneado = actividades.reduce<string | null>((m, a) => (m === null || (a.fin as string) > m ? (a.fin as string) : m), null);
  const enlazado = envio.plan.criterio.indicador ? await indicadorDeEficacia(tx, envio.plan.criterio.indicador.id) : null;
  const indicador = enlazado?.activo ? enlazado : null;
  const previsto =
    finPlaneado === null
      ? null
      : cierrePrevisto(
          {
            clase: h.clase,
            finPlaneado,
            fechaEvaluacion: envio.plan.criterio.fechaEvaluacion,
            periodicidad: indicador?.periodicidad ?? null,
            plazoReporteDias: indicador?.plazoReporteDias ?? null,
          },
          c,
        );
  await tx`UPDATE mejora_rondas
    SET estado_plan = 'aprobado', aprobado_por = ${sesion.usuarioId}, aprobado_en = ${c.ahora}, aprobado_rol = ${x.rol},
      cierre_previsto = ${previsto}
    WHERE id = ${r.id}`;
  await transicionarHallazgo(
    tx,
    sesion,
    h,
    x.accion,
    {
      rumbo: { apruebaGerencia: false },
      detalle: { ...x.detalle, huella: envio.huella, aprobadoRol: x.rol },
      soloEnElEvento: { plan: envio.plan },
    },
    c,
  );
  for (const a of actividades) {
    const descripcion = (a.descripcion as string).trim().replace(/[.\s]+$/, "");
    await avisarA(
      tx,
      { tipo: "mejora.actividad_asignada", titulo: ACTIVIDAD_ASIGNADA, enlace: rutaDeActividad(Number(a.id)), entidad: ENTIDAD_ACTIVIDAD, entidadId: Number(a.id) },
      [{ usuarioId: Number(a.responsable_id), cuerpo: `${descripcion}. Fecha de fin: ${fechaLargaDeDia(a.fin as string)}.` }],
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Revisar (firma «Revisó»)
// ─────────────────────────────────────────────────────────────────────────────

type Revision = { h: HallazgoBase; envio: EnvioDelPlan; apruebaGerencia: boolean };

/** Lo que debe cumplirse para revisar, sin escribir nada: quien revisa, «En revisión», el envío vigente y sus responsables activos. */
async function validarRevision(sql: Cliente, sesion: Persona, hallazgoId: number, requiereRecursos: boolean): Promise<Revision> {
  const h = await existente(sql, hallazgoId);
  if (!(await puedeRevisar(sql, sesion, h))) await negar(sql, sesion, h.id);
  if (h.estado !== "en_revision") throw new ErrorMejora(YA_CAMBIO);
  const envio = await envioVigente(sql, h);
  await exigirResponsablesActivos(sql, h);
  return { h, envio, apruebaGerencia: apruebaGerencia(h, { requiereRecursos, elaboroAdmin: envio.elaboroAdmin }) };
}

/**
 * Firma «Revisó» sobre el plan enviado (spec §8.6), con la marca «requiere recursos adicionales o tiene impacto
 * institucional» y su nota. Si aplica alguna de las cuatro condiciones de Gerencia pasa a «En aprobación»; si no, la revisión
 * vale como aprobación y el plan queda aprobado por el Admin SGC (`dejarAprobado`).
 */
export async function firmarRevision(
  sesion: SesionFlujo,
  d: { hallazgoId: number; requiereRecursos: boolean; notaRecursos?: string | null; credenciales: CredencialesFirma },
  opciones: OpcionesFlujo = {},
): Promise<void> {
  requerirPermiso(sesion, "mejora.gestionar");
  const v = leer(EsquemaRevisarPlan, { hallazgoId: d.hallazgoId, requiereRecursos: d.requiereRecursos, notaRecursos: d.notaRecursos ?? null });
  const sql = opciones.sql ?? obtenerSql();
  const ahora = opciones.ahora ?? new Date();
  const fuera = await legible(validarRevision(sql, sesion, v.hallazgoId, v.requiereRecursos));
  const { metodo, contexto } = await verificarFirma(sesion, d.credenciales, opciones, ahora);

  await legible(
    enTransaccion(sql, async (tx) => {
      const h = await bloquearHallazgo(tx, v.hallazgoId);
      await bloquearRondaYActividades(tx, h);
      const r = await validarRevision(tx, sesion, h.id, v.requiereRecursos);
      if (r.envio.huella !== fuera.envio.huella) throw new ErrorMejora(YA_CAMBIO);
      const c = await contextoDeMejora(tx, ahora);
      await tx`UPDATE mejora_rondas
        SET revisado_por = ${sesion.usuarioId}, revisado_en = ${ahora}, requiere_recursos = ${v.requiereRecursos},
          nota_recursos = ${v.notaRecursos}
        WHERE hallazgo_id = ${h.id} AND numero = ${h.ronda}`;
      await registrarFirma(tx, {
        tramiteId: null,
        versionId: null,
        mejoraHallazgoId: h.id,
        usuarioId: sesion.usuarioId,
        firma: "reviso",
        ronda: h.ronda,
        hashSha256: r.envio.huella,
        metodo,
        contexto,
        ahora,
      });
      const detalle = { requiereRecursos: v.requiereRecursos, ...(v.notaRecursos ? { notaRecursos: v.notaRecursos } : {}) };
      if (r.apruebaGerencia) {
        await transicionarHallazgo(tx, sesion, h, "revisar_plan", { rumbo: { apruebaGerencia: true }, detalle: { ...detalle, huella: r.envio.huella } }, c);
      } else {
        await dejarAprobado(tx, sesion, h, r.envio, { accion: "revisar_plan", rol: "admin_sgc", detalle }, c);
      }
    }),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Aprobar (firma «Aprobó»)
// ─────────────────────────────────────────────────────────────────────────────

/** Lo que debe cumplirse para aprobar, sin escribir nada: Gerencia, «En aprobación», el envío vigente y sus responsables activos. */
async function validarAprobacion(sql: Cliente, sesion: Persona, hallazgoId: number): Promise<{ h: HallazgoBase; envio: EnvioDelPlan }> {
  const h = await existente(sql, hallazgoId);
  if (!puedeAprobar(sesion)) await negar(sql, sesion, h.id);
  if (h.estado !== "en_aprobacion") throw new ErrorMejora(YA_CAMBIO);
  const envio = await envioVigente(sql, h);
  await exigirResponsablesActivos(sql, h);
  return { h, envio };
}

/** Gerencia firma «Aprobó» sobre el plan enviado (spec §8.6): queda «En ejecución» (`dejarAprobado`). */
export async function aprobarPlan(
  sesion: SesionFlujo,
  d: { hallazgoId: number; credenciales: CredencialesFirma },
  opciones: OpcionesFlujo = {},
): Promise<void> {
  requerirPermiso(sesion, "mejora.aprobar");
  const { hallazgoId } = leer(EsquemaPasoDelHallazgo, { hallazgoId: d.hallazgoId });
  const sql = opciones.sql ?? obtenerSql();
  const ahora = opciones.ahora ?? new Date();
  const fuera = await legible(validarAprobacion(sql, sesion, hallazgoId));
  const { metodo, contexto } = await verificarFirma(sesion, d.credenciales, opciones, ahora);

  await legible(
    enTransaccion(sql, async (tx) => {
      const h = await bloquearHallazgo(tx, hallazgoId);
      await bloquearRondaYActividades(tx, h);
      const a = await validarAprobacion(tx, sesion, h.id);
      if (a.envio.huella !== fuera.envio.huella) throw new ErrorMejora(YA_CAMBIO);
      await registrarFirma(tx, {
        tramiteId: null,
        versionId: null,
        mejoraHallazgoId: h.id,
        usuarioId: sesion.usuarioId,
        firma: "aprobo",
        ronda: h.ronda,
        hashSha256: a.envio.huella,
        metodo,
        contexto,
        ahora,
      });
      await dejarAprobado(tx, sesion, h, a.envio, { accion: "aprobar_plan", rol: "gerencia", detalle: {} }, await contextoDeMejora(tx, ahora));
    }),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Lecturas
// ─────────────────────────────────────────────────────────────────────────────

export type FirmaDelHallazgo = { firma: Firma; ronda: number; nombre: string; cargo: string | null; cuando: Date; huella: string };

/** Las firmas del hallazgo, en el orden en que se dieron, con el nombre y el cargo con que se firmó. Sin regla de alcance. */
export async function firmasDeHallazgo(sql: Cliente, hallazgoId: number): Promise<FirmaDelHallazgo[]> {
  const filas = await sql`SELECT firma, ronda, nombre_firmante, cargo_firmante, creado_en, hash_sha256
    FROM firmas WHERE mejora_hallazgo_id = ${hallazgoId} ORDER BY id`;
  return filas.map((f) => ({
    firma: f.firma as Firma,
    ronda: Number(f.ronda),
    nombre: f.nombre_firmante as string,
    cargo: (f.cargo_firmante as string | null) ?? null,
    cuando: f.creado_en as Date,
    huella: f.hash_sha256 as string,
  }));
}
