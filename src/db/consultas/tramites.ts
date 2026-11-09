/**
 * Lecturas del trámite: bandeja, detalle y quién ve qué. Las escrituras y las transiciones
 * viven en `tramites-flujo.ts`. La decisión de quién ve un trámite es `puedeVerTramite`; aquí
 * solo se reúnen sus datos, en una consulta, para que la usen la bandeja, la página y
 * `transicionar` sin repetirla.
 */
import type { Row } from "postgres";
import { obtenerSql, type Cliente } from "@/db/cliente";
import { sugerirCodigo, todosLosCodigos } from "@/db/consultas/codigos";
import { obtenerConfigDocumental } from "@/db/consultas/config-documental";
import { nombreSql } from "@/db/consultas/normograma/busqueda";
import { SIGLA_EXTERNO } from "@/db/consultas/origen";
import { buscarParecidos, type Parecido } from "@/db/consultas/parecidos";
import {
  alcanceProcesos,
  enAlcance,
  filtroAcceso,
  puedeVerTramite,
} from "@/lib/alcance";
import { puede } from "@/lib/permisos";
import type { Rol } from "@/lib/roles";
import { accionesDisponibles, type Accion } from "@/lib/tramites/transiciones";
import {
  ETAPAS_ABIERTAS,
  esEtapaDeTrabajo,
  type Autoridad,
  type Etapa,
  type TipoSolicitud,
} from "@/lib/tramites/tipos";
import type { FilaTramite, SesionFlujo } from "./flujo/contrato";

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
  responsables: string[];
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

export function aFilaTramite(f: Row): FilaTramite {
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
    requiereSocializacion: f.requiere_socializacion === true,
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
      t.motivo_cierre, t.requiere_socializacion, t.creado_en,
      d.codigo,
      CASE WHEN t.tipo = 'crear' THEN COALESCE(d.titulo, t.titulo_propuesto, '')
           ELSE COALESCE(t.titulo_propuesto, d.titulo, '') END AS titulo,
      v.numero AS version_numero,
      p.nombre AS proceso_nombre,
      us.nombre AS solicitante,
      ue.nombre || CASE WHEN ue.activo THEN '' ELSE ' (inactivo)' END AS elaborador,
      ur.nombre || CASE WHEN ur.activo THEN '' ELSE ' (inactivo)' END AS revisor,
      ua.nombre || CASE WHEN ua.activo THEN '' ELSE ' (inactivo)' END AS aprobador,
      ARRAY(
        SELECT u.nombre || CASE WHEN u.activo THEN '' ELSE ' (inactivo)' END FROM usuarios u
        WHERE (t.etapa = 'elaboracion' AND u.id = t.elaborador_id)
           OR (t.etapa = 'revision' AND u.id = t.revisor_id)
           OR (t.etapa = 'aprobacion' AND u.id = t.aprobador_id)
           OR (t.etapa IN ('aceptacion', 'publicacion') AND u.rol = 'admin_sgc' AND u.activo)
           OR (t.etapa = 'visto_bueno' AND p.activo AND u.rol = 'lider_proceso' AND u.activo AND EXISTS (
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

/**
 * De dónde nació la solicitud (spec 13C §14.4): «Abierto desde la revisión anual 2026» o «Abierto por el cambio de
 * Resolución 2003 de 2014»; nulo si no nació de ninguno. Quien llama ya decidió que la persona ve el trámite.
 */
export async function origenDeTramite(tramiteId: number, opciones?: { sql?: Cliente }): Promise<string | null> {
  const sql = opciones?.sql ?? obtenerSql();
  const [f] = await sql`SELECT ra.anio, CASE WHEN n.id IS NULL THEN NULL ELSE ${nombreSql(sql)} END AS norma
    FROM tramites t
    LEFT JOIN revisiones_anuales ra ON ra.id = t.revision_anual_id
    LEFT JOIN impactos_normativos i ON i.id = t.impacto_id
    LEFT JOIN normas n ON n.id = i.norma_id
    LEFT JOIN tipos_norma tn ON tn.id = n.tipo_norma_id
    WHERE t.id = ${tramiteId}`;
  if (!f) return null;
  if (f.anio !== null) return `Abierto desde la revisión anual ${Number(f.anio)}`;
  return f.norma ? `Abierto por el cambio de ${f.norma as string}` : null;
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
    responsables: esEtapaDeTrabajo(visto.tramite.etapa) ? visto.responsables : [],
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

/** Los líderes de todos los procesos del documento; una asociación a un subproceso cuenta por su proceso. */
export async function lideresDeProcesosDelDocumento(
  documentoId: number,
  opciones?: { sql?: Cliente },
): Promise<number[]> {
  const sql = opciones?.sql ?? obtenerSql();
  const filas = await sql`SELECT DISTINCT u.id
    FROM documento_proceso dp
    LEFT JOIN subprocesos s ON s.id = dp.subproceso_id
    JOIN procesos p ON p.id = COALESCE(dp.proceso_id, s.proceso_id) AND p.activo
    JOIN usuario_procesos up ON up.proceso_id = p.id
    JOIN usuarios u ON u.id = up.usuario_id AND u.activo AND u.rol = 'lider_proceso'
    WHERE dp.documento_id = ${documentoId}
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

/**
 * La misma regla de `crearSolicitud`: el líder pide sobre el proceso propietario, si es suyo. Un externo no tiene
 * trámite (spec 13C §8.1): se adopta o se retira desde Vigencia → Externos.
 */
export async function puedePedirSobreDocumento(
  sesion: SesionFlujo,
  documentoId: number,
  opciones?: { sql?: Cliente },
): Promise<boolean> {
  if (!puede(sesion, "tramites.solicitar")) return false;
  const sql = opciones?.sql ?? obtenerSql();
  const [externo] = await sql`SELECT 1 FROM documentos WHERE id = ${documentoId} AND origen = 'externo'`;
  if (externo) return false;
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

/**
 * Lo que `sesion` puede elegir en una solicitud: el líder, solo sus procesos y sus documentos vigentes. Un externo no
 * tiene trámite ni un interno nace con el tipo «Documento externo» (spec 13C §8.1): no se ofrecen.
 */
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
    sql`SELECT id, nombre, sigla FROM tipos_documento WHERE activo AND sigla <> ${SIGLA_EXTERNO} ORDER BY orden`,
    sql`SELECT d.id, d.codigo, d.titulo, p.nombre AS proceso,
        EXISTS (SELECT 1 FROM tramites t WHERE t.documento_id = d.id AND t.etapa = ANY(${ETAPAS_ABIERTAS})) AS con_tramite
      FROM documentos d
      JOIN documento_versiones v ON v.documento_id = d.id AND v.estado = 'vigente'
      JOIN documento_proceso dp ON dp.documento_id = d.id AND dp.es_principal
      LEFT JOIN subprocesos s ON s.id = dp.subproceso_id
      JOIN procesos p ON p.id = COALESCE(dp.proceso_id, s.proceso_id)
      WHERE d.origen = 'interno' AND ${propio()}
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

export type TipoDeDocumento = {
  id: number;
  nombre: string;
  sigla: string;
  activo: boolean;
  autoridad: Autoridad;
  plantilla: { codigo: string; version: number } | null;
};

/** Tipos con su plantilla: la versión vigente del documento al que apuntan, si la tiene. */
async function tiposDeDocumento(sql: Cliente, condicion: ReturnType<typeof filtroAcceso>): Promise<TipoDeDocumento[]> {
  const filas = await sql`SELECT t.id, t.nombre, t.sigla, t.activo, t.autoridad,
      d.codigo AS plantilla_codigo, v.numero AS plantilla_version
    FROM tipos_documento t
    LEFT JOIN documentos d ON d.id = t.plantilla_documento_id
    LEFT JOIN documento_versiones v ON v.documento_id = d.id AND v.estado = 'vigente'
    WHERE ${condicion}
    ORDER BY t.orden`;
  return filas.map((f) => ({
    id: Number(f.id),
    nombre: f.nombre,
    sigla: f.sigla,
    activo: f.activo,
    autoridad: f.autoridad,
    plantilla: f.plantilla_version === null ? null : { codigo: f.plantilla_codigo, version: f.plantilla_version },
  }));
}

export async function tipoDeDocumento(id: number, opciones?: { sql?: Cliente }): Promise<TipoDeDocumento | null> {
  const sql = opciones?.sql ?? obtenerSql();
  const [tipo] = await tiposDeDocumento(sql, sql`t.id = ${id}`);
  return tipo ?? null;
}

export type UsuarioDesignable = { id: number; nombre: string; cargo: string | null; rol: Rol };

async function usuariosDesignables(sql: Cliente): Promise<UsuarioDesignable[]> {
  const filas = await sql`SELECT u.id, u.nombre, c.nombre AS cargo, u.rol
    FROM usuarios u LEFT JOIN cargos c ON c.id = u.cargo_id
    WHERE u.activo ORDER BY u.nombre`;
  return filas.map((u) => ({ id: Number(u.id), nombre: u.nombre, cargo: u.cargo, rol: u.rol }));
}

export type DatosParaAceptar = {
  parecidos: Parecido[];
  codigoSugerido: string | null;
  plantilla: { codigo: string; version: number } | null;
  autoridad: Autoridad;
  usuarios: UsuarioDesignable[];
};

/** Lo que propone el sistema al aceptar. `usuarios` son los activos; el panel filtra con las reglas puras. */
export async function datosParaAceptar(tramiteId: number, opciones?: { sql?: Cliente }): Promise<DatosParaAceptar> {
  const sql = opciones?.sql ?? obtenerSql();
  const [t] = await sql`SELECT t.tipo, t.proceso_id, t.titulo_propuesto,
      COALESCE(t.tipo_documento_id, d.tipo_id) AS tipo_id
    FROM tramites t LEFT JOIN documentos d ON d.id = t.documento_id
    WHERE t.id = ${tramiteId}`;
  if (!t) throw new Error("El trámite no existe");
  const tipoId = Number(t.tipo_id);
  const esCreacion = t.tipo === "crear";
  const [tipo, parecidos, codigoSugerido, usuarios] = await Promise.all([
    tipoDeDocumento(tipoId, { sql }),
    esCreacion ? buscarParecidos(t.titulo_propuesto, { sql }) : [],
    esCreacion ? sugerirCodigo({ procesoId: Number(t.proceso_id), tipoDocumentoId: tipoId }, { sql }) : null,
    usuariosDesignables(sql),
  ]);
  if (!tipo) throw new Error("El tipo de documento no existe");
  return {
    parecidos,
    codigoSugerido,
    plantilla: tipo.plantilla,
    autoridad: tipo.autoridad,
    usuarios,
  };
}

export type DatosParaGestionar = {
  usuarios: UsuarioDesignable[];
  autoridad: Autoridad;
  /** Quien origina el trámite decide qué rol aprueba: el elaborador, o quien pidió si aún no hay. */
  rolOriginador: Rol;
  tipos: Pick<TipoDeDocumento, "id" | "nombre" | "autoridad">[];
  procesos: DatosParaSolicitar["procesos"];
};

/** Lo que eligen «Reasignar» y «Corregir datos». El tipo y el propietario actuales van aunque estén inactivos. */
export async function datosParaGestionar(tramiteId: number, opciones?: { sql?: Cliente }): Promise<DatosParaGestionar> {
  const sql = opciones?.sql ?? obtenerSql();
  const [t] = await sql`SELECT tp.id AS tipo_id, tp.autoridad, o.rol AS rol_originador, t.proceso_id, t.subproceso_id
    FROM tramites t
    LEFT JOIN documentos d ON d.id = t.documento_id
    JOIN tipos_documento tp ON tp.id = COALESCE(d.tipo_id, t.tipo_documento_id)
    JOIN usuarios o ON o.id = COALESCE(t.elaborador_id, t.solicitante_id)
    WHERE t.id = ${tramiteId}`;
  if (!t) throw new Error("El trámite no existe");
  const [usuarios, tipos, procesos, subprocesos] = await Promise.all([
    usuariosDesignables(sql),
    tiposDeDocumento(sql, sql`t.activo OR t.id = ${t.tipo_id}`),
    sql`SELECT id, nombre, sigla FROM procesos WHERE activo OR id = ${t.proceso_id} ORDER BY nombre`,
    sql`SELECT id, proceso_id, nombre FROM subprocesos WHERE activo OR id = ${t.subproceso_id} ORDER BY orden`,
  ]);
  return {
    usuarios,
    autoridad: t.autoridad,
    rolOriginador: t.rol_originador,
    tipos: tipos.map(({ id, nombre, autoridad }) => ({ id, nombre, autoridad })),
    procesos: procesos.map((p) => ({
      id: Number(p.id),
      nombre: p.nombre,
      sigla: p.sigla,
      subprocesos: subprocesos
        .filter((s) => Number(s.proceso_id) === Number(p.id))
        .map((s) => ({ id: Number(s.id), nombre: s.nombre })),
    })),
  };
}

export type DocumentoDeCatalogo = {
  id: number;
  codigo: string;
  titulo: string;
  version: number;
  versionSiguiente: number;
  procesoId: number;
  proceso: string;
  tipoId: number;
  tipo: string;
  autoridad: Autoridad;
  conTramite: boolean;
  conBorrador: boolean;
};

export type CatalogoClasificacion = {
  tipos: TipoDeDocumento[];
  procesos: DatosParaSolicitar["procesos"];
  documentos: DocumentoDeCatalogo[];
  formatoCodigo: string | null;
  codigos: string[];
};

export type ContextoAceptacion = {
  solicitanteRol: Rol;
  /** En una modificación o eliminación: el tipo del documento y la versión que abriría. */
  documento: { tipo: string; versionSiguiente: number } | null;
  /** En una creación: lo que se puede elegir, porque el tipo y el proceso cambian autoridad y código. */
  catalogo: CatalogoClasificacion | null;
};

async function catalogoDeClasificacion(sql: Cliente): Promise<CatalogoClasificacion> {
  const [tipos, procesos, subprocesos, documentos, config, codigos] = await Promise.all([
    tiposDeDocumento(sql, sql`t.activo`),
    sql`SELECT id, nombre, sigla FROM procesos WHERE activo ORDER BY nombre`,
    sql`SELECT id, proceso_id, nombre FROM subprocesos WHERE activo ORDER BY orden`,
    sql`SELECT d.id, d.codigo, d.titulo, v.numero AS version,
        (SELECT max(o.numero) + 1 FROM documento_versiones o
          WHERE o.documento_id = d.id AND o.estado <> 'descartado') AS version_siguiente,
        p.id AS proceso_id, p.nombre AS proceso, t.id AS tipo_id, t.nombre AS tipo, t.autoridad,
        EXISTS (SELECT 1 FROM tramites a WHERE a.documento_id = d.id AND a.etapa = ANY(${ETAPAS_ABIERTAS})) AS con_tramite,
        EXISTS (SELECT 1 FROM documento_versiones b WHERE b.documento_id = d.id AND b.estado = 'borrador') AS con_borrador
      FROM documentos d
      JOIN tipos_documento t ON t.id = d.tipo_id
      JOIN documento_versiones v ON v.documento_id = d.id AND v.estado = 'vigente'
      JOIN documento_proceso dp ON dp.documento_id = d.id AND dp.es_principal
      LEFT JOIN subprocesos s ON s.id = dp.subproceso_id
      JOIN procesos p ON p.id = COALESCE(dp.proceso_id, s.proceso_id)
      ORDER BY d.codigo`,
    obtenerConfigDocumental({ sql }),
    todosLosCodigos({ sql }),
  ]);
  return {
    tipos,
    procesos: procesos.map((p) => ({
      id: Number(p.id),
      nombre: p.nombre,
      sigla: p.sigla,
      subprocesos: subprocesos
        .filter((s) => Number(s.proceso_id) === Number(p.id))
        .map((s) => ({ id: Number(s.id), nombre: s.nombre })),
    })),
    documentos: documentos.map((d) => ({
      id: Number(d.id),
      codigo: d.codigo,
      titulo: d.titulo,
      version: d.version,
      versionSiguiente: d.version_siguiente,
      procesoId: Number(d.proceso_id),
      proceso: d.proceso,
      tipoId: Number(d.tipo_id),
      tipo: d.tipo,
      autoridad: d.autoridad,
      conTramite: d.con_tramite,
      conBorrador: d.con_borrador,
    })),
    formatoCodigo: config.formatoCodigo,
    codigos,
  };
}

/** Lo que la pantalla de aceptación necesita además de `datosParaAceptar` para armar sus selectores. */
export async function contextoDeAceptacion(
  t: Pick<FilaTramite, "tipo" | "documentoId" | "solicitanteId">,
  opciones?: { sql?: Cliente },
): Promise<ContextoAceptacion> {
  const sql = opciones?.sql ?? obtenerSql();
  const [solicitante] = await sql`SELECT rol FROM usuarios WHERE id = ${t.solicitanteId}`;
  const [d] = t.documentoId === null
    ? []
    : await sql`SELECT tp.nombre AS tipo,
          (SELECT max(v.numero) + 1 FROM documento_versiones v
            WHERE v.documento_id = d.id AND v.estado <> 'descartado') AS version_siguiente
        FROM documentos d JOIN tipos_documento tp ON tp.id = d.tipo_id
        WHERE d.id = ${t.documentoId}`;
  return {
    solicitanteRol: solicitante.rol,
    documento: d ? { tipo: d.tipo, versionSiguiente: d.version_siguiente } : null,
    catalogo: t.tipo === "crear" ? await catalogoDeClasificacion(sql) : null,
  };
}
