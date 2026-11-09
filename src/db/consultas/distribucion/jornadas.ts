import type { TransactionSql } from "postgres";
import { obtenerSql, type Cliente } from "@/db/cliente";
import { registrarAuditoria } from "@/db/consultas/admin";
import { obtenerConfigDocumental } from "@/db/consultas/config-documental";
import { enTransaccion, type SesionFlujo } from "@/db/consultas/flujo/contrato";
import { crearNotificacion } from "@/db/consultas/notificaciones";
import { adminsActivos, lideresDeProceso } from "@/db/consultas/tramites";
import { alcanceProcesos, puedeAccederDocumento, puedeVerJornada } from "@/lib/alcance";
import { ErrorDistribucion, type ModalidadJornada } from "@/lib/distribucion/tipos";
import { ErrorPermiso, puede } from "@/lib/permisos";
import { fechaEnZona, fechaLimite } from "@/lib/tramites/plazos";
import { zonaHoraria } from "@/lib/zona-horaria";
import { confirmarPorAsistencia, revertirAsistencia } from "./acuses";
import { documentoEnAlcance } from "./copias";
import { evidenciasDe, type Evidencia } from "./evidencias";

type Opciones = { sql?: Cliente; ahora?: Date };

/** Las jornadas más recientes que muestra el listado. */
const TOPE_LISTADO = 300;

/** Las 24 horas, desde que se registró la jornada, en que quien la registró puede adjuntar o quitar evidencia. */
export const VENTANA_EVIDENCIA_MS = 24 * 3_600_000;

export type Jornada = {
  id: number;
  fecha: string;
  modalidad: ModalidadJornada;
  facilitador: { id: number; nombre: string };
  observaciones: string | null;
  asistentesExternos: string | null;
  registradaPor: { id: number; nombre: string };
  creadoEn: Date;
  anulada: { en: Date; por: string; motivo: string } | null;
  /** Quien no ve la evidencia solo ve los documentos que puede ver; `versionesOcultas` cuenta los demás. */
  versiones: { versionId: number; codigo: string; titulo: string; version: number; vigente: boolean }[];
  versionesOcultas: number;
  /** Solo con `puedeVerEvidencia`; si no, vacía y `asistentesCantidad` dice cuántos fueron. */
  asistentes: { id: number; nombre: string; cargo: string | null }[];
  asistentesCantidad: number;
  /** Solo con `puedeVerEvidencia`; si no, vacía y `evidenciasCantidad` dice cuántos hay. */
  evidencias: Evidencia[];
  evidenciasCantidad: number;
  puedeVerEvidencia: boolean;
};

export type DatosJornada = {
  fecha: string;
  modalidad: ModalidadJornada;
  facilitadorId: number;
  versionIds: number[];
  asistenteIds: number[];
  asistentesExternos: string | null;
  observaciones: string | null;
};

/**
 * La socialización que pide la versión recién publicada, dentro de la transacción de la publicación: se
 * avisa a los líderes del proceso propietario o, si no tiene, a los Admin SGC.
 */
export async function pedirSocializacion(
  tx: TransactionSql,
  d: { versionId: number; procesoId: number; plazoDias: number; ahora: Date },
): Promise<{ venceEn: Date }> {
  const venceEn = fechaLimite(d.ahora, d.plazoDias, zonaHoraria());
  const [fila] = await tx`INSERT INTO socializaciones_requeridas (version_id, creado_en, vence_en)
    VALUES (${d.versionId}, ${d.ahora}, ${venceEn}) ON CONFLICT (version_id) DO NOTHING RETURNING id`;
  if (!fila) return { venceEn };
  const [v] = await tx`SELECT v.numero, doc.codigo FROM documento_versiones v JOIN documentos doc ON doc.id = v.documento_id
    WHERE v.id = ${d.versionId}`;
  const lideres = await lideresDeProceso(d.procesoId, { sql: tx });
  const destinatarios = lideres.length > 0 ? lideres : await adminsActivos({ sql: tx });
  for (const usuarioId of destinatarios) {
    await crearNotificacion(
      {
        usuarioId,
        tipo: "distribucion.socializar",
        titulo: `Registre la socialización de ${v.codigo} v${v.numero}`,
        enlace: `/distribucion/socializaciones/nueva?version=${d.versionId}`,
        entidad: "socializacion",
        entidadId: Number(fila.id),
      },
      tx,
    );
  }
  return { venceEn };
}

const sinRepetir = (ids: number[]) => [...new Set(ids)];

export async function registrarJornada(
  sesion: SesionFlujo,
  d: DatosJornada,
  opciones?: Opciones,
): Promise<{ jornadaId: number; acusesPorAsistencia: number }> {
  if (!puede(sesion, "socializaciones.registrar")) throw new ErrorPermiso();
  const ahora = opciones?.ahora ?? new Date();
  const versionIds = sinRepetir(d.versionIds);
  const asistenteIds = sinRepetir(d.asistenteIds);
  const externos = d.asistentesExternos?.trim() || null;
  if (versionIds.length === 0) throw new ErrorDistribucion("Elija al menos un documento");
  if (d.fecha > fechaEnZona(ahora, zonaHoraria())) throw new ErrorDistribucion("La fecha no puede ser futura");
  if (asistenteIds.length === 0 && !externos) {
    throw new ErrorDistribucion("Registre al menos un asistente o escriba quiénes asistieron de fuera");
  }

  return enTransaccion(opciones?.sql ?? obtenerSql(), async (tx) => {
    const versiones = await tx`SELECT v.id, v.numero, v.estado, d.id AS documento_id, d.codigo,
        ${documentoEnAlcance(tx, sesion)} AS en_alcance
      FROM documento_versiones v JOIN documentos d ON d.id = v.documento_id
      WHERE v.id IN ${tx(versionIds)} ORDER BY d.codigo, v.numero`;
    if (versiones.length !== versionIds.length) throw new ErrorDistribucion("Uno de los documentos no existe");
    for (const v of versiones) {
      if (!v.en_alcance) throw new ErrorDistribucion(`El documento ${v.codigo} no es de sus procesos`);
      if (v.estado !== "vigente" && v.estado !== "obsoleto") {
        throw new ErrorDistribucion(`Solo se socializa una versión vigente u obsoleta: ${v.codigo} v${v.numero} no lo es`);
      }
    }
    const personas = await tx`SELECT id FROM usuarios WHERE activo AND id IN ${tx(sinRepetir([...asistenteIds, d.facilitadorId]))}`;
    const activas = new Set(personas.map((p) => Number(p.id)));
    if (!activas.has(d.facilitadorId)) throw new ErrorDistribucion("El facilitador no existe o está inactivo");
    if (asistenteIds.some((id) => !activas.has(id))) throw new ErrorDistribucion("Un asistente no existe o está inactivo");

    const [j] = await tx`INSERT INTO jornadas (fecha, modalidad, facilitador_id, observaciones, asistentes_externos, registrada_por, creado_en)
      VALUES (${d.fecha}, ${d.modalidad}, ${d.facilitadorId}, ${d.observaciones?.trim() || null}, ${externos}, ${sesion.usuarioId}, ${ahora})
      RETURNING id`;
    const jornadaId = Number(j.id);
    for (const versionId of versionIds) {
      await tx`INSERT INTO jornada_versiones (jornada_id, version_id) VALUES (${jornadaId}, ${versionId})`;
    }
    for (const usuarioId of asistenteIds) {
      await tx`INSERT INTO jornada_asistentes (jornada_id, usuario_id) VALUES (${jornadaId}, ${usuarioId})`;
    }
    const acusesPorAsistencia = await confirmarPorAsistencia(tx, { versionIds, asistenteIds, jornadaId, ahora });
    const cumplidas = await tx`UPDATE socializaciones_requeridas SET cumplida_en = ${ahora}, jornada_id = ${jornadaId}
      WHERE version_id IN ${tx(versionIds)} AND cumplida_en IS NULL AND superada_en IS NULL RETURNING version_id`;

    await registrarAuditoria(tx, {
      usuarioId: sesion.usuarioId,
      accion: "jornada_registrada",
      entidad: "jornada",
      entidadId: jornadaId,
      detalle: {
        fecha: d.fecha,
        modalidad: d.modalidad,
        facilitadorId: d.facilitadorId,
        versiones: versiones.map((v) => ({ versionId: Number(v.id), codigo: v.codigo, version: Number(v.numero) })),
        asistentes: asistenteIds,
        asistentesExternos: externos !== null,
        acusesPorAsistencia,
        requeridasCumplidas: cumplidas.length,
      },
    });
    return { jornadaId, acusesPorAsistencia };
  });
}

/**
 * Una jornada no se edita: se anula con motivo. Deshace lo que hizo (los acuses por asistencia vuelven a
 * pendientes y la socialización requerida se reabre) y queda en la bitácora.
 */
export async function anularJornada(id: number, sesion: SesionFlujo, motivo: string, opciones?: Opciones): Promise<void> {
  const ahora = opciones?.ahora ?? new Date();
  const texto = motivo.trim();
  if (!texto) throw new ErrorDistribucion("Escriba el motivo");
  await enTransaccion(opciones?.sql ?? obtenerSql(), async (tx) => {
    const [j] = await tx`SELECT registrada_por, anulada_en FROM jornadas WHERE id = ${id} FOR UPDATE`;
    if (!j) throw new ErrorDistribucion("La jornada no existe");
    const propia = Number(j.registrada_por) === sesion.usuarioId && puede(sesion, "socializaciones.registrar");
    if (!propia && !puede(sesion, "distribucion.gestionar")) throw new ErrorPermiso();
    if (j.anulada_en) throw new ErrorDistribucion("La jornada ya está anulada");

    await tx`UPDATE jornadas SET anulada_en = ${ahora}, anulada_por = ${sesion.usuarioId}, motivo_anulacion = ${texto} WHERE id = ${id}`;
    const { plazoAcuseDias } = (await obtenerConfigDocumental({ sql: tx })).distribucion;
    const acusesRevertidos = await revertirAsistencia(tx, id, ahora, plazoAcuseDias, sesion.usuarioId);
    const requeridas = await tx`SELECT r.id, v.estado FROM socializaciones_requeridas r
      JOIN documento_versiones v ON v.id = r.version_id WHERE r.jornada_id = ${id} ORDER BY r.id FOR UPDATE OF r`;
    for (const r of requeridas) {
      await tx`UPDATE socializaciones_requeridas SET cumplida_en = NULL, jornada_id = NULL,
          superada_en = ${r.estado === "vigente" ? null : ahora}
        WHERE id = ${r.id}`;
    }
    await registrarAuditoria(tx, {
      usuarioId: sesion.usuarioId,
      accion: "jornada_anulada",
      entidad: "jornada",
      entidadId: id,
      detalle: { motivo: texto, acusesRevertidos, requeridasReabiertas: requeridas.filter((r) => r.estado === "vigente").length },
    });
  });
}

/**
 * Quién puede adjuntar o quitar evidencia: solo quien registró la jornada, mientras no esté anulada y dentro de las
 * 24 horas siguientes. Para quien no la registró es como si no existiera (404); fuera de plazo, 409.
 */
export async function autorizarEvidenciaDeJornada(
  id: number,
  sesion: Pick<SesionFlujo, "usuarioId" | "rol" | "verHistorial">,
  opciones?: Opciones,
): Promise<{ ok: true } | { ok: false; estado: 404 | 409 }> {
  const sql = opciones?.sql ?? obtenerSql();
  const ahora = opciones?.ahora ?? new Date();
  if (!puede(sesion, "socializaciones.registrar")) return { ok: false, estado: 404 };
  const [j] = await sql`SELECT registrada_por, creado_en, anulada_en FROM jornadas WHERE id = ${id}`;
  if (!j || Number(j.registrada_por) !== sesion.usuarioId) return { ok: false, estado: 404 };
  if (j.anulada_en || ahora.getTime() - (j.creado_en as Date).getTime() >= VENTANA_EVIDENCIA_MS) return { ok: false, estado: 409 };
  return { ok: true };
}

/** Hasta cuándo puede su autora adjuntar evidencia; `null` si ya no (anulada o vencida). */
export function ventanaDeEvidencia(j: Pick<Jornada, "creadoEn" | "anulada">, ahora: Date): Date | null {
  const hasta = new Date(j.creadoEn.getTime() + VENTANA_EVIDENCIA_MS);
  return j.anulada || hasta <= ahora ? null : hasta;
}

async function cargarJornadas(
  sql: Cliente,
  sesion: SesionFlujo,
  condicion: ReturnType<Cliente>,
  /** `null`: sin tope, para el Excel del periodo. */
  tope: number | null = TOPE_LISTADO,
): Promise<Jornada[]> {
  const filas = await sql`
    SELECT j.id, j.fecha::text AS fecha, j.modalidad, j.facilitador_id, uf.nombre AS facilitador, j.observaciones,
           j.asistentes_externos, j.registrada_por, ur.nombre AS registrada_por_nombre, j.creado_en, j.anulada_en,
           ua.nombre AS anulada_por_nombre, j.motivo_anulacion
    FROM jornadas j
    JOIN usuarios uf ON uf.id = j.facilitador_id
    JOIN usuarios ur ON ur.id = j.registrada_por
    LEFT JOIN usuarios ua ON ua.id = j.anulada_por
    WHERE ${condicion}
    ORDER BY j.fecha DESC, j.id DESC ${tope === null ? sql`` : sql`LIMIT ${tope}`}`;
  if (filas.length === 0) return [];
  const ids = filas.map((f) => Number(f.id));
  const [versiones, asistentes, procesos] = await Promise.all([
    sql`SELECT jv.jornada_id, v.id AS version_id, v.numero, v.estado, v.documento_id, d.codigo, d.titulo
      FROM jornada_versiones jv JOIN documento_versiones v ON v.id = jv.version_id JOIN documentos d ON d.id = v.documento_id
      WHERE jv.jornada_id IN ${sql(ids)} ORDER BY d.codigo, v.numero`,
    sql`SELECT ja.jornada_id, u.id, u.nombre, c.nombre AS cargo
      FROM jornada_asistentes ja JOIN usuarios u ON u.id = ja.usuario_id LEFT JOIN cargos c ON c.id = u.cargo_id
      WHERE ja.jornada_id IN ${sql(ids)} ORDER BY lower(u.nombre), u.id`,
    sql`SELECT DISTINCT jv.jornada_id, COALESCE(dp.proceso_id, s.proceso_id) AS proceso_id
      FROM jornada_versiones jv JOIN documento_versiones v ON v.id = jv.version_id
      JOIN documento_proceso dp ON dp.documento_id = v.documento_id
      LEFT JOIN subprocesos s ON s.id = dp.subproceso_id
      WHERE jv.jornada_id IN ${sql(ids)}`,
  ]);

  const jornadas: Jornada[] = [];
  for (const f of filas) {
    const id = Number(f.id);
    const susVersiones = versiones.filter((v) => Number(v.jornada_id) === id);
    const { ve, evidencia } = await puedeVerJornada(
      sesion,
      {
        procesoIds: procesos.filter((p) => Number(p.jornada_id) === id).map((p) => Number(p.proceso_id)),
        documentoIds: susVersiones.map((v) => Number(v.documento_id)),
      },
      { sql },
    );
    if (!ve) continue;
    // Sin evidencia, solo se nombran los documentos que la persona puede ver.
    const visibles: typeof susVersiones = [];
    for (const v of susVersiones) {
      if (evidencia || (await puedeAccederDocumento(Number(v.documento_id), sesion, { sql }))) visibles.push(v);
    }
    const susAsistentes = asistentes.filter((a) => Number(a.jornada_id) === id);
    const [{ n }] = await sql`SELECT count(*)::int AS n FROM archivos WHERE contexto = 'jornada' AND contexto_id = ${id} AND rol = 'evidencia'`;
    jornadas.push({
      id,
      fecha: f.fecha as string,
      modalidad: f.modalidad as ModalidadJornada,
      facilitador: { id: Number(f.facilitador_id), nombre: f.facilitador as string },
      observaciones: (f.observaciones as string | null) ?? null,
      asistentesExternos: (f.asistentes_externos as string | null) ?? null,
      registradaPor: { id: Number(f.registrada_por), nombre: f.registrada_por_nombre as string },
      creadoEn: f.creado_en as Date,
      anulada: f.anulada_en
        ? { en: f.anulada_en as Date, por: f.anulada_por_nombre as string, motivo: f.motivo_anulacion as string }
        : null,
      versiones: visibles.map((v) => ({
        versionId: Number(v.version_id),
        codigo: v.codigo as string,
        titulo: v.titulo as string,
        version: Number(v.numero),
        vigente: v.estado === "vigente",
      })),
      versionesOcultas: susVersiones.length - visibles.length,
      asistentes: evidencia
        ? susAsistentes.map((a) => ({ id: Number(a.id), nombre: a.nombre as string, cargo: (a.cargo as string | null) ?? null }))
        : [],
      asistentesCantidad: susAsistentes.length,
      evidencias: evidencia ? await evidenciasDe("jornada", id, { sql }) : [],
      evidenciasCantidad: Number(n),
      puedeVerEvidencia: evidencia,
    });
  }
  return jornadas;
}

/** Una jornada, o `null` si no existe o la persona no ve ninguno de sus documentos. */
export async function obtenerJornada(id: number, sesion: SesionFlujo, opciones?: Opciones): Promise<Jornada | null> {
  const sql = opciones?.sql ?? obtenerSql();
  const [j] = await cargarJornadas(sql, sesion, sql`j.id = ${id}`);
  return j ?? null;
}

export type FiltroJornadas = { desde?: Date; hasta?: Date; procesoId?: number };

function condicionDeFiltro(sql: Cliente, filtro: FiltroJornadas): ReturnType<Cliente> {
  const zona = zonaHoraria();
  const condicion = [
    filtro.desde ? sql`j.fecha >= ${fechaEnZona(filtro.desde, zona)}::date` : sql`true`,
    filtro.hasta ? sql`j.fecha < ${fechaEnZona(filtro.hasta, zona)}::date` : sql`true`,
    filtro.procesoId === undefined
      ? sql`true`
      : sql`EXISTS (SELECT 1 FROM jornada_versiones jv JOIN documento_versiones v ON v.id = jv.version_id
          JOIN documento_proceso dp ON dp.documento_id = v.documento_id
          LEFT JOIN subprocesos s ON s.id = dp.subproceso_id
          WHERE jv.jornada_id = j.id AND COALESCE(dp.proceso_id, s.proceso_id) = ${filtro.procesoId})`,
  ];
  return sql`${condicion[0]} AND ${condicion[1]} AND ${condicion[2]}`;
}

export async function listarJornadas(sesion: SesionFlujo, filtro: FiltroJornadas, opciones?: Opciones): Promise<Jornada[]> {
  const sql = opciones?.sql ?? obtenerSql();
  return cargarJornadas(sql, sesion, condicionDeFiltro(sql, filtro));
}

/**
 * Las jornadas del periodo que la persona ve, todas (sin el tope del listado), con la misma regla de evidencia: los
 * asistentes solo vienen en las que `puedeVerEvidencia`.
 */
export async function listarJornadasParaExcel(sesion: SesionFlujo, filtro: FiltroJornadas, opciones?: Opciones): Promise<Jornada[]> {
  const sql = opciones?.sql ?? obtenerSql();
  return cargarJornadas(sql, sesion, condicionDeFiltro(sql, filtro), null);
}

export async function jornadasDeVersion(versionId: number, sesion: SesionFlujo, opciones?: Opciones): Promise<Jornada[]> {
  const sql = opciones?.sql ?? obtenerSql();
  return cargarJornadas(sql, sesion, sql`EXISTS (SELECT 1 FROM jornada_versiones jv WHERE jv.jornada_id = j.id AND jv.version_id = ${versionId})`);
}

export type SocializacionDeVersion = {
  requerida: boolean;
  /** Solo mientras está pendiente. */
  venceEn: Date | null;
  cumplida: { jornadaId: number; fecha: string; modalidad: ModalidadJornada; asistentes: number; evidencias: number } | null;
  superada: boolean;
};

/** El estado de la socialización de una versión, para la ficha del documento y la página del trámite cerrado. */
export async function socializacionDeVersion(versionId: number, opciones?: Opciones): Promise<SocializacionDeVersion> {
  const sql = opciones?.sql ?? obtenerSql();
  const [r] = await sql`SELECT r.vence_en, r.cumplida_en, r.superada_en, r.jornada_id, j.fecha::text AS fecha, j.modalidad,
      (SELECT count(*)::int FROM jornada_asistentes ja WHERE ja.jornada_id = r.jornada_id) AS asistentes,
      (SELECT count(*)::int FROM archivos a WHERE a.contexto = 'jornada' AND a.contexto_id = r.jornada_id AND a.rol = 'evidencia') AS evidencias
    FROM socializaciones_requeridas r LEFT JOIN jornadas j ON j.id = r.jornada_id
    WHERE r.version_id = ${versionId}`;
  if (!r) return { requerida: false, venceEn: null, cumplida: null, superada: false };
  const cumplida = r.cumplida_en
    ? {
        jornadaId: Number(r.jornada_id),
        fecha: r.fecha as string,
        modalidad: r.modalidad as ModalidadJornada,
        asistentes: Number(r.asistentes),
        evidencias: Number(r.evidencias),
      }
    : null;
  const superada = r.superada_en !== null;
  return { requerida: true, venceEn: cumplida || superada ? null : (r.vence_en as Date), cumplida, superada };
}

/**
 * Lo que la ficha del documento muestra de la socialización de la vigente (spec 13B §10.4 y §13.3): su estado y
 * las jornadas no anuladas que la persona ve; `null` si el documento no tiene vigente.
 */
export async function socializacionDeFicha(
  documentoId: number,
  sesion: SesionFlujo,
  opciones?: Opciones,
): Promise<{ versionId: number; socializacion: SocializacionDeVersion; jornadas: Jornada[] } | null> {
  const sql = opciones?.sql ?? obtenerSql();
  const [v] = await sql`SELECT id FROM documento_versiones WHERE documento_id = ${documentoId} AND estado = 'vigente'`;
  if (!v) return null;
  const versionId = Number(v.id);
  const [socializacion, jornadas] = await Promise.all([
    socializacionDeVersion(versionId, { sql }),
    jornadasDeVersion(versionId, sesion, { sql }),
  ]);
  return { versionId, socializacion, jornadas: jornadas.filter((j) => j.anulada === null) };
}

export type OpcionesDeJornada = {
  /** La vigente de cada documento y sus versiones obsoletas (`vigente: false`), de la más nueva a la más vieja. */
  documentos: { versionId: number; codigo: string; titulo: string; version: number; vigente: boolean }[];
  personas: { id: number; nombre: string; cargo: string | null }[];
};

/** Lo que el formulario ofrece: las versiones vigentes de los documentos de su alcance y las personas activas. */
export async function opcionesDeJornada(sesion: SesionFlujo, opciones?: Opciones): Promise<OpcionesDeJornada> {
  const sql = opciones?.sql ?? obtenerSql();
  const [documentos, personas] = await Promise.all([
    sql`SELECT v.id, v.numero, v.estado, d.codigo, d.titulo
      FROM documentos d JOIN documento_versiones v ON v.documento_id = d.id AND v.estado IN ('vigente', 'obsoleto')
      WHERE ${documentoEnAlcance(sql, sesion)}
      ORDER BY d.codigo, v.numero DESC`,
    sql`SELECT u.id, u.nombre, c.nombre AS cargo FROM usuarios u LEFT JOIN cargos c ON c.id = u.cargo_id
      WHERE u.activo ORDER BY lower(u.nombre), u.id`,
  ]);
  return {
    documentos: documentos.map((f) => ({ versionId: Number(f.id), codigo: f.codigo as string, titulo: f.titulo as string, version: Number(f.numero), vigente: f.estado === "vigente" })),
    personas: personas.map((f) => ({ id: Number(f.id), nombre: f.nombre as string, cargo: (f.cargo as string | null) ?? null })),
  };
}

/** Los procesos del filtro del listado: los activos que la persona alcanza. */
export async function procesosParaFiltro(sesion: SesionFlujo, opciones?: Opciones): Promise<{ id: number; nombre: string }[]> {
  const sql = opciones?.sql ?? obtenerSql();
  const alcance = await alcanceProcesos(sesion, { sql });
  const filas = await sql`SELECT id, nombre FROM procesos WHERE activo ORDER BY orden, id`;
  return filas
    .filter((p) => alcance.todos || alcance.procesoIds.includes(Number(p.id)))
    .map((p) => ({ id: Number(p.id), nombre: p.nombre as string }));
}
