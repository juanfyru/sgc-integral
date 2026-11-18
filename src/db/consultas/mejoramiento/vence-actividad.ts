/**
 * Cuándo vence una actividad del plan (spec 15 §14.1 y §14.3): la fecha para corregir si la verificación la devolvió; si no, su
 * fin vigente. Una sola regla para «Mis tareas», la pasada de vencimientos, la marca «Con algo vencido» de la lista y del
 * detalle, «Mis actividades», la página de la actividad, el botón «Escalar a Gerencia» y `escalarAGerencia`. Se compara contra el
 * día de hoy en la zona de la instalación. Módulo liviano: no importa nada del módulo.
 */
import type { Cliente } from "@/db/cliente";

/** El día en que vence la actividad, para el SQL sobre `alias` (una fecha `date`). */
export function venceLaActividad(sql: Cliente, alias: "a" | "va" = "a") {
  const t = sql.unsafe(alias);
  return sql`(CASE WHEN ${t}.verificacion = 'devuelta' AND ${t}.corregir_antes_de IS NOT NULL THEN ${t}.corregir_antes_de ELSE ${t}.fin END)`;
}
