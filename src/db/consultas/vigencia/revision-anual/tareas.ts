/**
 * La tarea de la campaña en «Mis tareas» (spec 13C §9.6 y §13.1): «Revisar los documentos de <proceso> (N
 * pendientes)», calculada del estado, por cada proceso de la revisión abierta que es de la persona con la regla F13A-DC2
 * (sus líderes, o los Admin SGC si no tiene líder activo). N son los documentos sin decisión más uno si falta confirmar
 * el normograma; vence con la campaña. Nombra el proceso y el conteo, nunca un documento.
 */
import { obtenerSql } from "@/db/cliente";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { cuenta } from "@/lib/plural";
import type { Tarea } from "@/lib/tareas";
import { procesosDeLaPersona, sinDecisionDelProceso, type Opciones } from "./comun";

/** Una sola sentencia, solo para quien lidera procesos o es Admin SGC; para los demás, ninguna. */
export async function tareasDeRevision(sesion: SesionFlujo, opciones?: Opciones): Promise<Tarea[]> {
  if (sesion.rol !== "lider_proceso" && sesion.rol !== "admin_sgc") return [];
  const sql = opciones?.sql ?? obtenerSql();
  const filas = await sql`
    SELECT ra.id AS revision_id, ra.anio, ra.vence_en, p.id AS proceso_id, p.nombre AS proceso,
      rap.normograma_resultado IS NULL AS falta_normograma, ${sinDecisionDelProceso(sql, sql`ra.id`)} AS sin_decision
    FROM revisiones_anuales ra
    JOIN revision_anual_procesos rap ON rap.revision_id = ra.id
    JOIN procesos p ON p.id = rap.proceso_id
    WHERE ra.estado = 'abierta' AND ${procesosDeLaPersona(sql, sesion)}
    ORDER BY p.nombre, p.id`;
  return filas.flatMap((f) => {
    const pendientes = Number(f.sin_decision) + (f.falta_normograma ? 1 : 0);
    if (pendientes === 0) return [];
    const procesoId = Number(f.proceso_id);
    return [
      {
        id: `revision:${Number(f.revision_id)}:${procesoId}`,
        modulo: "documentos" as const,
        titulo: `Revisar los documentos de ${f.proceso} (${cuenta(pendientes, "pendiente", "pendientes")})`,
        detalle: `Revisión anual ${Number(f.anio)}`,
        vence: new Date(f.vence_en as string),
        enlace: `/vigencia/revision-anual?proceso=${procesoId}`,
      },
    ];
  });
}
