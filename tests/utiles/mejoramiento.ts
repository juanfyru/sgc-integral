/**
 * Ayudantes de los tests de mejoramiento (Fase 15A). Corren dentro de una transacción que se revierte (`revertida`):
 * lo que crean aquí no sobrevive al test.
 */
import type { TransactionSql } from "postgres";
import type { OpcionesFlujo, SesionFlujo } from "@/db/consultas/flujo/contrato";
import type { DatosDeHallazgo } from "@/db/consultas/mejoramiento/registro";
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

/** Una acción y una actividad (de la ronda 1) por SQL: las acciones y actividades llegan en las Tareas 12 a 14. */
export async function actividadPorSql(
  tx: TransactionSql,
  hallazgoId: number,
  responsableId: number,
  cambios?: { fin?: string; estado?: string },
): Promise<number> {
  let [r] = await tx`SELECT id FROM mejora_rondas WHERE hallazgo_id = ${hallazgoId} AND numero = 1`;
  if (!r) [r] = await tx`INSERT INTO mejora_rondas (hallazgo_id, numero) VALUES (${hallazgoId}, 1) RETURNING id`;
  const [ac] = await tx`INSERT INTO mejora_acciones (hallazgo_id, ronda_id, orden, tipo, descripcion)
    VALUES (${hallazgoId}, ${r.id}, 1, 'correctiva', 'Acción de prueba') RETURNING id`;
  const [a] = await tx`INSERT INTO mejora_actividades (hallazgo_id, accion_id, orden, descripcion, responsable_id, inicio, fin, estado)
    VALUES (${hallazgoId}, ${ac.id}, 1, 'Actividad de prueba', ${responsableId}, '2026-11-01',
      ${cambios?.fin ?? "2026-12-31"}, ${cambios?.estado ?? "abierta"}) RETURNING id`;
  return Number(a.id);
}
