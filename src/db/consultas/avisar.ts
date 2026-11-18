/**
 * La inserción de avisos que comparten las pasadas de vencimientos y los actos de cada módulo. Vive aparte de
 * `avisos-vencimiento.ts` (que la reexporta) porque aquel importa `estructura.ts` para los jefes: lo que solo avisa no la
 * necesita, y el escaneo de la carga de un hallazgo avisa desde `registrarArchivo` (`admin.ts`), que `estructura.ts` importa
 * (`tests/mejora-ciclos.test.ts`).
 */
import type { TransactionSql } from "postgres";

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
