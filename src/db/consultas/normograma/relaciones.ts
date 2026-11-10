/**
 * Las relaciones entre normas (spec 13C §10.2): «modifica a», «deroga a» y «reglamenta a», con un detalle opcional.
 * Registrar «deroga a» pasa la afectada a derogada y «modifica a» a modificada (si estaba vigente), en la misma
 * transacción, con su fila en `norma_cambios` y sus impactos; «reglamenta a» no cambia estados. Una relación se elimina
 * con baja lógica (migración 0010): el cambio que causó la sigue citando. Registrar y eliminar quedan en la bitácora de
 * las dos normas.
 */
import type { TransactionSql } from "postgres";
import { obtenerSql, type Cliente } from "@/db/cliente";
import { registrarAuditoria } from "@/db/consultas/admin";
import { enTransaccion, type SesionFlujo } from "@/db/consultas/flujo/contrato";
import {
  acotado,
  ErrorNormograma,
  ESTADO_TRAS_RELACION,
  fechaValida,
  opcionalAcotado,
  TIPOS_RELACION,
  type TipoRelacion,
} from "@/lib/normograma/tipos";
import { fechaEnZona } from "@/lib/tramites/plazos";
import { zonaHoraria } from "@/lib/zona-horaria";
import { nombreSql } from "./busqueda";
import { cambiarEstadoEn, exigirAdministrar, NORMA_NO_EXISTE, plazoDeImpactos } from "./normas";

type Opciones = { sql?: Cliente; ahora?: Date };

const YA_REGISTRADA = "Esa relación ya está registrada";

/** Una fila por norma (la que causa la relación y la afectada): cada ficha tiene su historia completa. */
async function auditarEnLasDos(
  tx: TransactionSql,
  usuarioId: number,
  accion: string,
  d: { normaId: number; afectadaId: number; detalle: Record<string, unknown> },
): Promise<void> {
  for (const entidadId of [d.normaId, d.afectadaId]) {
    await registrarAuditoria(tx, { usuarioId, accion, entidad: "norma", entidadId, detalle: d.detalle });
  }
}

/**
 * Registra que `normaId` modifica, deroga o reglamenta a `afectadaId`. La fecha del cambio de estado es la dada, o la
 * de expedición de la norma nueva, o la de hoy. Una afectada ya derogada o retirada no admite relaciones nuevas.
 */
export async function registrarRelacion(
  sesion: SesionFlujo,
  d: { normaId: number; afectadaId: number; tipo: TipoRelacion; detalle: string | null; fecha?: string },
  opciones?: Opciones,
): Promise<{ relacionId: number; cambioId: number | null; impactos: number }> {
  exigirAdministrar(sesion);
  if (!TIPOS_RELACION.includes(d.tipo)) throw new ErrorNormograma("Elija el tipo de relación");
  if (d.normaId === d.afectadaId) throw new ErrorNormograma("Una norma no se relaciona consigo misma");
  const detalle = opcionalAcotado(d.detalle, "El detalle", 500);
  const fechaDada = d.fecha ? fechaValida(d.fecha) : null;
  const sql = opciones?.sql ?? obtenerSql();
  const ahora = opciones?.ahora ?? new Date();
  const plazoDias = await plazoDeImpactos(sql);
  try {
    return await enTransaccion(sql, async (tx) => {
      // Las dos bloqueadas en orden de id: dos relaciones cruzadas no se esperan en círculo.
      const filas = await tx`SELECT n.id, n.estado, n.fecha_expedicion::text AS fecha_expedicion, ${nombreSql(tx)} AS nombre
        FROM normas n JOIN tipos_norma tn ON tn.id = n.tipo_norma_id
        WHERE n.id IN (${d.normaId}, ${d.afectadaId})
        ORDER BY n.id FOR UPDATE OF n`;
      const nueva = filas.find((f) => Number(f.id) === d.normaId);
      const afectada = filas.find((f) => Number(f.id) === d.afectadaId);
      if (!nueva || !afectada) throw new ErrorNormograma(NORMA_NO_EXISTE);
      const [repetida] = await tx`SELECT 1 FROM norma_relaciones
        WHERE norma_id = ${d.normaId} AND afectada_id = ${d.afectadaId} AND tipo = ${d.tipo} AND eliminada_en IS NULL`;
      if (repetida) throw new ErrorNormograma(YA_REGISTRADA);
      if (nueva.estado === "retirada") throw new ErrorNormograma(`${nueva.nombre} está retirada`);
      if (afectada.estado === "derogada" || afectada.estado === "retirada") {
        throw new ErrorNormograma(`${afectada.nombre} ya está ${afectada.estado}`);
      }

      const [r] = await tx`INSERT INTO norma_relaciones (norma_id, afectada_id, tipo, detalle, creado_por, creado_en)
        VALUES (${d.normaId}, ${d.afectadaId}, ${d.tipo}, ${detalle}, ${sesion.usuarioId}, ${ahora})
        RETURNING id`;
      const relacionId = Number(r.id);
      const estado = ESTADO_TRAS_RELACION[d.tipo];
      // «modifica a» sobre una ya modificada no cambia su estado: `cambiarEstadoEn` no escribe nada.
      const cambio = estado === null
        ? { cambioId: null, impactos: 0 }
        : await cambiarEstadoEn(
            tx,
            sesion,
            {
              normaId: d.afectadaId,
              estado,
              fecha: fechaDada ?? nueva.fecha_expedicion ?? fechaEnZona(ahora, zonaHoraria()),
              nota: null,
              relacionId,
            },
            { ahora, plazoDias },
          );
      await auditarEnLasDos(tx, sesion.usuarioId, "norma_relacion", {
        normaId: d.normaId,
        afectadaId: d.afectadaId,
        detalle: {
          relacionId,
          tipo: d.tipo,
          normaId: d.normaId,
          norma: nueva.nombre,
          afectadaId: d.afectadaId,
          afectada: afectada.nombre,
          detalle,
          cambioId: cambio.cambioId,
          impactos: cambio.impactos,
        },
      });
      return { relacionId, ...cambio };
    });
  } catch (err) {
    // Dos registros simultáneos de la misma relación: el segundo choca con el índice único de las no eliminadas.
    if ((err as { code?: string }).code === "23505") throw new ErrorNormograma(YA_REGISTRADA);
    throw err;
  }
}

/**
 * Elimina una relación registrada por error, con motivo (spec 13C §10.2): baja lógica con quién, cuándo y por qué, haya
 * cambiado o no un estado. No toca estados ni impactos: la afectada recupera su estado solo si el Admin SGC lo cambia a
 * mano, y el historial de la norma conserva el cambio que causó, marcado como de una relación eliminada.
 */
export async function eliminarRelacion(sesion: SesionFlujo, d: { relacionId: number; motivo: string }, opciones?: Opciones): Promise<void> {
  exigirAdministrar(sesion);
  const motivo = acotado(d.motivo, "El motivo", 5, 500);
  const ahora = opciones?.ahora ?? new Date();
  await enTransaccion(opciones?.sql ?? obtenerSql(), async (tx) => {
    const [r] = await tx`SELECT r.norma_id, r.afectada_id, r.tipo, r.detalle, r.eliminada_en,
        concat_ws(' ', tn.nombre, n.numero, 'de', n.anio::text) AS norma,
        concat_ws(' ', atn.nombre, a.numero, 'de', a.anio::text) AS afectada
      FROM norma_relaciones r
      JOIN normas n ON n.id = r.norma_id JOIN tipos_norma tn ON tn.id = n.tipo_norma_id
      JOIN normas a ON a.id = r.afectada_id JOIN tipos_norma atn ON atn.id = a.tipo_norma_id
      WHERE r.id = ${d.relacionId}
      FOR UPDATE OF r`;
    if (!r) throw new ErrorNormograma("La relación no existe");
    if (r.eliminada_en !== null) throw new ErrorNormograma("La relación ya está eliminada");
    await tx`UPDATE norma_relaciones SET eliminada_en = ${ahora}, eliminada_por = ${sesion.usuarioId}, eliminada_motivo = ${motivo}
      WHERE id = ${d.relacionId}`;
    const [cambio] = await tx`SELECT id FROM norma_cambios WHERE relacion_id = ${d.relacionId} ORDER BY id LIMIT 1`;
    await auditarEnLasDos(tx, sesion.usuarioId, "norma_relacion_eliminada", {
      normaId: Number(r.norma_id),
      afectadaId: Number(r.afectada_id),
      detalle: {
        relacionId: d.relacionId,
        tipo: r.tipo,
        normaId: Number(r.norma_id),
        norma: r.norma,
        afectadaId: Number(r.afectada_id),
        afectada: r.afectada,
        detalle: r.detalle,
        cambioId: cambio ? Number(cambio.id) : null,
        motivo,
      },
    });
  });
}
