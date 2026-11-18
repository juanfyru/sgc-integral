/**
 * Lo que comparten el registro de un hallazgo, la clasificación de un reporte de funcionario y el motor del hallazgo (spec 15
 * §7.3): el candado del reporte, su evento, su clasificación y los avisos a quien reportó. Esos avisos van a «Mis reportes»,
 * con la entidad del reporte, y nunca llevan el código, el título ni el enlace del hallazgo (F15-DC5).
 *
 * Módulo liviano: lo importan `flujo.ts` y `registro.ts`, así que no importa ninguno de los dos.
 */
import type { TransactionSql } from "postgres";
import { registrarAuditoria } from "@/db/consultas/admin";
import { avisarA } from "@/db/consultas/avisos-vencimiento";
import {
  AVISO_ATENDIDO,
  AVISO_DESCARTADO,
  AVISO_EN_TRAMITE,
  cuerpoDelReporte,
  ENTIDAD_REPORTE,
  REPORTE_NO_EXISTE,
  RUTA_MIS_REPORTES,
  YA_CLASIFICADO,
} from "@/lib/mejoramiento/reportes";
import { ErrorMejora } from "@/lib/mejoramiento/tipos";

export type ReporteRecibido = {
  id: number;
  reportadoPor: number;
  descripcion: string;
  vistoEn: string;
  procesoId: number | null;
  referenciaCaso: string | null;
};

/**
 * El reporte `FOR UPDATE`, solo si sigue «Recibido»: dos clasificaciones a la vez esperan aquí y la segunda lee el estado que
 * dejó la primera. Si un hallazgo entra en juego, quien llama lo bloquea antes (el orden de candados del módulo).
 */
export async function bloquearReporteRecibido(tx: TransactionSql, id: number): Promise<ReporteRecibido> {
  const [r] = await tx`SELECT id, reportado_por, descripcion, to_char(visto_en, 'YYYY-MM-DD') AS visto, proceso_id, referencia_caso, estado
    FROM mejora_reportes WHERE id = ${id} FOR UPDATE`;
  if (!r) throw new ErrorMejora(REPORTE_NO_EXISTE);
  if (r.estado !== "recibido") throw new ErrorMejora(YA_CLASIFICADO);
  return {
    id: Number(r.id),
    reportadoPor: Number(r.reportado_por),
    descripcion: r.descripcion as string,
    vistoEn: r.visto as string,
    procesoId: r.proceso_id === null ? null : Number(r.proceso_id),
    referenciaCaso: (r.referencia_caso as string | null) ?? null,
  };
}

/** Lo que le pasó al reporte, en su historia de solo inserción (`mejora_reporte_eventos`). */
export async function dejarEventoDeReporte(
  tx: TransactionSql,
  e: { reporteId: number; tipo: "enviado" | "convertido" | "sumado" | "descartado"; detalle?: Record<string, unknown>; usuarioId: number; creadoEn: Date },
): Promise<void> {
  await tx`INSERT INTO mejora_reporte_eventos (reporte_id, tipo, detalle, usuario_id, creado_en)
    VALUES (${e.reporteId}, ${e.tipo}, ${tx.json((e.detalle ?? {}) as never)}, ${e.usuarioId}, ${e.creadoEn})`;
}

/** Un aviso a quien reportó, si sigue activo y no es quien actuó: entidad del reporte y enlace a «Mis reportes». */
async function avisarAQuienReporto(
  tx: TransactionSql,
  r: { id: number; reportadoPor: number },
  aviso: { tipo: string; titulo: string; cuerpo: string },
  actorId: number | null,
): Promise<void> {
  if (r.reportadoPor === actorId) return;
  const [u] = await tx`SELECT 1 FROM usuarios WHERE id = ${r.reportadoPor} AND activo`;
  if (!u) return;
  await avisarA(
    tx,
    { tipo: aviso.tipo, titulo: aviso.titulo, enlace: RUTA_MIS_REPORTES, entidad: ENTIDAD_REPORTE, entidadId: r.id },
    [{ usuarioId: r.reportadoPor, cuerpo: aviso.cuerpo }],
  );
}

type Clasificacion =
  | { estado: "convertido" | "sumado"; hallazgo: { id: number; codigo: string } }
  | { estado: "descartado"; motivo: string };

/**
 * Deja clasificado un reporte que `bloquearReporteRecibido` devolvió: su estado, el hallazgo que nació de él o al que se sumó (o
 * el motivo del descarte), quién y cuándo; su evento, su fila de bitácora (ids y el estado: nunca lo que se escribió) y el aviso
 * a quien reportó, con el motivo solo si se descartó.
 */
export async function dejarClasificado(
  tx: TransactionSql,
  quien: { usuarioId: number },
  r: ReporteRecibido,
  x: Clasificacion,
  ahora: Date,
): Promise<void> {
  const hallazgoId = x.estado === "descartado" ? null : x.hallazgo.id;
  const motivo = x.estado === "descartado" ? x.motivo : null;
  await tx`UPDATE mejora_reportes SET estado = ${x.estado}, hallazgo_id = ${hallazgoId}, motivo_descarte = ${motivo},
      clasificado_por = ${quien.usuarioId}, clasificado_en = ${ahora}
    WHERE id = ${r.id}`;
  await dejarEventoDeReporte(tx, {
    reporteId: r.id,
    tipo: x.estado,
    detalle: motivo !== null ? { motivo } : { hallazgoId },
    usuarioId: quien.usuarioId,
    creadoEn: ahora,
  });
  const estado = { antes: "recibido", despues: x.estado };
  const base = { usuarioId: quien.usuarioId, entidad: ENTIDAD_REPORTE, entidadId: r.id };
  if (x.estado === "convertido") {
    await registrarAuditoria(tx, {
      ...base,
      accion: "mejora_reporte_convertido",
      detalle: { reporteId: r.id, hallazgoId, codigo: x.hallazgo.codigo, estado },
    });
  } else if (x.estado === "sumado") {
    await registrarAuditoria(tx, {
      ...base,
      accion: "mejora_reporte_sumado",
      detalle: { reporteId: r.id, hallazgoId, codigo: x.hallazgo.codigo, estado },
    });
  } else {
    await registrarAuditoria(tx, {
      ...base,
      accion: "mejora_reporte_descartado",
      detalle: { reporteId: r.id, estado },
    });
  }
  await avisarAQuienReporto(
    tx,
    r,
    motivo !== null
      ? { tipo: "mejora.reporte_clasificado", titulo: AVISO_DESCARTADO, cuerpo: motivo }
      : { tipo: "mejora.reporte_clasificado", titulo: AVISO_EN_TRAMITE, cuerpo: cuerpoDelReporte(r.vistoEn) },
    quien.usuarioId,
  );
}

/**
 * Cuando un hallazgo termina (cerrado, rechazado o anulado), avisa a quien reportó cada reporte que se convirtió en él o se le
 * sumó (spec §7.3): «Su reporte fue atendido», sin el código ni el título. Lo llama `transicionarHallazgo`, el único camino que
 * cambia el estado; `notificaciones` no cuelga del hallazgo, así que el trigger del hallazgo terminado no la toca.
 */
export async function avisarAQuienesReportaron(tx: TransactionSql, hallazgoId: number, actorId: number | null): Promise<void> {
  const reportes = await tx`SELECT id, reportado_por, to_char(visto_en, 'YYYY-MM-DD') AS visto FROM mejora_reportes
    WHERE hallazgo_id = ${hallazgoId} AND estado IN ('convertido', 'sumado') ORDER BY id`;
  for (const r of reportes) {
    await avisarAQuienReporto(
      tx,
      { id: Number(r.id), reportadoPor: Number(r.reportado_por) },
      { tipo: "mejora.reporte_atendido", titulo: AVISO_ATENDIDO, cuerpo: cuerpoDelReporte(r.visto as string) },
      actorId,
    );
  }
}
