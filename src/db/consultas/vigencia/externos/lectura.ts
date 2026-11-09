/** La lectura de los externos: su página de control, la matriz y los archivos de la edición (spec 13C §8.6 y §8.8). */
import { obtenerSql, type Cliente } from "@/db/cliente";
import type { ArchivoFicha } from "@/db/consultas/documentos";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { alcanceProcesos, filtroAcceso, puedeGestionarExterno, puedeVerExterno } from "@/lib/alcance";
import { puede } from "@/lib/permisos";
import { ROLES_ARCHIVO_LISTA } from "@/lib/subida";
import type { ResultadoVerificacion } from "@/lib/vigencia/tipos";
import {
  leerSituacion,
  normaEnlazada,
  type DestinoDeEdicion,
  type Externo,
  type FilaExterno,
  type FiltroExternos,
  type Opciones,
} from "./comun";
import { vigenciaPorDocumento } from "../fragmentos";

const SIN_VIGENCIA: Externo["vigencia"] = { estado: "atencion", dias: null, proxima: null };
const ESTADOS_COPIA_VIVA = ["emitida", "recibida", "por_recoger"];

/** La página de control de un externo (spec 13C §8.8), para quien `puedeVerExterno`; null para los demás. */
export async function obtenerExterno(documentoId: number, sesion: SesionFlujo, opciones?: Opciones): Promise<Externo | null> {
  const sql = opciones?.sql ?? obtenerSql();
  const ahora = opciones?.ahora ?? new Date();
  if (!(await puedeVerExterno(documentoId, sesion, { sql }))) return null;

  const [f] = await sql`
    SELECT d.id, d.codigo, d.titulo, d.nivel_acceso, p.id AS proceso_id, p.nombre AS proceso_nombre, p.sigla AS proceso_sigla,
      ex.entidad_emisora, ex.titulo_original, ex.fuente_oficial, ex.responsable_id, ru.nombre AS responsable,
      ex.verificacion_meses, ex.edicion_nueva_pendiente_desde
    FROM documentos d
    JOIN externos ex ON ex.documento_id = d.id
    JOIN usuarios ru ON ru.id = ex.responsable_id
    JOIN documento_proceso dp ON dp.documento_id = d.id AND dp.es_principal
    LEFT JOIN subprocesos s ON s.id = dp.subproceso_id
    JOIN procesos p ON p.id = COALESCE(dp.proceso_id, s.proceso_id)
    WHERE d.id = ${documentoId}`;
  const versiones = await sql`
    SELECT v.id, v.numero, v.estado, v.edicion_externa, v.fecha_edicion_externa::text AS fecha_edicion, v.resumen_cambios,
      v.publicado_en, v.aprobo,
      (SELECT fi.nombre_firmante FROM firmas fi WHERE fi.version_id = v.id AND fi.firma = 'adopto' ORDER BY fi.id DESC LIMIT 1) AS adopto
    FROM documento_versiones v
    WHERE v.documento_id = ${documentoId} AND v.estado <> 'descartado'
    ORDER BY v.numero DESC`;
  const verificaciones = await sql`
    SELECT ev.id, ev.resultado, ev.fuente_consultada, ev.nota, u.nombre, ev.creado_en, v.numero
    FROM externo_verificaciones ev
    JOIN usuarios u ON u.id = ev.usuario_id
    JOIN documento_versiones v ON v.id = ev.version_id
    WHERE ev.documento_id = ${documentoId}
    ORDER BY ev.creado_en DESC, ev.id DESC`;
  const norma = await normaEnlazada(sql, documentoId);

  const procesoId = Number(f.proceso_id);
  const responsableId = Number(f.responsable_id);
  const gestiona = puedeGestionarExterno(sesion, procesoId, await alcanceProcesos(sesion, { sql }));
  const vigente = versiones.find((v) => v.estado === "vigente");
  const borrador = versiones.find((v) => v.estado === "borrador");
  const activo = !versiones.some((v) => v.estado === "anulado");
  const archivos = gestiona && borrador
    ? await sql`SELECT id, rol, nombre_original, extension, mime, tamano_bytes FROM archivos
        WHERE version_id = ${borrador.id} AND rol = ANY(${ROLES_ARCHIVO_LISTA}) ORDER BY id`
    : [];
  const fila = vigente ? (await vigenciaPorDocumento(sql, [documentoId], ahora)).get(documentoId) : undefined;
  const instante = (v: unknown): Date | null => (v === null || v === undefined ? null : new Date(v as string));

  return {
    documentoId,
    codigo: f.codigo as string,
    titulo: f.titulo as string,
    nivelAcceso: f.nivel_acceso as Externo["nivelAcceso"],
    proceso: { id: procesoId, nombre: f.proceso_nombre as string, sigla: f.proceso_sigla as string },
    control: {
      entidadEmisora: f.entidad_emisora as string,
      tituloOriginal: (f.titulo_original as string | null) ?? null,
      fuenteOficial: (f.fuente_oficial as string | null) ?? null,
      responsable: { id: responsableId, nombre: f.responsable as string },
      verificacionMeses: Number(f.verificacion_meses),
      norma,
      edicionNuevaPendienteDesde: instante(f.edicion_nueva_pendiente_desde),
    },
    vigente: vigente
      ? {
          versionId: Number(vigente.id),
          numero: vigente.numero as number,
          edicion: (vigente.edicion_externa as string | null) ?? "",
          fechaEdicion: (vigente.fecha_edicion as string | null) ?? null,
          adoptadaEn: new Date(vigente.publicado_en as string),
          adoptoPor: ((vigente.adopto ?? vigente.aprobo) as string | null) ?? "",
        }
      : null,
    borrador: gestiona && borrador
      ? {
          versionId: Number(borrador.id),
          numero: borrador.numero as number,
          edicion: (borrador.edicion_externa as string | null) ?? "",
          fechaEdicion: (borrador.fecha_edicion as string | null) ?? null,
          resumenCambios: (borrador.resumen_cambios as string | null) ?? null,
          archivos: archivos.map((a) => ({
            id: Number(a.id),
            rol: a.rol as ArchivoFicha["rol"],
            nombreOriginal: a.nombre_original as string,
            extension: a.extension as string,
            mime: a.mime as string,
            tamanoBytes: Number(a.tamano_bytes),
          })),
        }
      : null,
    ediciones: versiones
      .filter((v) => v.estado !== "borrador")
      .map((v) => ({
        numero: v.numero as number,
        edicion: (v.edicion_externa as string | null) ?? "",
        estado: v.estado as string,
        adoptadaEn: instante(v.publicado_en),
      })),
    verificaciones: verificaciones.map((v) => ({
      id: Number(v.id),
      resultado: v.resultado as ResultadoVerificacion,
      fuente: v.fuente_consultada as string,
      nota: (v.nota as string | null) ?? null,
      nombre: v.nombre as string,
      creadoEn: new Date(v.creado_en as string),
      version: v.numero as number,
    })),
    vigencia: fila ? { ...fila.vigencia, proxima: fila.proximaRevision } : SIN_VIGENCIA,
    acciones: {
      editar: gestiona && activo,
      abrirEdicion: gestiona && activo && !borrador,
      adoptar: gestiona && activo && borrador !== undefined,
      verificar: activo && vigente !== undefined && puede(sesion, "externos.verificar") && (gestiona || responsableId === sesion.usuarioId),
      retirar: gestiona && activo && vigente !== undefined,
    },
  };
}

function escaparLike(texto: string): string {
  return texto.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * La matriz de externos (spec 13C §8.6): los que no se han retirado, para quien tiene `vigencia.ver` sobre su proceso
 * propietario (el líder, sus procesos) y, para su responsable técnico, los suyos; siempre por nivel de acceso. Un
 * externo aún sin adoptar sale en atención, sin fecha. El estado se filtra sobre el calculado.
 */
export async function listarExternos(sesion: SesionFlujo, filtro: FiltroExternos, opciones?: Opciones): Promise<FilaExterno[]> {
  const sql = opciones?.sql ?? obtenerSql();
  const ahora = opciones?.ahora ?? new Date();
  const alcance = await alcanceProcesos(sesion, { sql });
  const porProceso = !puede(sesion, "vigencia.ver")
    ? sql`false`
    : alcance.todos
      ? sql`true`
      : sql`p.id = ANY(${alcance.procesoIds})`;
  const q = filtro.q?.trim();
  const patron = q ? `%${escaparLike(q)}%` : null;
  const filas = await sql`
    SELECT d.id, d.codigo, d.titulo, p.id AS proceso_id, p.nombre AS proceso_nombre, p.sigla AS proceso_sigla,
      ex.entidad_emisora, ru.nombre AS responsable, v.id AS version_id, v.edicion_externa, v.publicado_en,
      uv.creado_en AS verificado_en, uv.resultado, uv.nombre AS verifico,
      (SELECT count(*)::int FROM copias_controladas cc JOIN documento_versiones cv ON cv.id = cc.version_id
        WHERE cv.documento_id = d.id AND cc.estado IN ${sql(ESTADOS_COPIA_VIVA)}) AS copias_vivas
    FROM documentos d
    JOIN externos ex ON ex.documento_id = d.id
    JOIN usuarios ru ON ru.id = ex.responsable_id
    JOIN documento_proceso dp ON dp.documento_id = d.id AND dp.es_principal
    LEFT JOIN subprocesos s ON s.id = dp.subproceso_id
    JOIN procesos p ON p.id = COALESCE(dp.proceso_id, s.proceso_id)
    LEFT JOIN documento_versiones v ON v.documento_id = d.id AND v.estado = 'vigente'
    LEFT JOIN LATERAL (
      SELECT ev.creado_en, ev.resultado, u.nombre
      FROM externo_verificaciones ev JOIN usuarios u ON u.id = ev.usuario_id
      WHERE ev.version_id = v.id
      ORDER BY ev.creado_en DESC, ev.id DESC LIMIT 1
    ) uv ON true
    WHERE d.origen = 'externo'
      AND NOT EXISTS (SELECT 1 FROM documento_versiones x WHERE x.documento_id = d.id AND x.estado = 'anulado')
      AND ${filtroAcceso(sql, sesion)}
      AND (ex.responsable_id = ${sesion.usuarioId} OR ${porProceso})
      ${filtro.procesoId === undefined ? sql`` : sql`AND p.id = ${filtro.procesoId}`}
      ${filtro.responsableId === undefined ? sql`` : sql`AND ex.responsable_id = ${filtro.responsableId}`}
      ${patron === null
        ? sql``
        : sql`AND (d.codigo ILIKE ${patron} OR unaccent(d.titulo) ILIKE unaccent(${patron})
            OR unaccent(coalesce(ex.titulo_original, '')) ILIKE unaccent(${patron}) OR unaccent(ex.entidad_emisora) ILIKE unaccent(${patron}))`}
    ORDER BY d.codigo`;

  const conVigente = filas.filter((f) => f.version_id !== null).map((f) => Number(f.id));
  const vigencias = await vigenciaPorDocumento(sql, conVigente, ahora);
  const lista: FilaExterno[] = filas.map((f) => {
    const v = vigencias.get(Number(f.id));
    return {
      documentoId: Number(f.id),
      codigo: f.codigo as string,
      titulo: f.titulo as string,
      proceso: { id: Number(f.proceso_id), nombre: f.proceso_nombre as string, sigla: f.proceso_sigla as string },
      vigencia: v ? { ...v.vigencia, proxima: v.proximaRevision } : SIN_VIGENCIA,
      emisor: f.entidad_emisora as string,
      edicion: (f.edicion_externa as string | null) ?? null,
      adoptadaEn: f.publicado_en === null ? null : new Date(f.publicado_en as string),
      ultimaVerificacion:
        f.verificado_en === null
          ? null
          : { fecha: new Date(f.verificado_en as string), resultado: f.resultado as ResultadoVerificacion, nombre: f.verifico as string },
      proximaVerificacion: v?.proximaRevision ?? null,
      responsable: f.responsable as string,
      copiasVivas: Number(f.copias_vivas),
    };
  });
  const estado = filtro.estado ?? "todos";
  return estado === "todos" ? lista : lista.filter((f) => f.vigencia.estado === estado);
}

/** Si la persona responde por la vigencia de algún externo que no se ha retirado (la entrada «Vigencia» de la barra). */
export async function esResponsableTecnico(usuarioId: number, opciones?: { sql?: Cliente }): Promise<boolean> {
  const sql = opciones?.sql ?? obtenerSql();
  const [f] = await sql`SELECT EXISTS (
      SELECT 1 FROM externos ex JOIN documentos d ON d.id = ex.documento_id
      WHERE ex.responsable_id = ${usuarioId} AND d.origen = 'externo'
        AND NOT EXISTS (SELECT 1 FROM documento_versiones x WHERE x.documento_id = d.id AND x.estado = 'anulado')
    ) AS es`;
  return f.es as boolean;
}

// ── Archivos de la edición en borrador ──

/**
 * Quién sube o quita archivos de una edición: quien gestiona el externo, y solo mientras está en borrador (409 si
 * ya no). Para cualquier otro, o si la versión no es de un externo, no existe (404).
 */
export async function autorizarArchivoDeEdicion(
  versionId: number,
  sesion: SesionFlujo,
  opciones?: { sql?: Cliente },
): Promise<{ ok: true; destino: DestinoDeEdicion } | { ok: false; estado: 404 | 409 }> {
  const sql = opciones?.sql ?? obtenerSql();
  const [v] = await sql`SELECT documento_id, numero, estado FROM documento_versiones WHERE id = ${versionId}`;
  if (!v) return { ok: false, estado: 404 };
  const s = await leerSituacion(sql, Number(v.documento_id), sesion);
  if (!s || !puedeGestionarExterno(sesion, s.procesoId, await alcanceProcesos(sesion, { sql }))) return { ok: false, estado: 404 };
  if (v.estado !== "borrador") return { ok: false, estado: 409 };
  return { ok: true, destino: { versionId, codigo: s.codigo, numero: v.numero as number } };
}

/** Un archivo de la lista (principal, editable o anexo) de esa versión; null si es de otra o es un acta. */
export async function archivoDeEdicion(
  versionId: number,
  archivoId: number,
  opciones?: { sql?: Cliente },
): Promise<{ ruta: string; mime: string; nombreOriginal: string } | null> {
  const sql = opciones?.sql ?? obtenerSql();
  const [a] = await sql`SELECT ruta, mime, nombre_original FROM archivos
    WHERE id = ${archivoId} AND version_id = ${versionId} AND rol = ANY(${ROLES_ARCHIVO_LISTA})`;
  return a ? { ruta: a.ruta as string, mime: a.mime as string, nombreOriginal: a.nombre_original as string } : null;
}
