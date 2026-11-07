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
import { alcanceProcesos, enAlcance, filtroAcceso, filtroAccesoDe, puedeAccederDocumento } from "@/lib/alcance";
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

/**
 * Quien asistió a la jornada ya leyó lo que se socializó: sus acuses pendientes de esas versiones pasan a
 * `confirmado` por asistencia. Dentro de la transacción de la jornada; devuelve cuántos se confirmaron.
 */
export async function confirmarPorAsistencia(
  tx: TransactionSql,
  d: { versionIds: number[]; asistenteIds: number[]; jornadaId: number; ahora: Date },
): Promise<number> {
  if (d.versionIds.length === 0 || d.asistenteIds.length === 0) return 0;
  const filas = await tx`UPDATE acuses SET estado = 'confirmado', modo = 'asistencia', jornada_id = ${d.jornadaId},
      confirmado_en = ${d.ahora}
    WHERE version_id IN ${tx(d.versionIds)} AND usuario_id IN ${tx(d.asistenteIds)} AND estado = 'pendiente'
    RETURNING id, usuario_id`;
  for (const f of filas) {
    await eventoAcuse(tx, Number(f.id), "confirmado", Number(f.usuario_id), { modo: "asistencia", jornadaId: d.jornadaId }, d.ahora);
  }
  return filas.length;
}

const MOTIVO_SEGUN_ESTADO: Record<string, MotivoPorRecoger> = {
  obsoleto: "nueva_version",
  anulado: "eliminado",
};

/**
 * Anular una jornada deshace lo que confirmó: el acuse vuelve a pendiente con un plazo nuevo si su versión
 * sigue vigente, y si no, queda superado. El acuse no se borra: el evento `revertido` deja constancia.
 */
export async function revertirAsistencia(
  tx: TransactionSql,
  jornadaId: number,
  ahora: Date,
  plazoAcuseDias: number,
  actorId: number | null = null,
): Promise<number> {
  const acuses = await tx`SELECT a.id, a.usuario_id, v.estado AS version_estado
    FROM acuses a JOIN documento_versiones v ON v.id = a.version_id
    WHERE a.jornada_id = ${jornadaId} AND a.modo = 'asistencia' AND a.estado = 'confirmado'
    ORDER BY a.id FOR UPDATE OF a`;
  const venceEn = fechaLimite(ahora, plazoAcuseDias, zonaHoraria());
  for (const a of acuses) {
    const id = Number(a.id);
    if (a.version_estado === "vigente") {
      await tx`UPDATE acuses SET estado = 'pendiente', modo = NULL, jornada_id = NULL, confirmado_en = NULL,
          vence_en = ${venceEn}, aviso_vencido_en = NULL, escalado_en = NULL
        WHERE id = ${id}`;
    } else {
      await tx`UPDATE acuses SET estado = 'superado', modo = NULL, jornada_id = NULL, confirmado_en = NULL,
          cerrado_en = ${ahora}, motivo_cierre = ${MOTIVO_SEGUN_ESTADO[a.version_estado as string] ?? "carga_deshecha"}
        WHERE id = ${id}`;
    }
    await eventoAcuse(
      tx, id, "revertido", actorId,
      { jornadaId, a: a.version_estado === "vigente" ? "pendiente" : "superado" },
      ahora,
    );
  }
  return acuses.length;
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
): Promise<{
  confirmados: number;
  pendientes: number;
  porcentaje: number | null;
  porAsistencia: number;
  venceEn: Date | null;
}> {
  const sql = opciones?.sql ?? obtenerSql();
  const [f] = await sql`SELECT count(*) FILTER (WHERE estado = 'confirmado')::int AS confirmados,
      count(*) FILTER (WHERE estado = 'pendiente')::int AS pendientes,
      count(*) FILTER (WHERE estado = 'confirmado' AND modo = 'asistencia')::int AS por_asistencia,
      min(vence_en) FILTER (WHERE estado = 'pendiente') AS vence_en
    FROM acuses WHERE version_id = ${versionId}`;
  const confirmados = Number(f.confirmados);
  const pendientes = Number(f.pendientes);
  return {
    confirmados,
    pendientes,
    porcentaje: porcentaje(confirmados, pendientes),
    porAsistencia: Number(f.por_asistencia),
    venceEn: (f.vence_en as Date | null) ?? null,
  };
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

/** Una fila `pendiente` con su evento y su aviso; `false` si la persona ya tiene un acuse vivo de la versión. */
async function abrirAcuse(
  tx: TransactionSql,
  v: { id: number; numero: number; codigo: string; titulo: string },
  usuarioId: number,
  origen: "solicitud_manual" | "ingreso_proceso",
  venceEn: Date,
  ahora: Date,
): Promise<boolean> {
  const [fila] = await tx`INSERT INTO acuses (version_id, usuario_id, origen, estado, creado_en, vence_en)
    VALUES (${v.id}, ${usuarioId}, ${origen}, 'pendiente', ${ahora}, ${venceEn})
    ON CONFLICT (version_id, usuario_id) WHERE estado IN ('pendiente', 'confirmado') DO NOTHING
    RETURNING id`;
  if (!fila) return false;
  const id = Number(fila.id);
  await eventoAcuse(tx, id, "creado", null, { origen }, ahora);
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
  return true;
}

async function venceDesde(tx: TransactionSql, ahora: Date): Promise<Date> {
  const { plazoAcuseDias } = (await obtenerConfigDocumental({ sql: tx })).distribucion;
  return fechaLimite(ahora, plazoAcuseDias, zonaHoraria());
}

/** Pide el acuse de la versión vigente a quien aún no lo tiene; repetirlo no duplica nada. */
export async function pedirAcuses(
  sesion: SesionFlujo,
  documentoId: number,
  opciones?: Opciones,
): Promise<{ creados: number }> {
  if (!puede(sesion, "distribucion.gestionar")) throw new ErrorPermiso();
  const sql = opciones?.sql ?? obtenerSql();
  const ahora = opciones?.ahora ?? new Date();
  return enTransaccion(sql, async (tx) => {
    const [v] = await tx`SELECT v.id, v.numero, d.codigo, d.titulo
      FROM documentos d JOIN documento_versiones v ON v.documento_id = d.id AND v.estado = 'vigente'
      WHERE d.id = ${documentoId} FOR UPDATE OF d`;
    if (!v) throw new ErrorDistribucion("El documento no tiene una versión vigente");
    const version = { id: Number(v.id), numero: Number(v.numero), codigo: v.codigo as string, titulo: v.titulo as string };
    const venceEn = await venceDesde(tx, ahora);
    let creados = 0;
    for (const usuarioId of await audienciaDeDocumento(tx, documentoId)) {
      if (await abrirAcuse(tx, version, usuarioId, "solicitud_manual", venceEn, ahora)) creados += 1;
    }
    await registrarAuditoria(tx, {
      usuarioId: sesion.usuarioId,
      accion: "acuses_pedidos",
      entidad: "documento",
      entidadId: documentoId,
      detalle: { codigo: version.codigo, version: version.numero, creados },
    });
    return { creados };
  });
}

/** La lectura obligatoria al ingresar: al sumarse a un proceso, la persona recibe los vigentes marcados que le tocan. */
export async function acusesDeIngreso(
  tx: TransactionSql,
  usuarioId: number,
  procesoIds: number[],
  ahora: Date,
): Promise<number> {
  if (procesoIds.length === 0) return 0;
  const [u] = await tx`SELECT activo FROM usuarios WHERE id = ${usuarioId}`;
  if (!u?.activo) return 0;
  const filas = await tx`
    SELECT v.id, v.numero, d.codigo, d.titulo
    FROM documentos d
    JOIN documento_versiones v ON v.documento_id = d.id AND v.estado = 'vigente'
    WHERE d.lectura_obligatoria_ingreso
      AND ${filtroAccesoDe(tx, tx`${usuarioId}::bigint`)}
      AND EXISTS (
        SELECT 1 FROM documento_proceso dp
        LEFT JOIN subprocesos s ON s.id = dp.subproceso_id
        JOIN procesos p ON p.id = COALESCE(dp.proceso_id, s.proceso_id) AND p.activo
        WHERE dp.documento_id = d.id AND p.id IN ${tx(procesoIds)})
    ORDER BY d.codigo`;
  if (filas.length === 0) return 0;
  const venceEn = await venceDesde(tx, ahora);
  let creados = 0;
  for (const f of filas) {
    const v = { id: Number(f.id), numero: Number(f.numero), codigo: f.codigo as string, titulo: f.titulo as string };
    if (await abrirAcuse(tx, v, usuarioId, "ingreso_proceso", venceEn, ahora)) creados += 1;
  }
  return creados;
}

async function retirar(tx: TransactionSql, ids: number[], ahora: Date, motivo: string): Promise<number> {
  if (ids.length === 0) return 0;
  const filas = await tx`UPDATE acuses SET estado = 'retirado', cerrado_en = ${ahora}, motivo_cierre = ${motivo}
    WHERE id IN ${tx(ids)} AND estado = 'pendiente' RETURNING id`;
  for (const f of filas) await eventoAcuse(tx, Number(f.id), "retirado", null, { motivo }, ahora);
  return filas.length;
}

/** Los pendientes de quien ya no pertenece a la audiencia del documento dejan de pedirse. */
export async function retirarAcusesFueraDeAudiencia(
  tx: TransactionSql,
  documentoId: number,
  ahora: Date,
  motivo: string,
): Promise<number> {
  const pendientes = await tx`SELECT a.id, a.usuario_id FROM acuses a
    JOIN documento_versiones v ON v.id = a.version_id
    WHERE v.documento_id = ${documentoId} AND a.estado = 'pendiente' ORDER BY a.id FOR UPDATE OF a`;
  if (pendientes.length === 0) return 0;
  const dentro = new Set(await audienciaDeDocumento(tx, documentoId));
  return retirar(tx, pendientes.filter((p) => !dentro.has(Number(p.usuario_id))).map((p) => Number(p.id)), ahora, motivo);
}

/** Todo lo que la persona debía leer queda retirado (al desactivarla). */
export async function retirarAcusesDe(
  tx: TransactionSql,
  usuarioId: number,
  ahora: Date,
  motivo: string,
): Promise<number> {
  const pendientes = await tx`SELECT id FROM acuses WHERE usuario_id = ${usuarioId} AND estado = 'pendiente' ORDER BY id FOR UPDATE`;
  return retirar(tx, pendientes.map((p) => Number(p.id)), ahora, motivo);
}

/** Los documentos que tienen alguno de estos procesos como propietario o «donde aplica» (un subproceso cuenta por su proceso). */
export async function documentosDeProcesos(tx: TransactionSql, procesoIds: number[]): Promise<number[]> {
  if (procesoIds.length === 0) return [];
  const filas = await tx`SELECT DISTINCT dp.documento_id FROM documento_proceso dp
    LEFT JOIN subprocesos s ON s.id = dp.subproceso_id
    WHERE COALESCE(dp.proceso_id, s.proceso_id) IN ${tx(procesoIds)} ORDER BY dp.documento_id`;
  return filas.map((f) => Number(f.documento_id));
}

/** Retira los pendientes que quedaron fuera de la audiencia en cada documento a los que está asignada la lista. */
export async function retirarAcusesDeLista(tx: TransactionSql, listaId: number, ahora: Date, motivo: string): Promise<number> {
  const docs = await tx`SELECT documento_id FROM documento_listas WHERE lista_id = ${listaId} ORDER BY documento_id`;
  let n = 0;
  for (const d of docs) n += await retirarAcusesFueraDeAudiencia(tx, Number(d.documento_id), ahora, motivo);
  return n;
}

/** Avisa a quienes recibían el documento que dejó de aplicar; no abre tarea. */
export async function avisarEliminacion(
  tx: TransactionSql,
  documentoId: number,
  codigo: string,
  titulo: string,
  ahora: Date,
): Promise<void> {
  const fecha = new Intl.DateTimeFormat("es-CO", { dateStyle: "long", timeZone: zonaHoraria() }).format(ahora);
  for (const usuarioId of await audienciaDeDocumento(tx, documentoId)) {
    await crearNotificacion(
      {
        usuarioId,
        tipo: "distribucion.eliminado",
        titulo: `${codigo} ${titulo} dejó de aplicar: fue eliminado el ${fecha}`,
        entidad: "documento",
        entidadId: documentoId,
      },
      tx,
    );
  }
}

export type FilaAcuses = {
  versionId: number;
  codigo: string;
  titulo: string;
  version: number;
  proceso: string;
  publicadoEn: Date | null;
  confirmados: number;
  pendientes: number;
  porAsistencia: number;
  porFirma: number;
  porcentaje: number | null;
  venceEn: Date | null;
};

type Cifras = { confirmados: number; pendientes: number; porcentaje: number | null };

/**
 * Cumplimiento de lectura por versión, proceso y entidad. Cuenta `pendiente` y `confirmado`: lo superado y lo
 * retirado ya no se pide. El periodo se mide sobre la publicación de la versión o, si se cargó fuera de la plataforma
 * (sin `publicado_en`), sobre su primer acuse.
 */
export async function resumenAcuses(
  sesion: SesionFlujo,
  filtro: { desde: Date; hasta: Date; procesoId?: number },
  opciones?: Opciones,
): Promise<{
  versiones: FilaAcuses[];
  porProceso: (Cifras & { procesoId: number; nombre: string })[];
  entidad: Cifras;
}> {
  const sql = opciones?.sql ?? obtenerSql();
  const alcance = await alcanceProcesos(sesion, { sql });
  const verNoVigentes = puede(sesion, "documentos.ver_historial");
  const filas = await sql`
    SELECT v.id, v.numero, v.publicado_en, d.codigo, d.titulo, prop.proceso_id, prop.nombre AS proceso,
      count(*) FILTER (WHERE a.estado = 'confirmado')::int AS confirmados,
      count(*) FILTER (WHERE a.estado = 'pendiente')::int AS pendientes,
      count(*) FILTER (WHERE a.estado = 'confirmado' AND a.modo = 'asistencia')::int AS por_asistencia,
      count(*) FILTER (WHERE a.estado = 'confirmado' AND a.modo = 'firma')::int AS por_firma,
      min(a.vence_en) FILTER (WHERE a.estado = 'pendiente') AS vence_en
    FROM acuses a
    JOIN documento_versiones v ON v.id = a.version_id
    JOIN documentos d ON d.id = v.documento_id
    JOIN LATERAL (
      SELECT p.id AS proceso_id, p.nombre
      FROM documento_proceso dp
      LEFT JOIN subprocesos s ON s.id = dp.subproceso_id
      JOIN procesos p ON p.id = COALESCE(dp.proceso_id, s.proceso_id)
      WHERE dp.documento_id = d.id AND dp.es_principal LIMIT 1
    ) prop ON true
    WHERE a.estado IN ('pendiente', 'confirmado')
      AND ${sql`COALESCE(v.publicado_en, (SELECT min(p1.creado_en) FROM acuses p1 WHERE p1.version_id = v.id))`} >= ${filtro.desde}
      AND ${sql`COALESCE(v.publicado_en, (SELECT min(p2.creado_en) FROM acuses p2 WHERE p2.version_id = v.id))`} < ${filtro.hasta}
      AND ${filtroAcceso(sql, sesion)}
      AND ${verNoVigentes ? sql`true` : sql`v.estado = 'vigente'`}
      AND ${filtro.procesoId === undefined ? sql`true` : sql`prop.proceso_id = ${filtro.procesoId}`}
      AND ${alcance.todos ? sql`true` : alcance.procesoIds.length === 0 ? sql`false` : sql`prop.proceso_id IN ${sql(alcance.procesoIds)}`}
    GROUP BY v.id, d.id, prop.proceso_id, prop.nombre
    ORDER BY prop.nombre, d.codigo, v.numero`;

  const versiones: FilaAcuses[] = [];
  const procesos = new Map<number, { nombre: string; confirmados: number; pendientes: number }>();
  let confirmadosTotal = 0;
  let pendientesTotal = 0;
  for (const f of filas) {
    const confirmados = Number(f.confirmados);
    const pendientes = Number(f.pendientes);
    versiones.push({
      versionId: Number(f.id),
      codigo: f.codigo as string,
      titulo: f.titulo as string,
      version: Number(f.numero),
      proceso: f.proceso as string,
      publicadoEn: (f.publicado_en as Date | null) ?? null,
      confirmados,
      pendientes,
      porAsistencia: Number(f.por_asistencia),
      porFirma: Number(f.por_firma),
      porcentaje: porcentaje(confirmados, pendientes),
      venceEn: (f.vence_en as Date | null) ?? null,
    });
    const p = procesos.get(Number(f.proceso_id)) ?? { nombre: f.proceso as string, confirmados: 0, pendientes: 0 };
    p.confirmados += confirmados;
    p.pendientes += pendientes;
    procesos.set(Number(f.proceso_id), p);
    confirmadosTotal += confirmados;
    pendientesTotal += pendientes;
  }
  return {
    versiones,
    porProceso: [...procesos].map(([procesoId, p]) => ({ procesoId, ...p, porcentaje: porcentaje(p.confirmados, p.pendientes) })),
    entidad: { confirmados: confirmadosTotal, pendientes: pendientesTotal, porcentaje: porcentaje(confirmadosTotal, pendientesTotal) },
  };
}

/** Quién falta por confirmar una versión; `null` si la persona no ve la distribución de ese documento. */
export async function quienFalta(
  versionId: number,
  sesion: SesionFlujo,
  opciones?: Opciones,
): Promise<{ id: number; nombre: string; cargo: string | null; desdeHace: number }[] | null> {
  if (!puede(sesion, "distribucion.ver")) return null;
  const sql = opciones?.sql ?? obtenerSql();
  const ahora = opciones?.ahora ?? new Date();
  const [v] = await sql`SELECT v.documento_id,
      (SELECT COALESCE(dp.proceso_id, s.proceso_id) FROM documento_proceso dp
         LEFT JOIN subprocesos s ON s.id = dp.subproceso_id
        WHERE dp.documento_id = v.documento_id AND dp.es_principal LIMIT 1) AS propietario
    FROM documento_versiones v WHERE v.id = ${versionId}`;
  if (!v) return null;
  if (!(await puedeAccederDocumento(Number(v.documento_id), sesion, { sql }))) return null;
  const alcance = await alcanceProcesos(sesion, { sql });
  if (!enAlcance(alcance, Number(v.propietario))) return null;
  const filas = await sql`SELECT u.id, u.nombre, c.nombre AS cargo, a.creado_en
    FROM acuses a JOIN usuarios u ON u.id = a.usuario_id LEFT JOIN cargos c ON c.id = u.cargo_id
    WHERE a.version_id = ${versionId} AND a.estado = 'pendiente' ORDER BY a.creado_en, lower(u.nombre), u.id`;
  return filas.map((f) => ({
    id: Number(f.id),
    nombre: f.nombre as string,
    cargo: (f.cargo as string | null) ?? null,
    desdeHace: Math.max(0, Math.floor((ahora.getTime() - (f.creado_en as Date).getTime()) / 86_400_000)),
  }));
}

/** Lo que la ficha del documento muestra de los acuses: la vigente, sus cifras y quién falta (`null` si no se puede ver). */
export async function resumenAcusesDeDocumento(
  documentoId: number,
  sesion: SesionFlujo,
  opciones?: Opciones,
): Promise<{
  versionId: number;
  version: number;
  cifras: Awaited<ReturnType<typeof acusesDeVersion>>;
  faltan: Awaited<ReturnType<typeof quienFalta>>;
} | null> {
  const sql = opciones?.sql ?? obtenerSql();
  const [v] = await sql`SELECT id, numero FROM documento_versiones WHERE documento_id = ${documentoId} AND estado = 'vigente'`;
  if (!v) return null;
  const versionId = Number(v.id);
  const [cifras, faltan] = await Promise.all([acusesDeVersion(versionId, opciones), quienFalta(versionId, sesion, opciones)]);
  return { versionId, version: Number(v.numero), cifras, faltan };
}
