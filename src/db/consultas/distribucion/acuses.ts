import type { TransactionSql } from "postgres";
import { obtenerSql, type Cliente } from "@/db/cliente";
import { registrarAuditoria } from "@/db/consultas/admin";
import { obtenerConfigDocumental } from "@/db/consultas/config-documental";
import { enTransaccion, type SesionFlujo } from "@/db/consultas/flujo/contrato";
import { crearNotificacion } from "@/db/consultas/notificaciones";
import { acusadosPorFirma, porcentaje } from "@/lib/distribucion/acuses";
import {
  ErrorDistribucion,
  type EstadoAcuse,
  type ModoAcuse,
  type MotivoPorRecoger,
  type OrigenAcuse,
} from "@/lib/distribucion/tipos";
import { ErrorPermiso, puede } from "@/lib/permisos";
import { fechaLimite } from "@/lib/tramites/plazos";
import { zonaHoraria } from "@/lib/zona-horaria";
import { audienciaDeDocumento } from "./audiencia";
import { usuariosDeListas } from "./listas";

type Opciones = { sql?: Cliente; ahora?: Date };

export type Acuse = {
  id: number;
  versionId: number;
  documentoId: number;
  codigo: string;
  titulo: string;
  version: number;
  usuarioId: number;
  origen: OrigenAcuse;
  estado: EstadoAcuse;
  modo: ModoAcuse | null;
  jornadaId: number | null;
  creadoEn: Date;
  venceEn: Date;
  confirmadoEn: Date | null;
  porQue: string;
  queCambio: string | null;
  publicadoEn: Date | null;
  abierto: boolean;
};

/** Una sola puerta para escribir en `acuse_eventos` (solo inserción). */
async function eventoAcuse(
  sql: Cliente,
  acuseId: number,
  tipo: "creado" | "confirmado" | "superado" | "retirado" | "revertido",
  usuarioId: number | null,
  detalle: Record<string, unknown>,
  ahora: Date,
): Promise<void> {
  await sql`INSERT INTO acuse_eventos (acuse_id, tipo, usuario_id, detalle, creado_en)
    VALUES (${acuseId}, ${tipo}, ${usuarioId}, ${sql.json(detalle as never)}, ${ahora})`;
}

/**
 * Los acuses de una versión recién publicada, dentro de la transacción de la publicación: uno por persona de la
 * audiencia. Quien firmó la ronda y está en la audiencia ya leyó el documento: nace confirmado por firma.
 * `firmantes` llega del manejador porque la firma de publicar aún no está en `firmas`.
 */
export async function crearAcusesAlPublicar(
  tx: TransactionSql,
  versionId: number,
  ahora: Date,
  firmantes: number[],
): Promise<{ creados: number; porFirma: number }> {
  const [v] = await tx`SELECT v.numero, d.id AS documento_id, d.codigo, d.titulo
    FROM documento_versiones v JOIN documentos d ON d.id = v.documento_id WHERE v.id = ${versionId}`;
  const audiencia = await audienciaDeDocumento(tx, Number(v.documento_id));
  const porFirma = new Set(acusadosPorFirma(firmantes, audiencia));
  const { plazoAcuseDias } = (await obtenerConfigDocumental({ sql: tx })).distribucion;
  const venceEn = fechaLimite(ahora, plazoAcuseDias, zonaHoraria());

  for (const usuarioId of audiencia) {
    const firmo = porFirma.has(usuarioId);
    const [fila] = await tx`INSERT INTO acuses (version_id, usuario_id, origen, estado, modo, creado_en, confirmado_en, vence_en)
      VALUES (${versionId}, ${usuarioId}, 'publicacion', ${firmo ? "confirmado" : "pendiente"}, ${firmo ? "firma" : null},
              ${ahora}, ${firmo ? ahora : null}, ${venceEn})
      RETURNING id`;
    const id = Number(fila.id);
    await eventoAcuse(tx, id, "creado", null, { origen: "publicacion" }, ahora);
    if (firmo) {
      await eventoAcuse(tx, id, "confirmado", usuarioId, { modo: "firma" }, ahora);
    } else {
      await crearNotificacion(
        {
          usuarioId,
          tipo: "distribucion.acuse",
          titulo: `${v.codigo} v${v.numero} ${v.titulo}: confirme su lectura`,
          enlace: `/acuses/${id}`,
          entidad: "acuse",
          entidadId: id,
        },
        tx,
      );
    }
  }
  return { creados: audiencia.length, porFirma: porFirma.size };
}

/** Los pendientes de una versión que dejó de ser vigente ya no se piden: quedan superados, con su evento. */
export async function superarAcuses(
  tx: TransactionSql,
  versionId: number,
  ahora: Date,
  motivo: MotivoPorRecoger,
): Promise<number> {
  const filas = await tx`UPDATE acuses SET estado = 'superado', cerrado_en = ${ahora}, motivo_cierre = ${motivo}
    WHERE version_id = ${versionId} AND estado = 'pendiente' RETURNING id`;
  for (const f of filas) await eventoAcuse(tx, Number(f.id), "superado", null, { motivo }, ahora);
  return filas.length;
}

function leerAcuse(sql: Cliente, condicion: ReturnType<Cliente>) {
  return sql`
    SELECT a.id, a.version_id, a.usuario_id, a.origen, a.estado, a.modo, a.jornada_id, a.creado_en, a.vence_en,
           a.confirmado_en, v.numero AS version, v.documento_id, v.resumen_cambios, v.publicado_en, d.codigo, d.titulo,
      (SELECT p.nombre
         FROM documento_proceso dp
         LEFT JOIN subprocesos s ON s.id = dp.subproceso_id
         JOIN procesos p ON p.id = COALESCE(dp.proceso_id, s.proceso_id)
         JOIN usuario_procesos up ON up.proceso_id = p.id AND up.usuario_id = a.usuario_id
        WHERE dp.documento_id = d.id ORDER BY p.nombre LIMIT 1) AS proceso,
      (SELECT l.nombre FROM documento_listas dl
         JOIN listas_distribucion l ON l.id = dl.lista_id AND l.activa
        WHERE dl.documento_id = d.id
          AND EXISTS (SELECT 1 FROM (${usuariosDeListas(sql, sql`m.lista_id = l.id`)}) r WHERE r.id = a.usuario_id)
        ORDER BY l.id LIMIT 1) AS lista,
      EXISTS (SELECT 1 FROM eventos_consulta ec
        WHERE ec.version_id = a.version_id AND ec.usuario_id = a.usuario_id AND ec.tipo IN ('vista', 'descarga')) AS abierto
    FROM acuses a
    JOIN documento_versiones v ON v.id = a.version_id
    JOIN documentos d ON d.id = v.documento_id
    WHERE ${condicion}`;
}

function aAcuse(f: Record<string, unknown>): Acuse {
  return {
    id: Number(f.id),
    versionId: Number(f.version_id),
    documentoId: Number(f.documento_id),
    codigo: f.codigo as string,
    titulo: f.titulo as string,
    version: Number(f.version),
    usuarioId: Number(f.usuario_id),
    origen: f.origen as OrigenAcuse,
    estado: f.estado as EstadoAcuse,
    modo: (f.modo as ModoAcuse | null) ?? null,
    jornadaId: f.jornada_id === null ? null : Number(f.jornada_id),
    creadoEn: f.creado_en as Date,
    venceEn: f.vence_en as Date,
    confirmadoEn: (f.confirmado_en as Date | null) ?? null,
    porQue: f.proceso
      ? `pertenece al proceso ${f.proceso}`
      : f.lista
        ? `está en la lista ${f.lista}`
        : "forma parte de la audiencia del documento",
    queCambio: (f.resumen_cambios as string | null) ?? null,
    publicadoEn: (f.publicado_en as Date | null) ?? null,
    abierto: f.abierto as boolean,
  };
}

/** Solo el destinatario ve su acuse; para cualquier otra persona es como si no existiera. */
export async function obtenerAcuse(id: number, sesion: SesionFlujo, opciones?: Opciones): Promise<Acuse | null> {
  const sql = opciones?.sql ?? obtenerSql();
  const [fila] = await leerAcuse(sql, sql`a.id = ${id} AND a.usuario_id = ${sesion.usuarioId}`);
  return fila ? aAcuse(fila) : null;
}

/** Los de la persona: pendientes primero (el más próximo a vencer arriba) y luego los confirmados, el más reciente primero. */
export async function acusesPropios(usuarioId: number, opciones?: Opciones): Promise<Acuse[]> {
  const sql = opciones?.sql ?? obtenerSql();
  const filas = await leerAcuse(sql, sql`a.usuario_id = ${usuarioId} AND a.estado IN ('pendiente', 'confirmado')`);
  const acuses = filas.map(aAcuse);
  const pendientes = acuses
    .filter((a) => a.estado === "pendiente")
    .sort((x, y) => x.venceEn.getTime() - y.venceEn.getTime() || x.id - y.id);
  const confirmados = acuses
    .filter((a) => a.estado === "confirmado")
    .sort((x, y) => (y.confirmadoEn?.getTime() ?? 0) - (x.confirmadoEn?.getTime() ?? 0) || y.id - x.id);
  return [...pendientes, ...confirmados];
}

export async function acusesPendientesDe(usuarioId: number, opciones?: Opciones): Promise<Acuse[]> {
  return (await acusesPropios(usuarioId, opciones)).filter((a) => a.estado === "pendiente");
}

export async function acusesDeVersion(
  versionId: number,
  opciones?: Opciones,
): Promise<{ confirmados: number; pendientes: number; porcentaje: number | null }> {
  const sql = opciones?.sql ?? obtenerSql();
  const [f] = await sql`SELECT count(*) FILTER (WHERE estado = 'confirmado')::int AS confirmados,
      count(*) FILTER (WHERE estado = 'pendiente')::int AS pendientes
    FROM acuses WHERE version_id = ${versionId}`;
  const confirmados = Number(f.confirmados);
  const pendientes = Number(f.pendientes);
  return { confirmados, pendientes, porcentaje: porcentaje(confirmados, pendientes) };
}

/** La confirmación individual: de quien la debe, mientras está pendiente y después de abrir la versión. */
export async function confirmarLectura(id: number, sesion: SesionFlujo, opciones?: Opciones): Promise<void> {
  if (!puede(sesion, "acuses.confirmar")) throw new ErrorPermiso();
  const sql = opciones?.sql ?? obtenerSql();
  const ahora = opciones?.ahora ?? new Date();
  await enTransaccion(sql, async (tx) => {
    const [a] = await tx`SELECT a.id, a.version_id, a.estado, v.numero, d.codigo
      FROM acuses a JOIN documento_versiones v ON v.id = a.version_id JOIN documentos d ON d.id = v.documento_id
      WHERE a.id = ${id} AND a.usuario_id = ${sesion.usuarioId} FOR UPDATE OF a`;
    if (!a) throw new ErrorDistribucion("La tarea no existe");
    if (a.estado !== "pendiente") throw new ErrorDistribucion("Esta lectura ya no está pendiente");
    const [abierto] = await tx`SELECT 1 AS ok FROM eventos_consulta
      WHERE version_id = ${a.version_id} AND usuario_id = ${sesion.usuarioId} AND tipo IN ('vista', 'descarga') LIMIT 1`;
    if (!abierto) throw new ErrorDistribucion("Abra el documento antes de confirmar la lectura");
    const filas = await tx`UPDATE acuses SET estado = 'confirmado', modo = 'individual', confirmado_en = ${ahora}
      WHERE id = ${id} AND estado = 'pendiente' RETURNING id`;
    if (filas.length === 0) throw new ErrorDistribucion("Esta lectura ya no está pendiente");
    await eventoAcuse(tx, id, "confirmado", sesion.usuarioId, { modo: "individual" }, ahora);
    await registrarAuditoria(tx, {
      usuarioId: sesion.usuarioId,
      accion: "acuse_lectura",
      entidad: "acuse",
      entidadId: id,
      detalle: { codigo: a.codigo, version: Number(a.numero), acuseId: id },
    });
  });
}
