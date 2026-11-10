import type { TransactionSql } from "postgres";
import { obtenerConfigDocumental } from "@/db/consultas/config-documental";
import { crearNotificacion } from "@/db/consultas/notificaciones";
import { numeroDeCopia } from "@/lib/distribucion/copias";
import type { MotivoPorRecoger } from "@/lib/distribucion/tipos";
import { fechaLimite } from "@/lib/tramites/plazos";
import { zonaHoraria } from "@/lib/zona-horaria";
import { superarAcuses } from "./acuses";
import { evento } from "./eventos-copia";

const CIERRE_DEL_AVISO: Record<MotivoPorRecoger, (nuevaVersion: number | null) => string> = {
  nueva_version: (n) => (n === null ? "la versión fue reemplazada" : `la versión ${n} es la vigente desde hoy`),
  eliminado: () => "el documento fue eliminado",
  carga_deshecha: () => "la carga se deshizo",
  retirado: () => "el documento externo fue retirado",
};

/**
 * El único punto de enganche de lo que depende de que una versión deje de estar vigente (publicar una nueva,
 * eliminar el documento, deshacer la carga). Corre dentro de la misma transacción que cambia la versión.
 * Recoge las copias controladas vivas y supera los acuses y la socialización pendientes.
 */
export async function alDejarDeSerVigente(
  tx: TransactionSql,
  versionId: number,
  motivo: MotivoPorRecoger,
  ahora: Date,
  opciones?: { nuevaVersionId?: number; actorId?: number },
): Promise<{ copiasPorRecoger: number }> {
  const { copiasPorRecoger } = await recogerCopias(tx, versionId, motivo, ahora, opciones);
  await superarAcuses(tx, versionId, ahora, motivo);
  // Una socialización que nadie registró antes de que llegara otra versión ya no se pide.
  await tx`UPDATE socializaciones_requeridas SET superada_en = ${ahora}
    WHERE version_id = ${versionId} AND cumplida_en IS NULL AND superada_en IS NULL`;
  return { copiasPorRecoger };
}

async function recogerCopias(
  tx: TransactionSql,
  versionId: number,
  motivo: MotivoPorRecoger,
  ahora: Date,
  opciones?: { nuevaVersionId?: number; actorId?: number },
): Promise<{ copiasPorRecoger: number }> {
  const copias = await tx`
    SELECT cc.id, cc.numero, cc.estado, v.numero AS version, d.codigo,
           pu.nombre AS punto, pu.responsable_id AS responsable_actual
    FROM copias_controladas cc
    JOIN documento_versiones v ON v.id = cc.version_id
    JOIN documentos d ON d.id = v.documento_id
    JOIN puntos_uso pu ON pu.id = cc.punto_uso_id
    WHERE cc.version_id = ${versionId} AND cc.estado IN ('emitida', 'recibida')
    ORDER BY cc.id
    FOR UPDATE OF cc`;
  if (copias.length === 0) return { copiasPorRecoger: 0 };

  let nuevaVersion: number | null = null;
  if (opciones?.nuevaVersionId !== undefined) {
    const [nueva] = await tx`SELECT numero FROM documento_versiones WHERE id = ${opciones.nuevaVersionId}`;
    nuevaVersion = nueva ? Number(nueva.numero) : null;
  }
  const { plazoRecogidaDias } = (await obtenerConfigDocumental({ sql: tx })).distribucion;
  const venceEn = fechaLimite(ahora, plazoRecogidaDias, zonaHoraria());

  for (const c of copias) {
    const id = Number(c.id);
    await tx`UPDATE copias_controladas
      SET estado = 'por_recoger', por_recoger_en = ${ahora}, motivo_por_recoger = ${motivo}, vence_en = ${venceEn},
          aviso_vencido_en = NULL, escalado_en = NULL
      WHERE id = ${id}`;
    await evento(tx, id, "por_recoger", opciones?.actorId ?? null, { motivo, nuevaVersionId: opciones?.nuevaVersionId ?? null }, ahora);
    // Nadie se avisa a sí mismo (spec 13B §12.2): si quien publica responde por el punto, la tarea basta.
    if (Number(c.responsable_actual) === opciones?.actorId) continue;
    await crearNotificacion(
      {
        usuarioId: Number(c.responsable_actual),
        tipo: "distribucion.recoger",
        titulo: `Recoja la copia N.º ${numeroDeCopia(Number(c.numero))} de ${c.codigo} v${c.version} en ${c.punto}: ${CIERRE_DEL_AVISO[motivo](nuevaVersion)}`,
        enlace: `/distribucion/copias/${id}`,
        entidad: "copia",
        entidadId: id,
      },
      tx,
    );
  }
  return { copiasPorRecoger: copias.length };
}
