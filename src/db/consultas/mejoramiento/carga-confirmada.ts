/**
 * El formato firmado de un hallazgo cargado (spec 15 §15, Tarea 20): la evidencia de lo que se hizo en papel, un archivo del
 * hallazgo con rol `carga`. Mientras falta (`cargaConfirmada` falso), las actividades del plan no llegan a sus responsables (ni
 * tareas, ni avisos, ni «Mis actividades») y no se verifica. `cargaResuelta` es esa condición en SQL: una sola para las tareas, la
 * pasada de vencimientos y «Mis actividades».
 *
 * Al subirse el primer archivo con rol `carga`, `confirmarCarga` deja el evento `carga_confirmada` y su bitácora, y entrega el
 * plan como lo entrega su aprobación: un aviso a cada responsable de una actividad abierta («Tiene una actividad a su cargo») o, si
 * todas ya estaban terminadas («Por verificar»), el turno de quien verifica, con el plazo de verificar contado desde ese día.
 *
 * Módulo liviano: lo importa `archivos.ts`, que importa `admin.ts`; nada de lo que importa llega a `estructura.ts` ni a
 * `avisos-vencimiento.ts` (`tests/mejora-ciclos.test.ts`).
 */
import type { TransactionSql } from "postgres";
import type { Cliente } from "@/db/cliente";
import { registrarAuditoria } from "@/db/consultas/admin";
import { avisarA } from "@/db/consultas/avisar";
import { cargaResuelta } from "@/lib/alcance";
import { venceEn } from "@/lib/mejoramiento/plazos";
import { rutaDeActividad } from "@/lib/mejoramiento/rutas";
import { ACTIVIDAD_ASIGNADA, cuerpoDeActividadAsignada } from "@/lib/mejoramiento/textos";
import { ErrorMejora } from "@/lib/mejoramiento/tipos";
import { avisarDelTurno, ENTIDAD_ACTIVIDAD, ENTIDAD_HALLAZGO } from "./avisos";
import { contextoDeMejora } from "./config";
import { aBase, dejarEvento } from "./flujo";

/** Lo que dice `verificarImplementacion` de un hallazgo cargado sin su formato firmado. */
export const FALTA_EL_ESCANEO = "Adjunte primero el formato firmado de la carga";

/** Lo que dice la página de un hallazgo cargado sin su formato firmado. */
export const FALTA_EL_FORMATO = "Falta el formato firmado";

/** Si el hallazgo tiene su formato firmado: un archivo suyo con rol `carga`. Uno que no es cargado no lo tiene nunca. */
export async function cargaConfirmada(sql: Cliente, hallazgoId: number): Promise<boolean> {
  const [f] = await sql`SELECT 1 FROM archivos
    WHERE contexto = 'mejora_hallazgo' AND contexto_id = ${hallazgoId} AND rol = 'carga' AND version_id IS NULL LIMIT 1`;
  return f !== undefined;
}

// La condición en SQL sobre el hallazgo `h` vive en `src/lib/alcance.ts`, que decide también quién lo ve por su actividad.
export { cargaResuelta };

/** Si es un hallazgo cargado que todavía espera su formato firmado: su plan no llegó a nadie (spec §15). */
export async function cargaPendiente(sql: Cliente, hallazgoId: number): Promise<boolean> {
  const [f] = await sql`SELECT cargado FROM mejora_hallazgos WHERE id = ${hallazgoId}`;
  return f?.cargado === true && !(await cargaConfirmada(sql, hallazgoId));
}

/**
 * Lo que solo se hace con el plan entregado: verificar y lo de sus actividades (seguimientos, terminar, pedir y decidir un ajuste,
 * escalar a Gerencia). Lanza `FALTA_EL_ESCANEO` en una carga sin su formato firmado. Va después de la regla de persona del acto:
 * a quien no puede darlo, el acto le responde lo de siempre.
 */
export async function exigirCargaConfirmada(sql: Cliente, hallazgoId: number): Promise<void> {
  if (await cargaPendiente(sql, hallazgoId)) throw new ErrorMejora(FALTA_EL_ESCANEO);
}

/**
 * Confirma la carga con el primer formato firmado (lo llama `exigirDestinoAbierto`, dentro de la transacción de
 * `registrarArchivo`, con el hallazgo ya `FOR UPDATE`): dos escaneos a la vez se ordenan y el segundo ve el evento del primero.
 * Una sola vez: con el evento ya puesto no hace nada. No avisa a quien sube el escaneo. `ahora` es la hora del evento y desde la
 * que se cuenta el plazo de verificar (la de la subida; una semilla la inyecta).
 */
export async function confirmarCarga(tx: TransactionSql, hallazgoId: number, usuarioId: number, ahora: Date): Promise<void> {
  const [ya] = await tx`SELECT 1 FROM mejora_eventos WHERE hallazgo_id = ${hallazgoId} AND tipo = 'carga_confirmada' LIMIT 1`;
  if (ya) return;
  const [f] = await tx`SELECT id, codigo, clase, criticidad, origen, estado, ronda, proceso_id, reincidente_de, correccion_requerida,
      accion_requerida, resultado_cierre, registrado_por, titulo
    FROM mejora_hallazgos WHERE id = ${hallazgoId}`;
  const h = aBase(f);
  await dejarEvento(tx, { hallazgoId: h.id, ronda: h.ronda, tipo: "carga_confirmada", usuarioId, ocurrioEn: ahora });
  await registrarAuditoria(tx, {
    usuarioId,
    accion: "mejora_carga_confirmada",
    entidad: ENTIDAD_HALLAZGO,
    entidadId: h.id,
    detalle: { codigo: h.codigo },
  });
  if (h.estado === "por_verificar") {
    // El plazo de verificar corre desde que se puede verificar: hasta hoy, sin el formato, no se podía.
    const c = await contextoDeMejora(tx, ahora);
    await tx`UPDATE mejora_hallazgos SET vence_en = ${venceEn("verificar", ahora, c)}, aviso_vencido_en = NULL, escalado_en = NULL
      WHERE id = ${h.id}`;
    await avisarDelTurno(tx, h, f.titulo as string, usuarioId);
    return;
  }
  const actividades = await tx`SELECT a.id, a.responsable_id, a.descripcion, to_char(a.fin, 'YYYY-MM-DD') AS fin
    FROM mejora_actividades a
    JOIN mejora_acciones ac ON ac.id = a.accion_id
    JOIN mejora_rondas r ON r.id = ac.ronda_id
    JOIN usuarios u ON u.id = a.responsable_id AND u.activo
    WHERE a.hallazgo_id = ${h.id} AND r.numero = ${h.ronda} AND a.fin_original IS NOT NULL AND a.estado IN ('abierta', 'en_proceso')
      AND a.responsable_id <> ${usuarioId}
    ORDER BY a.id`;
  for (const a of actividades) {
    await avisarA(
      tx,
      { tipo: "mejora.actividad_asignada", titulo: ACTIVIDAD_ASIGNADA, enlace: rutaDeActividad(Number(a.id)), entidad: ENTIDAD_ACTIVIDAD, entidadId: Number(a.id) },
      [{ usuarioId: Number(a.responsable_id), cuerpo: cuerpoDeActividadAsignada(a.descripcion as string, a.fin as string) }],
    );
  }
}
