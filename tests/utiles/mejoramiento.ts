/**
 * Ayudantes de los tests de mejoramiento (Fase 15A). Corren dentro de una transacción que se revierte (`revertida`):
 * lo que crean aquí no sobrevive al test.
 */
import type { TransactionSql } from "postgres";
import { registrarArchivo } from "@/db/consultas/admin";
import type { OpcionesFlujo, SesionFlujo } from "@/db/consultas/flujo/contrato";
import { bloquearHallazgo } from "@/db/consultas/mejoramiento/flujo";
import {
  aceptarHallazgo,
  decidirAccionCorrectiva,
  rechazarHallazgo,
  registrarCorreccion,
  sostenerHallazgo,
} from "@/db/consultas/mejoramiento/recorrido";
import { registrarHallazgo, type DatosDeHallazgo } from "@/db/consultas/mejoramiento/registro";
import { lideresDeProceso } from "@/db/consultas/tramites";
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
export type EstadoDeEscena = "por_aceptar" | "rechazo" | "arbitraje" | "por_corregir" | "por_decidir" | "por_validar" | "por_formular";

/** La hora de todos los pasos de `hallazgoEn` (martes 17 de noviembre de 2026, 10:00 en Bogotá). */
export const HORA_DE_ESCENA = "2026-11-17T15:00:00Z";

/**
 * Un hallazgo que registra Control Interno (con `datosDeHallazgo` y `cambios`), llevado hasta `estado` por el dominio, nunca
 * por SQL: el líder lo acepta (o lo rechaza, y Control Interno lo sostiene), quien actúa por el proceso (el líder, o el
 * Admin SGC si el proceso no tiene) registra la corrección con su evidencia y el Admin SGC decide la acción correctiva
 * («no», salvo para llegar a «Por formular»). Lanza si el camino no lleva a `estado` (p. ej. una oportunidad no pasa por
 * «Por corregir»). Todo a `HORA_DE_ESCENA`.
 */
export async function hallazgoEn(
  tx: TransactionSql,
  b: BaseDeMejora,
  estado: EstadoDeEscena,
  cambios?: Partial<DatosDeHallazgo>,
): Promise<HallazgoBase> {
  const o = c(HORA_DE_ESCENA, tx);
  const { id } = await registrarHallazgo(b.control, datosDeHallazgo(b.procesoId, cambios), o);
  for (let paso = 0; paso < 8; paso++) {
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
        const quien = (await lideresDeProceso(h.procesoId, { sql: tx })).includes(b.lider.usuarioId) ? b.lider : b.admin;
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
      case "por_decidir":
        await decidirAccionCorrectiva(
          b.admin,
          {
            hallazgoId: id,
            requiere: estado === "por_formular",
            justificacion: estado === "por_formular" ? "Hay que analizar la causa raíz" : "Fue un hecho aislado y quedó corregido",
          },
          o,
        );
        break;
      default:
        throw new Error(`hallazgoEn: el hallazgo quedó en ${h.estado} y no lleva a ${estado}`);
    }
  }
  throw new Error(`hallazgoEn: no se llegó a ${estado}`);
}

/**
 * Una actividad (de la ronda 1) por SQL: las acciones y actividades llegan en las Tareas 12 a 14. Con `accionDe` (el id de
 * otra actividad) cuelga de la misma acción; si no, de una acción nueva. `aprobada` pone `fin_original`: el plan aprobado.
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
      ${cambios?.aprobada ? fin : null}, ${fin}, ${cambios?.estado ?? "abierta"}, ${cambios?.avance ?? 0}) RETURNING id`;
  return Number(a.id);
}
