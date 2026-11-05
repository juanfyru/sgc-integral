/**
 * Lecturas del trámite: bandeja, detalle y quién ve qué. Las escrituras y las transiciones
 * viven en `tramites-flujo.ts`. La decisión de quién ve un trámite es `puedeVerTramite`; aquí
 * solo se reúnen sus datos, en una consulta, para que la usen la bandeja, la página y
 * `transicionar` sin repetirla.
 */
import type { Row } from "postgres";
import { obtenerSql, type Cliente } from "@/db/cliente";
import {
  alcanceProcesos,
  enAlcance,
  filtroAcceso,
  puedeVerTramite,
} from "@/lib/alcance";
import { puede } from "@/lib/permisos";
import { accionesDisponibles, type Accion } from "@/lib/tramites/transiciones";
import {
  ETAPAS_TRABAJO,
  esEtapaDeTrabajo,
  type Etapa,
  type TipoSolicitud,
} from "@/lib/tramites/tipos";
import type { FilaTramite, SesionFlujo } from "./flujo/contrato";

const ETAPAS_ABIERTAS: string[] = [...ETAPAS_TRABAJO];

export type ResumenTramite = {
  id: number;
  numero: string;
  tipo: TipoSolicitud;
  etapa: Etapa;
  ronda: number;
  codigo: string | null;
  titulo: string;
  versionNumero: number | null;
  procesoNombre: string;
  responsables: string[];
  venceEn: Date | null;
};

export type EventoTramite = {
  tipo: string;
  persona: string | null;
  ronda: number;
  detalle: Record<string, unknown>;
  creadoEn: Date;
};

export type DetalleTramite = FilaTramite & {
  codigo: string | null;
  titulo: string;
  versionNumero: number | null;
  procesoNombre: string;
  solicitante: string;
  elaborador: string | null;
  revisor: string | null;
  aprobador: string | null;
  acciones: Accion[];
  eventos: EventoTramite[];
};

/** Un trámite junto con lo que sobre él puede decidir quien lo mira. */
export type TramiteVisto = {
  tramite: FilaTramite;
  visible: boolean;
  lideraPropietario: boolean;
  codigo: string | null;
  titulo: string;
  versionNumero: number | null;
  procesoNombre: string;
  solicitante: string;
  elaborador: string | null;
  revisor: string | null;
  aprobador: string | null;
  responsables: string[];
};

const idONulo = (v: unknown): number | null => (v === null ? null : Number(v));

function aFilaTramite(f: Row): FilaTramite {
  return {
    id: Number(f.id),
    numero: f.numero,
    tipo: f.tipo,
    motivo: f.motivo,
    justificacion: f.justificacion,
    solicitanteId: Number(f.solicitante_id),
    procesoId: Number(f.proceso_id),
    subprocesoId: idONulo(f.subproceso_id),
    tipoDocumentoId: idONulo(f.tipo_documento_id),
    tituloPropuesto: f.titulo_propuesto,
    documentoId: idONulo(f.documento_id),
    versionId: idONulo(f.version_id),
    etapa: f.etapa,
    ronda: f.ronda,
    elaboradorId: idONulo(f.elaborador_id),
    revisorId: idONulo(f.revisor_id),
    aprobadorId: idONulo(f.aprobador_id),
    venceEn: f.vence_en,
    motivoCierre: f.motivo_cierre,
    creadoEn: f.creado_en,
  };
}

/**
 * Trámites que cumplen `condicion` (sobre `t`), vistos por `sesion`. `visible` en falso quiere
 * decir que para esa persona el trámite no existe; cada llamador debe mirarlo.
 */
async function tramitesVistos(
  sql: Cliente,
  sesion: SesionFlujo,
  condicion: ReturnType<typeof filtroAcceso>,
  bloquear = false,
): Promise<TramiteVisto[]> {
  const alcance = await alcanceProcesos(sesion, { sql });
  const liderados = alcance.todos ? [] : alcance.procesoIds;
  const filas = await sql`SELECT t.id, t.numero, t.tipo, t.motivo, t.justificacion, t.solicitante_id,
      t.proceso_id, t.subproceso_id, t.tipo_documento_id, t.titulo_propuesto, t.documento_id,
      t.version_id, t.etapa, t.ronda, t.elaborador_id, t.revisor_id, t.aprobador_id, t.vence_en,
      t.motivo_cierre, t.creado_en,
      d.codigo,
      CASE WHEN t.tipo = 'crear' THEN COALESCE(d.titulo, t.titulo_propuesto, '')
           ELSE COALESCE(t.titulo_propuesto, d.titulo, '') END AS titulo,
      v.numero AS version_numero,
      p.nombre AS proceso_nombre,
      us.nombre AS solicitante, ue.nombre AS elaborador, ur.nombre AS revisor, ua.nombre AS aprobador,
      ARRAY(
        SELECT u.nombre FROM usuarios u
        WHERE (t.etapa = 'elaboracion' AND u.id = t.elaborador_id)
           OR (t.etapa = 'revision' AND u.id = t.revisor_id)
           OR (t.etapa = 'aprobacion' AND u.id = t.aprobador_id)
           OR (t.etapa IN ('aceptacion', 'publicacion') AND u.rol = 'admin_sgc' AND u.activo)
           OR (t.etapa = 'visto_bueno' AND u.rol = 'lider_proceso' AND u.activo AND EXISTS (
                SELECT 1 FROM usuario_procesos resp_up
                WHERE resp_up.usuario_id = u.id AND resp_up.proceso_id = t.proceso_id))
        ORDER BY u.nombre
      ) AS responsables,
      (t.proceso_id = ANY(${liderados})) AS lidera_propietario,
      (t.proceso_id = ANY(${liderados}) OR EXISTS (
        SELECT 1 FROM documento_proceso dp
        LEFT JOIN subprocesos s ON s.id = dp.subproceso_id
        WHERE dp.documento_id = t.documento_id
          AND COALESCE(dp.proceso_id, s.proceso_id) = ANY(${liderados})
      )) AS lidera_alguno,
      (t.documento_id IS NULL OR ${filtroAcceso(sql, sesion)}) AS pasa_nivel_acceso
    FROM tramites t
    JOIN procesos p ON p.id = t.proceso_id
    JOIN usuarios us ON us.id = t.solicitante_id
    LEFT JOIN documentos d ON d.id = t.documento_id
    LEFT JOIN documento_versiones v ON v.id = t.version_id
    LEFT JOIN usuarios ue ON ue.id = t.elaborador_id
    LEFT JOIN usuarios ur ON ur.id = t.revisor_id
    LEFT JOIN usuarios ua ON ua.id = t.aprobador_id
    WHERE ${condicion}
    ORDER BY t.vence_en NULLS LAST, t.id DESC
    ${bloquear ? sql`FOR UPDATE OF t` : sql``}`;

  return filas.map((f) => {
    const tramite = aFilaTramite(f);
    const { solicitanteId, elaboradorId, revisorId, aprobadorId } = tramite;
    return {
      tramite,
      visible: puedeVerTramite({
        etapa: tramite.etapa,
        esParticipante: [solicitanteId, elaboradorId, revisorId, aprobadorId].includes(sesion.usuarioId),
        rol: sesion.rol,
        lideraAlgunProceso: f.lidera_alguno,
        verHistorial: sesion.verHistorial,
        pasaNivelAcceso: f.pasa_nivel_acceso,
      }),
      lideraPropietario: f.lidera_propietario,
      codigo: f.codigo,
      titulo: f.titulo,
      versionNumero: f.version_numero,
      procesoNombre: f.proceso_nombre,
      solicitante: f.solicitante,
      elaborador: f.elaborador,
      revisor: f.revisor,
      aprobador: f.aprobador,
      responsables: f.responsables,
    };
  });
}

/** Un trámite visto por `sesion`, o null si no existe. `bloquear` toma la fila con `FOR UPDATE`. */
export async function tramiteVisto(
  sql: Cliente,
  id: number,
  sesion: SesionFlujo,
  bloquear = false,
): Promise<TramiteVisto | null> {
  const [fila] = await tramitesVistos(sql, sesion, sql`t.id = ${id}`, bloquear);
  return fila ?? null;
}

function accionesDe(v: TramiteVisto, sesion: SesionFlujo): Accion[] {
  return accionesDisponibles(v.tramite, {
    usuarioId: sesion.usuarioId,
    rol: sesion.rol,
    lideraPropietario: v.lideraPropietario,
  });
}

/** No son un paso que le toque a nadie: se pueden hacer en cualquier etapa, sin que nadie espere. */
const ACCIONES_SIN_TAREA: readonly Accion[] = ["cancelar", "reasignar", "retirar"];

export async function listarTramites(
  sesion: SesionFlujo,
  pestana: "por_hacer" | "en_curso" | "cerrados",
  opciones?: { sql?: Cliente },
): Promise<ResumenTramite[]> {
  const sql = opciones?.sql ?? obtenerSql();
  const condicion =
    pestana === "cerrados" ? sql`NOT (t.etapa = ANY(${ETAPAS_ABIERTAS}))` : sql`t.etapa = ANY(${ETAPAS_ABIERTAS})`;
  const vistos = (await tramitesVistos(sql, sesion, condicion)).filter((v) => v.visible);
  const elegidos =
    pestana === "por_hacer"
      ? vistos.filter((v) => accionesDe(v, sesion).some((a) => !ACCIONES_SIN_TAREA.includes(a)))
      : vistos;
  return elegidos.map((v) => ({
    id: v.tramite.id,
    numero: v.tramite.numero,
    tipo: v.tramite.tipo,
    etapa: v.tramite.etapa,
    ronda: v.tramite.ronda,
    codigo: v.codigo,
    titulo: v.titulo,
    versionNumero: v.versionNumero,
    procesoNombre: v.procesoNombre,
    responsables: esEtapaDeTrabajo(v.tramite.etapa) ? v.responsables : [],
    venceEn: v.tramite.venceEn,
  }));
}

export async function obtenerTramite(
  id: number,
  sesion: SesionFlujo,
  opciones?: { sql?: Cliente },
): Promise<DetalleTramite | null> {
  const sql = opciones?.sql ?? obtenerSql();
  const visto = await tramiteVisto(sql, id, sesion);
  if (!visto?.visible) return null;
  const eventos = await sql`SELECT e.tipo, u.nombre AS persona, e.ronda, e.detalle, e.creado_en
    FROM tramite_eventos e LEFT JOIN usuarios u ON u.id = e.usuario_id
    WHERE e.tramite_id = ${id}
    ORDER BY e.id`;
  return {
    ...visto.tramite,
    codigo: visto.codigo,
    titulo: visto.titulo,
    versionNumero: visto.versionNumero,
    procesoNombre: visto.procesoNombre,
    solicitante: visto.solicitante,
    elaborador: visto.elaborador,
    revisor: visto.revisor,
    aprobador: visto.aprobador,
    acciones: accionesDe(visto, sesion),
    eventos: eventos.map((e) => ({
      tipo: e.tipo,
      persona: e.persona,
      ronda: e.ronda,
      detalle: e.detalle,
      creadoEn: e.creado_en,
    })),
  };
}

export async function participaEnTramites(usuarioId: number, opciones?: { sql?: Cliente }): Promise<boolean> {
  const sql = opciones?.sql ?? obtenerSql();
  const [fila] = await sql`SELECT EXISTS (
      SELECT 1 FROM tramites
      WHERE solicitante_id = ${usuarioId} OR elaborador_id = ${usuarioId}
         OR revisor_id = ${usuarioId} OR aprobador_id = ${usuarioId}
    ) AS participa`;
  return fila.participa;
}

/** Usuarios activos con rol `lider_proceso` asignados a ese proceso; uno inactivo no tiene líderes. */
export async function lideresDeProceso(procesoId: number, opciones?: { sql?: Cliente }): Promise<number[]> {
  const sql = opciones?.sql ?? obtenerSql();
  const filas = await sql`SELECT u.id
    FROM usuario_procesos up
    JOIN usuarios u ON u.id = up.usuario_id AND u.activo AND u.rol = 'lider_proceso'
    JOIN procesos p ON p.id = up.proceso_id AND p.activo
    WHERE up.proceso_id = ${procesoId}
    ORDER BY u.id`;
  return filas.map((f) => Number(f.id));
}

export async function adminsActivos(opciones?: { sql?: Cliente }): Promise<number[]> {
  const sql = opciones?.sql ?? obtenerSql();
  const filas = await sql`SELECT id FROM usuarios WHERE rol = 'admin_sgc' AND activo ORDER BY id`;
  return filas.map((f) => Number(f.id));
}

/** Proceso propietario del documento: el de su asociación principal, o el de su subproceso. */
export async function propietarioDeDocumento(
  documentoId: number,
  opciones?: { sql?: Cliente },
): Promise<{ procesoId: number; subprocesoId: number | null } | null> {
  const sql = opciones?.sql ?? obtenerSql();
  const [f] = await sql`SELECT COALESCE(dp.proceso_id, s.proceso_id) AS proceso_id, dp.subproceso_id
    FROM documento_proceso dp
    LEFT JOIN subprocesos s ON s.id = dp.subproceso_id
    WHERE dp.documento_id = ${documentoId} AND dp.es_principal`;
  return f ? { procesoId: Number(f.proceso_id), subprocesoId: idONulo(f.subproceso_id) } : null;
}

/** La misma regla de `crearSolicitud`: el líder pide sobre el proceso propietario, si es suyo. */
export async function puedePedirSobreDocumento(
  sesion: SesionFlujo,
  documentoId: number,
  opciones?: { sql?: Cliente },
): Promise<boolean> {
  if (!puede(sesion, "tramites.solicitar")) return false;
  const sql = opciones?.sql ?? obtenerSql();
  const propietario = await propietarioDeDocumento(documentoId, { sql });
  return propietario !== null && enAlcance(await alcanceProcesos(sesion, { sql }), propietario.procesoId);
}

/** Código y título para los avisos y la bitácora; `texto` no lleva contenido del documento. */
export async function rotuloDeTramite(
  sql: Cliente,
  t: Pick<FilaTramite, "tipo" | "documentoId" | "tituloPropuesto">,
): Promise<{ codigo: string | null; titulo: string; texto: string }> {
  const [d] = t.documentoId === null ? [] : await sql`SELECT codigo, titulo FROM documentos WHERE id = ${t.documentoId}`;
  const codigo: string | null = d?.codigo ?? null;
  const titulo: string =
    (t.tipo === "crear" ? (d?.titulo ?? t.tituloPropuesto) : (t.tituloPropuesto ?? d?.titulo)) ?? "";
  return { codigo, titulo, texto: [codigo, titulo].filter(Boolean).join(" ") };
}

export type DatosParaSolicitar = {
  procesos: { id: number; nombre: string; sigla: string; subprocesos: { id: number; nombre: string }[] }[];
  tipos: { id: number; nombre: string; sigla: string }[];
  documentos: { id: number; codigo: string; titulo: string; proceso: string; conTramite: boolean }[];
};

/** Lo que `sesion` puede elegir en una solicitud: el líder, solo sus procesos y sus documentos vigentes. */
export async function datosParaSolicitar(
  sesion: SesionFlujo,
  opciones?: { sql?: Cliente },
): Promise<DatosParaSolicitar> {
  const sql = opciones?.sql ?? obtenerSql();
  const alcance = await alcanceProcesos(sesion, { sql });
  const propio = () => (alcance.todos ? sql`true` : sql`p.id = ANY(${alcance.procesoIds})`);
  const [procesos, subprocesos, tipos, documentos] = await Promise.all([
    sql`SELECT p.id, p.nombre, p.sigla FROM procesos p WHERE p.activo AND ${propio()} ORDER BY p.nombre`,
    sql`SELECT s.id, s.proceso_id, s.nombre FROM subprocesos s WHERE s.activo ORDER BY s.orden`,
    sql`SELECT id, nombre, sigla FROM tipos_documento WHERE activo ORDER BY orden`,
    sql`SELECT d.id, d.codigo, d.titulo, p.nombre AS proceso,
        EXISTS (SELECT 1 FROM tramites t WHERE t.documento_id = d.id AND t.etapa = ANY(${ETAPAS_ABIERTAS})) AS con_tramite
      FROM documentos d
      JOIN documento_versiones v ON v.documento_id = d.id AND v.estado = 'vigente'
      JOIN documento_proceso dp ON dp.documento_id = d.id AND dp.es_principal
      LEFT JOIN subprocesos s ON s.id = dp.subproceso_id
      JOIN procesos p ON p.id = COALESCE(dp.proceso_id, s.proceso_id)
      WHERE ${propio()}
      ORDER BY d.codigo`,
  ]);
  return {
    procesos: procesos.map((p) => ({
      id: Number(p.id),
      nombre: p.nombre,
      sigla: p.sigla,
      subprocesos: subprocesos
        .filter((s) => Number(s.proceso_id) === Number(p.id))
        .map((s) => ({ id: Number(s.id), nombre: s.nombre })),
    })),
    tipos: tipos.map((t) => ({ id: Number(t.id), nombre: t.nombre, sigla: t.sigla })),
    documentos: documentos.map((d) => ({
      id: Number(d.id),
      codigo: d.codigo,
      titulo: d.titulo,
      proceso: d.proceso,
      conTramite: d.con_tramite,
    })),
  };
}
