/**
 * Ayudantes de los tests de mejoramiento (Fase 15A). Corren dentro de una transacción que se revierte (`revertida`):
 * lo que crean aquí no sobrevive al test.
 */
import type { TransactionSql } from "postgres";
import { registrarArchivo } from "@/db/consultas/admin";
import { analizar } from "@/db/consultas/indicadores/analisis";
import { asegurarMediciones, reportar } from "@/db/consultas/indicadores/mediciones";
import type { OpcionesFlujo, SesionFlujo } from "@/db/consultas/flujo/contrato";
import { guardarAnalisis, guardarCausas, responderPreguntas } from "@/db/consultas/mejoramiento/analisis";
import { aprobarPlan, enviarPlan, firmarRevision } from "@/db/consultas/mejoramiento/aprobacion";
import { registrarSeguimiento, terminarActividad } from "@/db/consultas/mejoramiento/actividades";
import type { DatosDeCarga } from "@/db/consultas/mejoramiento/carga";
import { bloquearHallazgo } from "@/db/consultas/mejoramiento/flujo";
import {
  cerrarHallazgo,
  datosDeEvaluacion,
  evaluarEficacia,
  fechaMinimaDe,
  huellaDeLoVisto,
  verificarImplementacion,
} from "@/db/consultas/mejoramiento/verificacion";
import { guardarAccion, guardarCriterio } from "@/db/consultas/mejoramiento/plan";
import { crearPlan, type DatosDePlan } from "@/db/consultas/mejoramiento/planes";
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
import { fechaEnZona } from "@/lib/tramites/plazos";
import { zonaHoraria } from "@/lib/zona-horaria";
import { indicadorDePrueba, type IndicadorDePrueba, type OpcionesIndicadorDePrueba } from "./indicadores";
import { procesoNuevo } from "./mixto";
import { sesionDe, usuarioDePrueba } from "./tramites";
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
  | "en_ejecucion"
  | "por_verificar"
  | "en_espera"
  | "por_cerrar"
  | "cerrado";

/** Los estados que pasan por el plan: para llegar a ellos, la decisión es «sí». */
const CON_PLAN: readonly EstadoDeEscena[] = [
  "por_formular",
  "en_revision",
  "en_aprobacion",
  "en_ejecucion",
  "por_verificar",
  "en_espera",
  "por_cerrar",
  "cerrado",
];

/** Las lecciones aprendidas con que `hallazgoEn` cierra un hallazgo. */
export const LECCIONES_DE_ESCENA = "Asignar el registro a cada turno evita que se pierda en el cambio de turno";

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
    // Las de la ronda en curso: en la ronda 2 las de la 1 siguen ahí, congeladas.
    causaIds = (
      await tx`SELECT c.id FROM mejora_causas c JOIN mejora_rondas r ON r.id = c.ronda_id
        WHERE c.hallazgo_id = ${hallazgoId} AND r.numero = ${h.ronda} ORDER BY c.orden, c.id`
    ).map((f) => Number(f.id));
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
 * ronda no tiene acciones, con `plan` como sus opciones) y lo envía; el Admin SGC lo revisa (otro Admin SGC, si elaboró el
 * de la base), con «requiere recursos» solo para llegar a «En aprobación»; Gerencia lo aprueba; y, para llegar a «Por
 * verificar», cada responsable termina su actividad (`terminarTodas`). Control Interno verifica la implementación con todas
 * las actividades conformes («En espera de eficacia») y la evalúa «eficaz» («Por cerrar»), y el Admin SGC la cierra («Cerrado»).
 * Lanza si el camino no lleva a `estado` (p. ej. una oportunidad no pasa por «Por corregir»). Todo a `HORA_DE_ESCENA`, salvo
 * la evaluación y el cierre: «eficaz» se registra desde la fecha mínima, así que van ese día (`fechaMinimaDe`) a las 10:00 en
 * Bogotá. Un hallazgo cerrado solo dentro de `revertida`.
 */
export async function hallazgoEn(
  tx: TransactionSql,
  b: BaseDeMejora,
  estado: EstadoDeEscena,
  cambios?: Partial<DatosDeHallazgo>,
  plan?: Parameters<typeof planDePrueba>[3],
): Promise<HallazgoBase> {
  const o = c(HORA_DE_ESCENA, tx);
  const { id } = await registrarHallazgo(b.control, datosDeHallazgo(b.procesoId, cambios), o);
  for (let paso = 0; paso < 16; paso++) {
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
        const formulador = Number(acciones) === 0 ? (await planDePrueba(tx, b, id, plan)).formulador : await formuladorDe(tx, b, h.procesoId);
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
      case "en_ejecucion":
        await terminarTodas(tx, b, id, HORA_DE_ESCENA);
        break;
      case "por_verificar": {
        const terminadas = await tx`SELECT a.id FROM mejora_actividades a
          JOIN mejora_acciones ac ON ac.id = a.accion_id
          JOIN mejora_rondas r ON r.id = ac.ronda_id
          WHERE a.hallazgo_id = ${id} AND r.numero = ${h.ronda} AND a.estado = 'terminada'
          ORDER BY a.id`;
        await verificarImplementacion(
          b.control,
          { hallazgoId: id, actividades: terminadas.map((a) => ({ id: Number(a.id), conforme: true })), metodos: ["evidencias"] },
          o,
        );
        break;
      }
      case "en_espera": {
        const fm = await fechaMinimaDe(tx, id, zonaHoraria());
        if (!fm) throw new Error("hallazgoEn: el hallazgo en espera no tiene fecha mínima de eficacia");
        const evalua = c(`${fm.minima}T15:00:00Z`, tx);
        await evaluarEficacia(
          b.control,
          {
            hallazgoId: id,
            resultado: "eficaz",
            criterios: ["no_recurrencia"],
            desde: fm.r,
            hasta: fm.minima,
            justificacion: "No se repitió el hecho desde que terminó el plan de prueba",
            confirmaOcurrencias: true,
            vistoHuella: huellaDeLoVisto(await datosDeEvaluacion(b.control, id, evalua)),
            credenciales: { clave: "ok" },
          },
          evalua,
        );
        break;
      }
      case "por_cerrar": {
        // El mismo día en que se evaluó.
        const [r] = await tx`SELECT evaluada_en FROM mejora_rondas WHERE hallazgo_id = ${id} AND numero = ${h.ronda}`;
        await cerrarHallazgo(
          b.admin,
          { hallazgoId: id, lecciones: LECCIONES_DE_ESCENA, credenciales: { clave: "ok" } },
          c((r.evaluada_en as Date).toISOString(), tx),
        );
        break;
      }
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

/** Un archivo de evidencia del hallazgo (el oficio de la respuesta al ente, entre otros), subido como `usuarioId` por el dominio. */
export async function evidenciaDelHallazgo(tx: TransactionSql, hallazgoId: number, usuarioId: number): Promise<number> {
  archivos += 1;
  const { id } = await registrarArchivo(
    {
      versionId: null,
      rol: "evidencia",
      ruta: `mejoramiento/hallazgos/${hallazgoId}/${Date.now()}-${archivos}-evidencia.pdf`,
      nombreOriginal: `oficio-${archivos}.pdf`,
      extension: "pdf",
      mime: "application/pdf",
      tamanoBytes: 10,
      hashSha256: "f".repeat(64),
      contexto: "mejora_hallazgo",
      contextoId: hallazgoId,
    },
    usuarioId,
    { sql: tx },
  );
  return Number(id);
}

/**
 * Deja sin nada que avisar lo que ya hay de mejoramiento en la base (la de trabajo trae hallazgos de las comprobaciones en el
 * navegador, algunos con pasos vencidos): `revisarVencimientos` los recorre todos y un test cuenta solo lo suyo. Pone las marcas
 * de aviso que falten en los hallazgos abiertos, sus actividades y sus ajustes, y en los reportes por clasificar; el
 * recordatorio, en una fecha lejana, para que tampoco se cumpla con un `ahora` de años después. Lo terminado no se toca (el
 * trigger del hallazgo terminado lo rechaza, y nada de lo terminado avisa). Se llama antes de crear los datos del test.
 */
export async function silenciarMejoramiento(tx: TransactionSql): Promise<void> {
  const abiertos = tx`SELECT id FROM mejora_hallazgos WHERE estado NOT IN ('cerrado', 'rechazado', 'anulado')`;
  await tx`UPDATE mejora_hallazgos SET aviso_vencido_en = coalesce(aviso_vencido_en, now()), escalado_en = coalesce(escalado_en, now()),
      aviso_evaluar_en = coalesce(aviso_evaluar_en, now())
    WHERE id IN (${abiertos}) AND (aviso_vencido_en IS NULL OR escalado_en IS NULL OR aviso_evaluar_en IS NULL)`;
  await tx`UPDATE mejora_actividades SET aviso_vencido_en = coalesce(aviso_vencido_en, now()), escalado_en = coalesce(escalado_en, now()),
      recordatorio_en = '2999-12-31T00:00:00Z'
    WHERE hallazgo_id IN (${abiertos}) AND estado IN ('abierta', 'en_proceso')`;
  await tx`UPDATE mejora_ajustes SET aviso_vencido_en = coalesce(aviso_vencido_en, now())
    WHERE hallazgo_id IN (${abiertos}) AND estado = 'pendiente' AND aviso_vencido_en IS NULL`;
  await tx`UPDATE mejora_reportes SET aviso_vencido_en = coalesce(aviso_vencido_en, now()), escalado_en = coalesce(escalado_en, now())
    WHERE estado = 'recibido' AND (aviso_vencido_en IS NULL OR escalado_en IS NULL)`;
}

/**
 * Lo que trae un hallazgo ya en curso (spec §15), con las fechas de su papel en 2025: una no conformidad de criticidad media que
 * requirió corrección, con un análisis de 5 porqués y una causa, y una acción correctiva con dos actividades de `responsableId`: la
 * A1.1 ya terminada (el 28 de enero de 2026) y la A1.2 al 40 %, que termina el 15 de diciembre de 2026. El plan lo aprobó en papel,
 * el 4 de noviembre de 2025, el Coordinador del SGC. `cambios` reemplaza lo que diga.
 */
export function datosDeCarga(procesoId: number, responsableId: number, cambios?: Partial<DatosDeCarga>): DatosDeCarga {
  return {
    ...datosDeHallazgo(procesoId, { detectadoEn: "2025-10-06" }),
    registradoEnPapel: "2025-10-08",
    correccion: { requerida: true, descripcion: "Se diligenciaron los formatos pendientes con el turno", implementadaEn: "2025-10-15" },
    analisis: { metodo: "cinco_porques", causas: ["El procedimiento no asigna el registro al turno de noche"] },
    acciones: [
      {
        tipo: "correctiva",
        descripcion: "Actualizar el procedimiento de entrega de turno",
        causas: [1],
        actividades: [
          { descripcion: "Redactar la versión nueva del procedimiento", responsableId, inicio: "2025-11-05", fin: "2026-01-30", avance: 100, terminadaEn: "2026-01-28" },
          { descripcion: "Capacitar a los turnos de noche", responsableId, inicio: "2026-02-01", fin: "2026-12-15", avance: 40 },
        ],
      },
    ],
    criterios: ["no_recurrencia"],
    aprobacion: { nombre: "Marta Ríos", cargo: "Coordinadora del SGC", fecha: "2025-11-04", rol: "admin_sgc" },
    ...cambios,
  };
}

/**
 * El formato firmado de un hallazgo cargado (rol `carga`), subido como `usuarioId` por el camino del dominio (`registrarArchivo`);
 * con `ahora`, a esa hora (la de su evento `carga_confirmada` y la del plazo que pone).
 */
export async function escaneoDeLaCarga(tx: TransactionSql, hallazgoId: number, usuarioId: number, ahora?: string): Promise<number> {
  archivos += 1;
  const { id } = await registrarArchivo(
    {
      versionId: null,
      rol: "carga",
      ruta: `mejoramiento/hallazgos/${hallazgoId}/${Date.now()}-${archivos}-carga.pdf`,
      nombreOriginal: `formato-firmado-${archivos}.pdf`,
      extension: "pdf",
      mime: "application/pdf",
      tamanoBytes: 10,
      hashSha256: "a".repeat(64),
      contexto: "mejora_hallazgo",
      contextoId: hallazgoId,
    },
    usuarioId,
    { sql: tx, ...(ahora ? { ahora: new Date(ahora) } : {}) },
  );
  return Number(id);
}

/** Un archivo de evidencia de una actividad, subido como `usuarioId` por el camino del dominio (`registrarArchivo`). */
export async function evidenciaDeActividad(tx: TransactionSql, actividadId: number, usuarioId: number, nombre?: string): Promise<number> {
  archivos += 1;
  const { id } = await registrarArchivo(
    {
      versionId: null,
      rol: "evidencia",
      ruta: `mejoramiento/actividades/${actividadId}/${Date.now()}-${archivos}-evidencia.pdf`,
      nombreOriginal: nombre ?? `evidencia-${archivos}.pdf`,
      extension: "pdf",
      mime: "application/pdf",
      tamanoBytes: 10,
      hashSha256: "e".repeat(64),
      contexto: "mejora_actividad",
      contextoId: actividadId,
    },
    usuarioId,
    { sql: tx },
  );
  return Number(id);
}

/**
 * Un archivo de un plan de mejoramiento (Fase 15B, anexo §3.7: el oficio de una respuesta al ente, el informe del ente…), subido como
 * `usuarioId` por el camino del dominio (`registrarArchivo`); con `ahora`, a esa hora (la de su evento `archivo`).
 */
export async function archivoDelPlan(
  tx: TransactionSql,
  planId: number,
  usuarioId: number,
  x?: { nombre?: string; ahora?: string },
): Promise<number> {
  archivos += 1;
  const { id } = await registrarArchivo(
    {
      versionId: null,
      rol: "evidencia",
      ruta: `mejoramiento/planes/${planId}/${Date.now()}-${archivos}-oficio.pdf`,
      nombreOriginal: x?.nombre ?? `oficio-del-plan-${archivos}.pdf`,
      extension: "pdf",
      mime: "application/pdf",
      tamanoBytes: 10,
      hashSha256: "b".repeat(64),
      contexto: "mejora_plan",
      contextoId: planId,
    },
    usuarioId,
    { sql: tx, ...(x?.ahora ? { ahora: new Date(x.ahora) } : {}) },
  );
  return Number(id);
}

/** La sesión de un usuario por su id: la de la base si es uno de ellos; si no, la que se lee de la BD. */
async function sesionPorId(tx: TransactionSql, b: BaseDeMejora, usuarioId: number): Promise<SesionFlujo> {
  const deLaBase = [b.admin, b.control, b.gerencia, b.lider, b.consulta].find((s) => s.usuarioId === usuarioId);
  if (deLaBase) return deLaBase;
  const [u] = await tx`SELECT usuario FROM usuarios WHERE id = ${usuarioId}`;
  return sesionDe(tx, u.usuario as string);
}

/**
 * Cada actividad sin terminar de la ronda en curso, por el dominio y a `ahora`: su responsable registra un seguimiento con el
 * avance en 100, sube un archivo de evidencia y la termina. La última que termina lleva el hallazgo a «Por verificar».
 */
export async function terminarTodas(tx: TransactionSql, b: BaseDeMejora, hallazgoId: number, ahora: string): Promise<void> {
  const o = c(ahora, tx);
  const dia = fechaEnZona(new Date(ahora), zonaHoraria());
  const pendientes = await tx`SELECT a.id, a.responsable_id FROM mejora_actividades a
    JOIN mejora_acciones ac ON ac.id = a.accion_id
    JOIN mejora_rondas r ON r.id = ac.ronda_id
    JOIN mejora_hallazgos h ON h.id = a.hallazgo_id AND h.ronda = r.numero
    WHERE a.hallazgo_id = ${hallazgoId} AND a.estado IN ('abierta', 'en_proceso')
    ORDER BY a.id`;
  for (const p of pendientes) {
    const actividadId = Number(p.id);
    const responsable = await sesionPorId(tx, b, Number(p.responsable_id));
    await registrarSeguimiento(responsable, { actividadId, fecha: dia, realizado: "Se terminó la actividad del plan de prueba", avance: 100 }, o);
    await evidenciaDeActividad(tx, actividadId, responsable.usuarioId);
    await terminarActividad(responsable, { actividadId }, o);
  }
}

/**
 * Un plan de mejoramiento (Fase 15B) que crea `sesion` por el dominio (`crearPlan`), a `ahora` (`HORA_DE_ESCENA` por omisión):
 * una auditoría interna del 10 de noviembre de 2026, de la vigencia 2099 por omisión (lejana: ningún plan confirmado la usa, así
 * que el primero de un test es `PM-2099-01`). `cambios` reemplaza lo que diga.
 */
export async function planDeMejoraDePrueba(
  tx: TransactionSql,
  sesion: SesionFlujo,
  cambios?: Partial<DatosDePlan>,
  ahora?: string,
): Promise<{ id: number; codigo: string }> {
  return crearPlan(
    sesion,
    { nombre: "Auditoría interna de calidad de noviembre", origen: "auditoria_interna", fechaEvento: "2026-11-10", vigencia: 2099, ...cambios },
    c(ahora ?? HORA_DE_ESCENA, tx),
  );
}

let objetivos = 0;

/** Un objetivo del maestro (Fase 15B), de calidad y activo por omisión. Solo dentro de `revertida`. */
export async function objetivoDePrueba(tx: TransactionSql, activo = true): Promise<{ id: number; enunciado: string }> {
  objetivos += 1;
  const enunciado = `Objetivo de prueba ${Date.now()}-${objetivos}`;
  const [f] = await tx`INSERT INTO objetivos (clase, enunciado, orden, activo) VALUES ('calidad', ${enunciado}, 999, ${activo}) RETURNING id`;
  return { id: Number(f.id), enunciado };
}

/** La medición marcada de `medicionMarcada`: la de octubre de 2026 de su indicador, con quien la mide y quien la analiza. */
export type MedicionMarcada = {
  ind: IndicadorDePrueba;
  medicionId: number;
  mide: SesionFlujo;
  analiza: SesionFlujo;
  /** Su fecha límite, para reportar y para analizar (la que guarda la medición). */
  venceEn: Date;
};

/** La causa y la acción propuesta con que `medicionMarcada` analiza la medición (las dos partes que pide un Crítico). */
export const ANALISIS_DE_LA_MARCA = {
  causa: "Dos de cinco agendas estuvieron cerradas por incapacidad",
  accionPropuesta: "Definir un médico de reemplazo y abrir agenda los sábados",
};

/**
 * Una medición ordinaria en Crítico, con la marca «Requiere acción de mejora» puesta por el dominio (Fase 15B, anexo §6): un indicador
 * mensual activo nuevo (`indicadorDePrueba`, meta 90 y Crítico por debajo de 63, aprobado en enero de 2026 y medido desde octubre),
 * del proceso `procesoId` si llega, con quien lo mide y quien lo analiza (dos personas de Consulta designadas); abre sus periodos a
 * `ahora` y reporta octubre de 2026 con 10 de 100 (10 %). Con `analizada`, quien analiza escribe la causa y la acción propuesta
 * (`ANALISIS_DE_LA_MARCA`). Con `vence`, la fecha límite de la medición pasa a ser esa (por SQL: es lo único que no sale del
 * dominio). Todo a `ahora`. Solo dentro de `revertida`: deja una ficha aprobada.
 */
export async function medicionMarcada(
  tx: TransactionSql,
  x: { ahora: string; analizada?: boolean; vence?: string; procesoId?: number; indicador?: OpcionesIndicadorDePrueba; valores?: { A: string; B: string } },
): Promise<MedicionMarcada> {
  const ahora = new Date(x.ahora);
  const mide = await usuarioDePrueba(tx, { rol: "consulta" });
  const analiza = await usuarioDePrueba(tx, { rol: "consulta" });
  const ind = await indicadorDePrueba(tx, {
    periodicidad: "mensual",
    inicioMedicion: "2026-10",
    aprobadaEn: new Date("2026-01-15T15:00:00Z"),
    mide: [mide.usuarioId],
    analiza: [analiza.usuarioId],
    ...(x.procesoId !== undefined ? { procesoId: x.procesoId } : {}),
    ...x.indicador,
  });
  await asegurarMediciones({ sql: tx, ahora, indicadorId: ind.id });
  const [m] = await tx`SELECT id FROM mediciones WHERE indicador_id = ${ind.id} AND periodo = '2026-10'`;
  const medicionId = Number(m.id);
  if (x.vence) await tx`UPDATE mediciones SET vence_en = ${new Date(x.vence)} WHERE id = ${medicionId}`;
  const valores = x.valores ?? { A: "10", B: "100" };
  await reportar(mide, { medicionId, valores, parcial: false, confirmado: true }, { sql: tx, ahora });
  if (x.analizada) await analizar(analiza, { medicionId, ...ANALISIS_DE_LA_MARCA }, { sql: tx, ahora });
  const [f] = await tx`SELECT vence_en FROM mediciones WHERE id = ${medicionId}`;
  return { ind, medicionId, mide, analiza, venceEn: f.vence_en as Date };
}
