/**
 * Ayudantes de los tests de mejoramiento (Fase 15A). Corren dentro de una transacción que se revierte (`revertida`):
 * lo que crean aquí no sobrevive al test.
 */
import type { TransactionSql } from "postgres";
import { registrarArchivo } from "@/db/consultas/admin";
import type { OpcionesFlujo, SesionFlujo } from "@/db/consultas/flujo/contrato";
import { guardarAnalisis, guardarCausas, responderPreguntas } from "@/db/consultas/mejoramiento/analisis";
import { aprobarPlan, enviarPlan, firmarRevision } from "@/db/consultas/mejoramiento/aprobacion";
import { bloquearHallazgo } from "@/db/consultas/mejoramiento/flujo";
import { guardarAccion, guardarCriterio } from "@/db/consultas/mejoramiento/plan";
import {
  aceptarHallazgo,
  decidirAccionCorrectiva,
  rechazarHallazgo,
  registrarCorreccion,
  sostenerHallazgo,
} from "@/db/consultas/mejoramiento/recorrido";
import { registrarHallazgo, type DatosDeHallazgo } from "@/db/consultas/mejoramiento/registro";
import { lideresDeProceso } from "@/db/consultas/tramites";
import { tipoPropuesto } from "@/lib/mejoramiento/reglas";
import type { HallazgoBase } from "@/lib/mejoramiento/tipos";
import { procesoNuevo } from "./mixto";
import { usuarioDePrueba } from "./tramites";
import { firmaDePrueba } from "./vigencia";

export type BaseDeMejora = {
  admin: SesionFlujo;
  control: SesionFlujo;
  gerencia: SesionFlujo;
  lider: SesionFlujo;
  consulta: SesionFlujo;
  procesoId: number;
};

/** Un proceso nuevo con su líder, y una persona de cada uno de los otros roles. */
export async function baseDeMejora(tx: TransactionSql): Promise<BaseDeMejora> {
  const procesoId = await procesoNuevo(tx);
  return {
    admin: await usuarioDePrueba(tx, { rol: "admin_sgc" }),
    control: await usuarioDePrueba(tx, { rol: "control_interno" }),
    gerencia: await usuarioDePrueba(tx, { rol: "gerencia" }),
    lider: await usuarioDePrueba(tx, { rol: "lider_proceso", procesos: [procesoId] }),
    consulta: await usuarioDePrueba(tx, { rol: "consulta" }),
    procesoId,
  };
}

/** Una no conformidad interna completa, detectada el 10 de noviembre de 2026. */
export function datosDeHallazgo(procesoId: number, cambios?: Partial<DatosDeHallazgo>): DatosDeHallazgo {
  return {
    clase: "no_conformidad",
    origen: "auditoria_interna",
    fuente: "Auditoría interna del 10 de noviembre",
    detectadoEn: "2026-11-10",
    procesoId,
    criticidad: "media",
    titulo: "Formatos de entrega de turno sin diligenciar",
    descripcion: "En la revisión de tres turnos de la semana se encontraron los formatos de entrega sin diligenciar.",
    requisitoClausula: "7.5.3",
    ...cambios,
  };
}

/** Opciones del dominio a una hora fija, con la firma de prueba (clave «ok»); `sql`, la transacción del test. */
export function c(ahora: string, sql?: TransactionSql): OpcionesFlujo {
  return { ahora: new Date(ahora), verificar: firmaDePrueba, ...(sql ? { sql } : {}) };
}

/** Un segundo proceso con su propio líder, para los casos de dos procesos. */
export async function otroProcesoConLider(tx: TransactionSql): Promise<{ procesoId: number; lider: SesionFlujo }> {
  const procesoId = await procesoNuevo(tx);
  return { procesoId, lider: await usuarioDePrueba(tx, { rol: "lider_proceso", procesos: [procesoId] }) };
}

let archivos = 0;

/** Un archivo de la corrección, subido como `usuarioId` por el camino del dominio (`registrarArchivo`): exige «Por corregir». */
export async function evidenciaDeCorreccion(tx: TransactionSql, hallazgoId: number, usuarioId: number): Promise<number> {
  archivos += 1;
  const { id } = await registrarArchivo(
    {
      versionId: null,
      rol: "correccion",
      ruta: `mejoramiento/hallazgos/${hallazgoId}/${Date.now()}-${archivos}-correccion.pdf`,
      nombreOriginal: `correccion-${archivos}.pdf`,
      extension: "pdf",
      mime: "application/pdf",
      tamanoBytes: 10,
      hashSha256: "c".repeat(64),
      contexto: "mejora_hallazgo",
      contextoId: hallazgoId,
    },
    usuarioId,
    { sql: tx },
  );
  return Number(id);
}

/** Los estados a los que `hallazgoEn` sabe llevar un hallazgo. */
export type EstadoDeEscena =
  | "por_aceptar"
  | "rechazo"
  | "arbitraje"
  | "por_corregir"
  | "por_decidir"
  | "por_validar"
  | "por_formular"
  | "en_revision"
  | "en_aprobacion"
  | "en_ejecucion";

/** Los estados que pasan por el plan: para llegar a ellos, la decisión es «sí». */
const CON_PLAN: readonly EstadoDeEscena[] = ["por_formular", "en_revision", "en_aprobacion", "en_ejecucion"];

/** La hora de todos los pasos de `hallazgoEn` (martes 17 de noviembre de 2026, 10:00 en Bogotá). */
export const HORA_DE_ESCENA = "2026-11-17T15:00:00Z";

/** Quien formula el plan de un hallazgo de la base: el líder si lidera su proceso; si el proceso no tiene líder, el Admin SGC. */
async function formuladorDe(tx: TransactionSql, b: BaseDeMejora, procesoId: number): Promise<SesionFlujo> {
  return (await lideresDeProceso(procesoId, { sql: tx })).includes(b.lider.usuarioId) ? b.lider : b.admin;
}

/**
 * Un plan completo por el dominio, a `HORA_DE_ESCENA`, que formula quien actúa por el proceso (`formuladorDe`): en la no
 * conformidad, un análisis de 5 porqués, una causa y las dos preguntas; una acción (correctiva en la no conformidad, que
 * ataca la causa) con `actividades` actividades (una por omisión) de `responsableId` (la líder por omisión), del 17 de
 * noviembre a `fin` (el 15 de diciembre de 2026 por omisión); y el criterio de eficacia: «mejora del indicador» con
 * `indicadorId` o, si no, «no recurrencia», con la fecha de evaluación fuera de la no conformidad.
 */
export async function planDePrueba(
  tx: TransactionSql,
  b: BaseDeMejora,
  hallazgoId: number,
  x?: { actividades?: number; responsableId?: number; fin?: string; indicadorId?: number },
): Promise<{ accionId: number; formulador: SesionFlujo }> {
  const o = c(HORA_DE_ESCENA, tx);
  const h = await bloquearHallazgo(tx, hallazgoId);
  const quien = await formuladorDe(tx, b, h.procesoId);
  const esNc = h.clase === "no_conformidad";
  let causaIds: number[] = [];
  if (esNc) {
    await guardarAnalisis(quien, { hallazgoId, metodo: "cinco_porques", contenido: { niveles: [{ respuesta: "Nadie asignó el registro al turno de noche" }] } }, o);
    await guardarCausas(quien, { hallazgoId, causas: [{ texto: "El procedimiento no asigna el registro al turno de noche" }] }, o);
    await responderPreguntas(quien, { hallazgoId, similares: false, cambios: { documentos: false, riesgos: false, controles: false } }, o);
    causaIds = (await tx`SELECT id FROM mejora_causas WHERE hallazgo_id = ${hallazgoId} ORDER BY orden, id`).map((f) => Number(f.id));
  }
  const fin = x?.fin ?? "2026-12-15";
  const inicio = fin < "2026-11-17" ? fin : "2026-11-17";
  const { id: accionId } = await guardarAccion(
    quien,
    {
      hallazgoId,
      tipo: tipoPropuesto(h.clase),
      descripcion: "Actualizar el procedimiento de cadena de frío para incluir el turno de noche",
      causaIds,
      actividades: Array.from({ length: x?.actividades ?? 1 }, (_, i) => ({
        descripcion: `Actividad ${i + 1} del plan de prueba`,
        responsableId: x?.responsableId ?? b.lider.usuarioId,
        inicio,
        fin,
      })),
    },
    o,
  );
  await guardarCriterio(
    quien,
    {
      hallazgoId,
      criterios: x?.indicadorId ? ["mejora_indicador"] : ["no_recurrencia"],
      indicadorEficaciaId: x?.indicadorId ?? null,
      fechaEvaluacion: esNc ? null : fin > "2027-01-15" ? fin : "2027-01-15",
    },
    o,
  );
  return { accionId, formulador: quien };
}

/**
 * Un hallazgo que registra Control Interno (con `datosDeHallazgo` y `cambios`), llevado hasta `estado` por el dominio, nunca
 * por SQL: el líder lo acepta (o lo rechaza, y Control Interno lo sostiene), quien actúa por el proceso (el líder, o el
 * Admin SGC si el proceso no tiene) registra la corrección con su evidencia y el Admin SGC decide la acción correctiva
 * («no», salvo para llegar a «Por formular» o más allá). Del plan en adelante: quien formula arma `planDePrueba` (si la
 * ronda no tiene acciones) y lo envía; el Admin SGC lo revisa (otro Admin SGC, si elaboró el de la base), con «requiere
 * recursos» solo para llegar a «En aprobación»; y Gerencia lo aprueba. Lanza si el camino no lleva a `estado` (p. ej. una
 * oportunidad no pasa por «Por corregir»). Todo a `HORA_DE_ESCENA`.
 */
export async function hallazgoEn(
  tx: TransactionSql,
  b: BaseDeMejora,
  estado: EstadoDeEscena,
  cambios?: Partial<DatosDeHallazgo>,
): Promise<HallazgoBase> {
  const o = c(HORA_DE_ESCENA, tx);
  const { id } = await registrarHallazgo(b.control, datosDeHallazgo(b.procesoId, cambios), o);
  for (let paso = 0; paso < 12; paso++) {
    const h = await bloquearHallazgo(tx, id);
    if (h.estado === estado) return h;
    switch (h.estado) {
      case "por_aceptar":
        if (estado === "rechazo" || estado === "arbitraje") {
          await rechazarHallazgo(b.lider, { hallazgoId: id, justificacion: "El hecho no corresponde a este proceso" }, o);
        } else {
          await aceptarHallazgo(b.lider, { hallazgoId: id }, o);
        }
        break;
      case "rechazo":
        await sostenerHallazgo(b.control, { hallazgoId: id, replica: "La evidencia muestra que sí corresponde al proceso" }, o);
        break;
      case "por_corregir": {
        const quien = await formuladorDe(tx, b, h.procesoId);
        await evidenciaDeCorreccion(tx, id, quien.usuarioId);
        await registrarCorreccion(
          quien,
          {
            hallazgoId: id,
            requerida: true,
            descripcion: "Se diligenciaron los formatos pendientes con el turno",
            responsableId: quien.usuarioId,
            implementadaEn: "2026-11-16",
          },
          o,
        );
        break;
      }
      case "por_decidir": {
        const requiere = CON_PLAN.includes(estado);
        await decidirAccionCorrectiva(
          b.admin,
          {
            hallazgoId: id,
            requiere,
            justificacion: requiere ? "Hay que analizar la causa raíz" : "Fue un hecho aislado y quedó corregido",
          },
          o,
        );
        break;
      }
      case "por_formular": {
        if (!CON_PLAN.includes(estado)) throw new Error(`hallazgoEn: el hallazgo quedó en ${h.estado} y no lleva a ${estado}`);
        const [{ acciones }] = await tx`SELECT count(*)::int AS acciones FROM mejora_acciones a
          JOIN mejora_rondas r ON r.id = a.ronda_id WHERE a.hallazgo_id = ${id} AND r.numero = ${h.ronda}`;
        const formulador = Number(acciones) === 0 ? (await planDePrueba(tx, b, id)).formulador : await formuladorDe(tx, b, h.procesoId);
        await enviarPlan(formulador, { hallazgoId: id, credenciales: { clave: "ok" } }, o);
        break;
      }
      case "en_revision": {
        const [r] = await tx`SELECT elaborado_por FROM mejora_rondas WHERE hallazgo_id = ${id} AND numero = ${h.ronda}`;
        const revisor = Number(r.elaborado_por) === b.admin.usuarioId ? await usuarioDePrueba(tx, { rol: "admin_sgc" }) : b.admin;
        const aGerencia = estado === "en_aprobacion";
        await firmarRevision(
          revisor,
          {
            hallazgoId: id,
            requiereRecursos: aGerencia,
            notaRecursos: aGerencia ? "Hace falta comprar un registrador de temperatura" : null,
            credenciales: { clave: "ok" },
          },
          o,
        );
        break;
      }
      case "en_aprobacion":
        await aprobarPlan(b.gerencia, { hallazgoId: id, credenciales: { clave: "ok" } }, o);
        break;
      default:
        throw new Error(`hallazgoEn: el hallazgo quedó en ${h.estado} y no lleva a ${estado}`);
    }
  }
  throw new Error(`hallazgoEn: no se llegó a ${estado}`);
}

/**
 * Una actividad (de la ronda 1) por SQL. Con `accionDe` (el id de otra actividad) cuelga de la misma acción; si no, de una
 * acción nueva. Por omisión simula un plan aprobado (`fin_original = fin`); `aprobada: false` deja la de un borrador, que no
 * da alcance, ni avance, ni avisos.
 */
export async function actividadPorSql(
  tx: TransactionSql,
  hallazgoId: number,
  responsableId: number,
  cambios?: { fin?: string; estado?: string; avance?: number; aprobada?: boolean; accionDe?: number },
): Promise<number> {
  let accionId: number;
  if (cambios?.accionDe !== undefined) {
    const [o] = await tx`SELECT accion_id FROM mejora_actividades WHERE id = ${cambios.accionDe}`;
    accionId = Number(o.accion_id);
  } else {
    let [r] = await tx`SELECT id FROM mejora_rondas WHERE hallazgo_id = ${hallazgoId} AND numero = 1`;
    if (!r) [r] = await tx`INSERT INTO mejora_rondas (hallazgo_id, numero) VALUES (${hallazgoId}, 1) RETURNING id`;
    const [ac] = await tx`INSERT INTO mejora_acciones (hallazgo_id, ronda_id, orden, tipo, descripcion)
      VALUES (${hallazgoId}, ${r.id}, 1, 'correctiva', 'Acción de prueba') RETURNING id`;
    accionId = Number(ac.id);
  }
  const fin = cambios?.fin ?? "2026-12-31";
  const [a] = await tx`INSERT INTO mejora_actividades (hallazgo_id, accion_id, orden, descripcion, responsable_id, inicio, fin_original, fin, estado, avance)
    VALUES (${hallazgoId}, ${accionId}, 1, 'Actividad de prueba', ${responsableId}, '2026-11-01',
      ${cambios?.aprobada === false ? null : fin}, ${fin}, ${cambios?.estado ?? "abierta"}, ${cambios?.avance ?? 0}) RETURNING id`;
  return Number(a.id);
}
