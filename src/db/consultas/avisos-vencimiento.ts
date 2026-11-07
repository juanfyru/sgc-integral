/**
 * Lo que comparten la revisión de vencimientos de los trámites (`vencimientos.ts`) y la de la distribución
 * (`distribucion/vencimientos.ts`): la inserción de avisos y los jefes a quienes se escala. Vive aparte para que
 * ninguno de los dos módulos importe al otro.
 */
import type { TransactionSql } from "postgres";
import { supervisoresDe } from "@/db/consultas/estructura";

export type Destinatario = { usuarioId: number; cuerpo: string };

/** Una sola inserción: una por destinatario. Sin enlace, el aviso no abre la entidad. */
export async function avisarA(
  tx: TransactionSql,
  aviso: { tipo: string; titulo: string; enlace: string | null; entidad: string; entidadId: number },
  destinatarios: Destinatario[],
): Promise<void> {
  await tx`INSERT INTO notificaciones (usuario_id, tipo, titulo, cuerpo, enlace, entidad, entidad_id)
    SELECT u, ${aviso.tipo}, ${aviso.titulo}, c, ${aviso.enlace}, ${aviso.entidad}, ${aviso.entidadId}
    FROM unnest(
      ${tx.array(destinatarios.map((d) => d.usuarioId))}::int[],
      ${tx.array(destinatarios.map((d) => d.cuerpo))}::text[]
    ) AS a(u, c)`;
}

/** Cada jefe, sin repetir, con los subalternos suyos que tienen el paso. */
export async function jefesDe(tx: TransactionSql, responsables: number[]): Promise<Map<number, string[]>> {
  const filas = await tx`SELECT id, nombre FROM usuarios WHERE id = ANY(${responsables}) ORDER BY nombre, id`;
  const jefes = new Map<number, string[]>();
  for (const { id, nombre } of filas) {
    for (const jefe of await supervisoresDe(Number(id), { sql: tx })) {
      jefes.set(jefe.id, [...(jefes.get(jefe.id) ?? []), nombre]);
    }
  }
  return jefes;
}
