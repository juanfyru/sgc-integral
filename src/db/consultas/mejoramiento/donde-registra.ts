/**
 * Dónde puede registrar un hallazgo una persona (spec 15 §7.1; Fase 15B, anexo §10.2): **la regla única**, en un solo lugar. El
 * proceso está en el alcance de quien registra (`alcanceProcesos`: el líder, sus procesos activos; los demás, todos) y está activo.
 * La aplican el registro, su edición y la carga (`revisarIdentificacion`, que lanza sus dos mensajes), el prellenado del registro y
 * el botón «Abrir hallazgo» de otras páginas (`procesoAdmiteRegistro`, sin lanzar), y añadir una ocurrencia (solo el alcance). El
 * permiso `mejora.registrar` lo exige cada camino antes; sin él no se llega aquí.
 *
 * Liviano: no importa nada del módulo (lo importan `registro.ts`, `citas.ts` y `prellenado.ts`).
 */
import { obtenerSql, type Cliente } from "@/db/cliente";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { alcanceProcesos, enAlcance, type Alcance } from "@/lib/alcance";
import { ErrorMejora } from "@/lib/mejoramiento/tipos";
import { ErrorPermiso } from "@/lib/permisos";

/** El proceso elegido no está activo (o no existe). */
export const ELIJA_UN_PROCESO_ACTIVO = "Elija un proceso activo";

type Quien = Pick<SesionFlujo, "usuarioId" | "rol">;

/**
 * Por qué no admite registrar en ese proceso, en el orden en que se mira: fuera del alcance de quien registra, o inactivo (o
 * inexistente); nulo si lo admite.
 */
async function rechazoDelProceso(sql: Cliente, alcance: Alcance, procesoId: number): Promise<"fuera_del_alcance" | "inactivo" | null> {
  if (!enAlcance(alcance, procesoId)) return "fuera_del_alcance";
  const [p] = await sql`SELECT activo FROM procesos WHERE id = ${procesoId}`;
  return p?.activo === true ? null : "inactivo";
}

/** Si se puede registrar en ese proceso con ese alcance (el de quien registra), sin lanzar: el botón y el prellenado. */
export async function procesoAdmiteRegistro(sql: Cliente, alcance: Alcance, procesoId: number): Promise<boolean> {
  return (await rechazoDelProceso(sql, alcance, procesoId)) === null;
}

/**
 * La misma regla, lanzando lo que el registro ha dicho siempre: fuera del alcance de quien registra, `ErrorPermiso`; un proceso
 * inactivo o que no existe, «Elija un proceso activo».
 */
export async function exigirProcesoDondeRegistra(sql: Cliente, sesion: Quien, procesoId: number): Promise<void> {
  const rechazo = await rechazoDelProceso(sql, await alcanceProcesos(sesion, { sql }), procesoId);
  if (rechazo === "fuera_del_alcance") throw new ErrorPermiso();
  if (rechazo === "inactivo") throw new ErrorMejora(ELIJA_UN_PROCESO_ACTIVO);
}

/**
 * Solo la primera mitad: el proceso está en el alcance de quien registra. La usa añadir una ocurrencia a un hallazgo que ya existe,
 * donde el proceso puede haberse desactivado después.
 */
export async function enElAlcanceDeRegistro(sesion: Quien, procesoId: number, opciones?: { sql?: Cliente }): Promise<boolean> {
  const sql = opciones?.sql ?? obtenerSql();
  return enAlcance(await alcanceProcesos(sesion, { sql }), procesoId);
}
