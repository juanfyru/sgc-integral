/**
 * El impacto documental de un cambio normativo (spec 13C §10.5 y §13.3). Cuando una norma pasa a modificada,
 * derogada o retirada, en la transacción del cambio nace un impacto por documento enlazado con versión vigente (en su
 * proceso propietario) y uno por proceso asociado que no tiene documentos enlazados, con el aviso a quien tiene la
 * tarea. El documento queda en atención en el semáforo (la consulta de vigencia lee el impacto pendiente) hasta que
 * se resuelve: con una solicitud de cambio, con la verificación de un externo o con «no afecta» y una nota.
 *
 * La tarea y los avisos son de los líderes del proceso o, si no tiene líder activo, de los Admin SGC (F13A-DC2).
 * Ningún aviso ni escalamiento nombra un documento (puede ser restringido): nombran la norma, que es pública para toda
 * sesión, y el proceso. La pasada de los impactos vencidos vive en `vencidos.ts` y se reexporta desde aquí.
 */
import type { TransactionSql } from "postgres";
import { obtenerSql, type Cliente } from "@/db/cliente";
import { registrarAuditoria } from "@/db/consultas/admin";
import { avisarA } from "@/db/consultas/avisos-vencimiento";
import { enTransaccion, type SesionFlujo } from "@/db/consultas/flujo/contrato";
import { adminsActivos, lideresDeProceso } from "@/db/consultas/tramites";
import { alcanceProcesos, filtroAcceso, puedeAccederDocumento, puedeVerImpacto } from "@/lib/alcance";
import {
  acotado,
  enlaceDeImpacto,
  ErrorNormograma,
  ETIQUETA_ESTADO_NORMA,
  type EstadoNorma,
  type ResolucionImpacto,
} from "@/lib/normograma/tipos";
import { cuenta } from "@/lib/plural";
import type { Tarea } from "@/lib/tareas";
import { fechaLimite } from "@/lib/tramites/plazos";
import { ETAPAS_ABIERTAS } from "@/lib/tramites/tipos";
import { zonaHoraria } from "@/lib/zona-horaria";
import { nombreSql } from "./busqueda";

export { impactosVencidos, type ContextoVencimientos } from "./vencidos";

type Opciones = { sql?: Cliente; ahora?: Date };

export const IMPACTO_NO_EXISTE = "El impacto no existe";
export const IMPACTO_RESUELTO = "Ese impacto ya está resuelto";

const estadoEnTexto = (estado: EstadoNorma) => ETIQUETA_ESTADO_NORMA[estado].toLowerCase();

/** El proceso tiene un líder activo: sus tareas no son del Admin SGC (F13A-DC2). Sobre `procesos p`. */
function procesoConLider(sql: Cliente) {
  return sql`(p.activo AND EXISTS (SELECT 1 FROM usuario_procesos lider_up
    JOIN usuarios lider_u ON lider_u.id = lider_up.usuario_id AND lider_u.activo AND lider_u.rol = 'lider_proceso'
    WHERE lider_up.proceso_id = p.id))`;
}

/**
 * Los impactos de un cambio (`cambioId`, ya insertado en `norma_cambios`), dentro de su transacción, y el aviso
 * `normograma.cambio` a quien tiene la tarea en cada proceso, salvo a quien hizo el cambio (nadie se avisa a sí mismo).
 * Un proceso asociado inactivo no recibe impacto de proceso: no tiene nada en circulación. Devuelve cuántos nacieron.
 */
export async function crearImpactos(
  tx: TransactionSql,
  d: { cambioId: number; normaId: number; ahora: Date; plazoDias: number },
): Promise<number> {
  const vence = fechaLimite(d.ahora, d.plazoDias, zonaHoraria());
  const deDocumentos = await tx`INSERT INTO impactos_normativos (cambio_id, norma_id, documento_id, proceso_id, vence_en, creado_en)
    SELECT ${d.cambioId}, ${d.normaId}, nd.documento_id, COALESCE(dp.proceso_id, s.proceso_id), ${vence}, ${d.ahora}
    FROM norma_documentos nd
    JOIN documento_versiones v ON v.documento_id = nd.documento_id AND v.estado = 'vigente'
    JOIN documento_proceso dp ON dp.documento_id = nd.documento_id AND dp.es_principal
    LEFT JOIN subprocesos s ON s.id = dp.subproceso_id
    WHERE nd.norma_id = ${d.normaId}
    ORDER BY nd.documento_id
    RETURNING proceso_id`;
  const deProcesos = await tx`INSERT INTO impactos_normativos (cambio_id, norma_id, documento_id, proceso_id, vence_en, creado_en)
    SELECT ${d.cambioId}, ${d.normaId}, NULL, np.proceso_id, ${vence}, ${d.ahora}
    FROM norma_procesos np
    JOIN procesos p ON p.id = np.proceso_id AND p.activo
    WHERE np.norma_id = ${d.normaId}
      AND NOT EXISTS (SELECT 1 FROM impactos_normativos i WHERE i.cambio_id = ${d.cambioId} AND i.proceso_id = np.proceso_id)
    ORDER BY np.proceso_id
    RETURNING proceso_id`;
  const total = deDocumentos.length + deProcesos.length;
  if (total === 0) return 0;

  const documentosPorProceso = new Map<number, number>();
  for (const f of deDocumentos) documentosPorProceso.set(Number(f.proceso_id), (documentosPorProceso.get(Number(f.proceso_id)) ?? 0) + 1);
  for (const f of deProcesos) documentosPorProceso.set(Number(f.proceso_id), 0);

  const [cambio] = await tx`SELECT ${nombreSql(tx)} AS norma, c.estado_nuevo, c.usuario_id
    FROM norma_cambios c JOIN normas n ON n.id = c.norma_id JOIN tipos_norma tn ON tn.id = n.tipo_norma_id
    WHERE c.id = ${d.cambioId}`;
  const procesos = await tx`SELECT id, nombre FROM procesos WHERE id = ANY(${[...documentosPorProceso.keys()]}) ORDER BY id`;
  const admins = await adminsActivos({ sql: tx });
  for (const p of procesos) {
    const procesoId = Number(p.id);
    const lideres = await lideresDeProceso(procesoId, { sql: tx });
    const destinatarios = (lideres.length > 0 ? lideres : admins).filter((u) => u !== Number(cambio.usuario_id));
    if (destinatarios.length === 0) continue;
    const documentos = documentosPorProceso.get(procesoId) ?? 0;
    const cuerpo = documentos > 0
      ? `${cuenta(documentos, "documento del proceso está enlazado", "documentos del proceso están enlazados")} a la norma: abra una solicitud de cambio o registre que no afecta.`
      : "La norma está asociada al proceso: confirme si algo del proceso cambia o registre que no afecta.";
    await avisarA(
      tx,
      {
        tipo: "normograma.cambio",
        titulo: `${cambio.norma} pasó a ${estadoEnTexto(cambio.estado_nuevo)}: revise su impacto en ${p.nombre}`,
        enlace: enlaceDeImpacto(d.cambioId, procesoId),
        entidad: "norma",
        entidadId: d.normaId,
      },
      destinatarios.map((usuarioId) => ({ usuarioId, cuerpo })),
    );
  }
  return total;
}

export type Impacto = {
  id: number;
  cambio: { id: number; norma: { id: number; nombre: string }; estadoNuevo: EstadoNorma; fecha: string };
  proceso: { id: number; nombre: string; sigla: string };
  /** Nulo en el impacto de proceso. `version` es la vigente de hoy (nula si el documento dejó de tenerla). */
  documento: {
    id: number;
    codigo: string;
    titulo: string;
    origen: "interno" | "externo";
    version: number | null;
    tramiteAbierto: { id: number; numero: string } | null;
  } | null;
  estado: "pendiente" | "resuelto";
  venceEn: Date;
  resolucion: ResolucionImpacto | null;
  tramite: { id: number; numero: string } | null;
  verificacion: { id: number; resultado: string } | null;
  nota: string | null;
  resueltoPor: string | null;
  resueltoEn: Date | null;
};

/**
 * Los impactos de un cambio en un proceso, pendientes y resueltos: los documentos por código y al final el de
 * proceso. `null` si la persona no los ve (`puedeVerImpacto`) o no hay ninguno: para ella no existen. Un documento que
 * la persona no ve no sale.
 */
export async function impactosDe(cambioId: number, procesoId: number, sesion: SesionFlujo, opciones?: Opciones): Promise<Impacto[] | null> {
  const sql = opciones?.sql ?? obtenerSql();
  if (!puedeVerImpacto(sesion, procesoId, await alcanceProcesos(sesion, { sql }))) return null;
  const filas = await sql`
    SELECT i.id, i.estado, i.vence_en, i.resolucion, i.nota, i.resuelto_en, ur.nombre AS resuelto_por,
      c.id AS cambio_id, c.estado_nuevo, c.fecha::text AS fecha, n.id AS norma_id, ${nombreSql(sql)} AS norma,
      p.id AS proceso_id, p.nombre AS proceso_nombre, p.sigla AS proceso_sigla,
      d.id AS documento_id, d.codigo, d.titulo, d.origen, v.numero AS version,
      abierto.id AS abierto_id, abierto.numero AS abierto_numero,
      tr.id AS tramite_id, tr.numero AS tramite_numero,
      ev.id AS verificacion_id, ev.resultado AS verificacion_resultado
    FROM impactos_normativos i
    JOIN norma_cambios c ON c.id = i.cambio_id
    JOIN normas n ON n.id = i.norma_id
    JOIN tipos_norma tn ON tn.id = n.tipo_norma_id
    JOIN procesos p ON p.id = i.proceso_id
    LEFT JOIN documentos d ON d.id = i.documento_id
    LEFT JOIN documento_versiones v ON v.documento_id = d.id AND v.estado = 'vigente'
    LEFT JOIN LATERAL (
      SELECT t.id, t.numero FROM tramites t WHERE t.documento_id = d.id AND t.etapa = ANY(${ETAPAS_ABIERTAS}) LIMIT 1
    ) abierto ON true
    LEFT JOIN tramites tr ON tr.id = i.tramite_id
    LEFT JOIN externo_verificaciones ev ON ev.id = i.verificacion_id
    LEFT JOIN usuarios ur ON ur.id = i.resuelto_por
    WHERE i.cambio_id = ${cambioId} AND i.proceso_id = ${procesoId}
      AND (i.documento_id IS NULL OR ${filtroAcceso(sql, sesion)})
    ORDER BY i.documento_id IS NULL, d.codigo, i.id`;
  if (filas.length === 0) return null;
  return filas.map((f) => ({
    id: Number(f.id),
    cambio: { id: Number(f.cambio_id), norma: { id: Number(f.norma_id), nombre: f.norma }, estadoNuevo: f.estado_nuevo, fecha: f.fecha },
    proceso: { id: Number(f.proceso_id), nombre: f.proceso_nombre, sigla: f.proceso_sigla },
    documento: f.documento_id === null
      ? null
      : {
          id: Number(f.documento_id),
          codigo: f.codigo,
          titulo: f.titulo,
          origen: f.origen,
          version: f.version ?? null,
          tramiteAbierto: f.abierto_id === null ? null : { id: Number(f.abierto_id), numero: f.abierto_numero },
        },
    estado: f.estado,
    venceEn: new Date(f.vence_en),
    resolucion: f.resolucion ?? null,
    tramite: f.tramite_id === null ? null : { id: Number(f.tramite_id), numero: f.tramite_numero },
    verificacion: f.verificacion_id === null ? null : { id: Number(f.verificacion_id), resultado: f.verificacion_resultado },
    nota: f.nota ?? null,
    resueltoPor: f.resuelto_por ?? null,
    resueltoEn: f.resuelto_en === null ? null : new Date(f.resuelto_en),
  }));
}

/** El impacto pendiente más reciente de un documento (la marca «Revisión por cambio normativo» de su ficha). */
export async function impactoPendienteDe(documentoId: number, opciones?: Opciones): Promise<{ cambioId: number; norma: string } | null> {
  const sql = opciones?.sql ?? obtenerSql();
  const [f] = await sql`SELECT i.cambio_id, ${nombreSql(sql)} AS norma
    FROM impactos_normativos i JOIN normas n ON n.id = i.norma_id JOIN tipos_norma tn ON tn.id = n.tipo_norma_id
    WHERE i.documento_id = ${documentoId} AND i.estado = 'pendiente'
    ORDER BY i.creado_en DESC, i.id DESC LIMIT 1`;
  return f ? { cambioId: Number(f.cambio_id), norma: f.norma } : null;
}

/**
 * El impacto pendiente `impactoId` sobre el documento `documentoId`, para la verificación de un externo que lo resuelve
 * (`/vigencia/externos/[id]?impacto=`). Quien llama ya decidió que la persona ve el externo y puede verificarlo:
 * `registrarVerificacion` repite las comprobaciones bajo el candado.
 */
export async function impactoPendienteDelDocumento(
  impactoId: number,
  documentoId: number,
  opciones?: Opciones,
): Promise<{ id: number; norma: string; proceso: string } | null> {
  const sql = opciones?.sql ?? obtenerSql();
  const [f] = await sql`SELECT i.id, ${nombreSql(sql)} AS norma, p.nombre AS proceso
    FROM impactos_normativos i
    JOIN normas n ON n.id = i.norma_id JOIN tipos_norma tn ON tn.id = n.tipo_norma_id
    JOIN procesos p ON p.id = i.proceso_id
    WHERE i.id = ${impactoId} AND i.documento_id = ${documentoId} AND i.estado = 'pendiente'`;
  return f ? { id: Number(f.id), norma: f.norma as string, proceso: f.proceso as string } : null;
}

/** Las de quien ve el impacto; la verificación de un externo llega por `resolverImpactoPorVerificacion`. */
export type ResolucionDeImpacto = { resolucion: "no_afecta"; nota: string } | { resolucion: "solicitud"; tramiteId: number };

type Resolucion = ResolucionDeImpacto | { resolucion: "verificacion"; verificacionId: number };

type ImpactoBloqueado = {
  id: number;
  cambioId: number;
  /** Cuándo se registró el cambio: un trámite cerrado antes no lo atiende. */
  cambioEn: Date;
  normaId: number;
  norma: string;
  estadoNuevo: EstadoNorma;
  documentoId: number | null;
  codigo: string | null;
  origen: "interno" | "externo" | null;
  procesoId: number;
  proceso: string;
  estado: "pendiente" | "resuelto";
};

async function impactoBloqueado(tx: TransactionSql, impactoId: number): Promise<ImpactoBloqueado | null> {
  const [f] = await tx`SELECT i.id, i.cambio_id, c.creado_en AS cambio_en, i.norma_id, ${nombreSql(tx)} AS norma, c.estado_nuevo, i.documento_id,
      d.codigo, d.origen, i.proceso_id, p.nombre AS proceso, i.estado
    FROM impactos_normativos i
    JOIN norma_cambios c ON c.id = i.cambio_id
    JOIN normas n ON n.id = i.norma_id
    JOIN tipos_norma tn ON tn.id = n.tipo_norma_id
    JOIN procesos p ON p.id = i.proceso_id
    LEFT JOIN documentos d ON d.id = i.documento_id
    WHERE i.id = ${impactoId}
    FOR UPDATE OF i`;
  if (!f) return null;
  return {
    id: Number(f.id),
    cambioId: Number(f.cambio_id),
    cambioEn: new Date(f.cambio_en),
    normaId: Number(f.norma_id),
    norma: f.norma,
    estadoNuevo: f.estado_nuevo,
    documentoId: f.documento_id === null ? null : Number(f.documento_id),
    codigo: f.codigo ?? null,
    origen: f.origen ?? null,
    procesoId: Number(f.proceso_id),
    proceso: f.proceso,
    estado: f.estado,
  };
}

/** Resuelve un impacto ya bloqueado; quien llama ya decidió que la persona puede. */
async function resolverBloqueado(tx: TransactionSql, usuarioId: number, i: ImpactoBloqueado, d: Resolucion, ahora: Date): Promise<void> {
  if (i.estado !== "pendiente") throw new ErrorNormograma(IMPACTO_RESUELTO);
  let nota: string | null = null;
  let tramite: { id: number; numero: string } | null = null;
  let verificacionId: number | null = null;
  if (d.resolucion === "no_afecta") {
    nota = acotado(d.nota, "La nota", 5, 1000);
  } else if (d.resolucion === "solicitud") {
    if (i.origen === "externo") throw new ErrorNormograma("Un documento externo no tiene trámite: verifíquelo o registre que no afecta");
    const [t] = await tx`SELECT id, numero, tipo, documento_id, proceso_id, creado_en, etapa = ANY(${ETAPAS_ABIERTAS}) AS abierto
      FROM tramites WHERE id = ${d.tramiteId}`;
    if (i.documentoId !== null) {
      if (!t || Number(t.documento_id) !== i.documentoId) throw new ErrorNormograma("La solicitud no es de este documento");
    } else if (!t || t.tipo !== "crear" || Number(t.proceso_id) !== i.procesoId) {
      throw new ErrorNormograma("La solicitud no es una creación en este proceso");
    }
    // La atiende la que está abierta (spec 13C §10.5: «si ya tiene un trámite abierto, se enlaza») o la que nació
    // después del cambio, aunque luego se cerrara; una cerrada de antes no sabía de él.
    if (!t.abierto && new Date(t.creado_en).getTime() < i.cambioEn.getTime()) {
      throw new ErrorNormograma("La solicitud ya está cerrada y es anterior al cambio de la norma: abra una nueva");
    }
    tramite = { id: Number(t.id), numero: t.numero };
  } else if (d.resolucion === "verificacion") {
    if (i.origen !== "externo") throw new ErrorNormograma("Solo el impacto sobre un documento externo se resuelve con una verificación");
    // La verificación se registró para este impacto (`registrarVerificacion` con `impactoId`).
    const [v] = await tx`SELECT id FROM externo_verificaciones
      WHERE id = ${d.verificacionId} AND documento_id = ${i.documentoId} AND impacto_id = ${i.id}`;
    if (!v) throw new ErrorNormograma("La verificación no es de este impacto");
    verificacionId = Number(v.id);
  } else {
    throw new ErrorNormograma("Elija cómo se resuelve el impacto");
  }

  await tx`UPDATE impactos_normativos
    SET estado = 'resuelto', resolucion = ${d.resolucion}, tramite_id = ${tramite?.id ?? null}, verificacion_id = ${verificacionId},
      nota = ${nota}, resuelto_por = ${usuarioId}, resuelto_en = ${ahora}
    WHERE id = ${i.id}`;
  await registrarAuditoria(tx, {
    usuarioId,
    accion: "impacto_resuelto",
    // En la historia del documento cuando lo hay; si no, en la del proceso.
    entidad: i.documentoId === null ? "proceso" : "documento",
    entidadId: i.documentoId ?? i.procesoId,
    detalle: {
      impactoId: i.id,
      cambioId: i.cambioId,
      normaId: i.normaId,
      norma: i.norma,
      estadoNuevo: i.estadoNuevo,
      codigo: i.codigo,
      proceso: i.proceso,
      resolucion: d.resolucion,
      nota,
      tramite: tramite?.numero ?? null,
      verificacionId,
    },
  });
}

/**
 * Resuelve un impacto (spec 13C §10.5): lo hace quien lo ve (`puedeVerImpacto`, el líder del proceso o el Admin SGC);
 * para los demás no existe. «No afecta» lleva una nota de al menos 5 caracteres; «solicitud», un trámite del
 * documento (o, en el impacto de proceso, una creación en el proceso) abierto o nacido después del cambio, nunca sobre
 * un externo. La verificación de un externo resuelve su impacto desde `registrarVerificacion`.
 */
export async function resolverImpacto(sesion: SesionFlujo, d: { impactoId: number } & ResolucionDeImpacto, opciones?: Opciones): Promise<void> {
  const sql = opciones?.sql ?? obtenerSql();
  const ahora = opciones?.ahora ?? new Date();
  await enTransaccion(sql, async (tx) => {
    const impacto = await impactoBloqueado(tx, d.impactoId);
    if (!impacto || !puedeVerImpacto(sesion, impacto.procesoId, await alcanceProcesos(sesion, { sql: tx }))) {
      throw new ErrorNormograma(IMPACTO_NO_EXISTE);
    }
    if (impacto.documentoId !== null && !(await puedeAccederDocumento(impacto.documentoId, sesion, { sql: tx }))) {
      throw new ErrorNormograma(IMPACTO_NO_EXISTE);
    }
    await resolverBloqueado(tx, sesion.usuarioId, impacto, d, ahora);
  });
}

/**
 * La verificación de un externo resuelve su impacto dentro de la transacción de la verificación. `registrarVerificacion`
 * ya decidió quién puede verificar (su responsable técnico, que puede ser de rol Consulta, o quien lo gestiona) y que
 * el impacto es de ese externo y está pendiente: aquí no se vuelve a pedir `puedeVerImpacto`.
 */
export async function resolverImpactoPorVerificacion(
  tx: TransactionSql,
  usuarioId: number,
  d: { impactoId: number; verificacionId: number },
  ahora: Date,
): Promise<void> {
  const impacto = await impactoBloqueado(tx, d.impactoId);
  if (!impacto) throw new ErrorNormograma(IMPACTO_NO_EXISTE);
  await resolverBloqueado(tx, usuarioId, impacto, { resolucion: "verificacion", verificacionId: d.verificacionId }, ahora);
}

/**
 * «Revisar el impacto de Resolución 2003 de 2014 (derogada) en Consulta Externa (2)»: una tarea por cambio y proceso
 * con impactos pendientes, del líder en sus procesos activos o del Admin SGC en los que no tienen líder activo
 * (F13A-DC2). Una sola consulta, sin la de vigencia; quien no lidera ni es Admin SGC no consulta nada. Cuenta con el
 * mismo filtro de acceso que `impactosDe`: un documento que la persona no ve no suma, y si solo quedan esos, no hay tarea
 * (su página sería «no encontrada»).
 */
export async function tareasDeImpactos(sesion: SesionFlujo, opciones?: Opciones): Promise<Tarea[]> {
  if (sesion.rol !== "lider_proceso" && sesion.rol !== "admin_sgc") return [];
  const sql = opciones?.sql ?? obtenerSql();
  const dePersona = sesion.rol === "lider_proceso"
    ? sql`p.activo AND EXISTS (SELECT 1 FROM usuario_procesos up WHERE up.usuario_id = ${sesion.usuarioId} AND up.proceso_id = p.id)`
    : sql`NOT ${procesoConLider(sql)}`;
  const filas = await sql`
    SELECT i.cambio_id, i.proceso_id, p.nombre AS proceso, c.estado_nuevo, ${nombreSql(sql)} AS norma, n.titulo,
      count(*)::int AS pendientes, min(i.vence_en) AS vence
    FROM impactos_normativos i
    JOIN norma_cambios c ON c.id = i.cambio_id
    JOIN normas n ON n.id = i.norma_id
    JOIN tipos_norma tn ON tn.id = n.tipo_norma_id
    JOIN procesos p ON p.id = i.proceso_id
    LEFT JOIN documentos d ON d.id = i.documento_id
    WHERE i.estado = 'pendiente' AND ${dePersona}
      AND (i.documento_id IS NULL OR ${filtroAcceso(sql, sesion)})
    GROUP BY i.cambio_id, i.proceso_id, p.nombre, c.estado_nuevo, tn.nombre, n.numero, n.anio, n.titulo
    ORDER BY min(i.vence_en), i.cambio_id, p.nombre`;
  return filas.map((f) => ({
    id: `impacto:${Number(f.cambio_id)}:${Number(f.proceso_id)}`,
    modulo: "documentos",
    titulo: `Revisar el impacto de ${f.norma} (${estadoEnTexto(f.estado_nuevo)}) en ${f.proceso} (${f.pendientes})`,
    detalle: f.titulo,
    vence: new Date(f.vence),
    enlace: enlaceDeImpacto(Number(f.cambio_id), Number(f.proceso_id)),
  }));
}
