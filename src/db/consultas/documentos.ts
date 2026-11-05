import { obtenerSql } from "@/db/cliente";
import { filtroAcceso, type SujetoVisibilidad } from "@/lib/alcance";

export type ArchivoFicha = {
  id: number;
  rol: "principal" | "editable" | "anexo";
  nombreOriginal: string;
  extension: string;
  mime: string;
  tamanoBytes: number;
};

export type UbicacionDocumento = {
  esPrincipal: boolean;
  nombre: string;
  url: string;
  // Nombre del proceso padre cuando la ubicación es un subproceso.
  proceso: string | null;
  // Banda y color del macroproceso, para tematizar la ficha y el mini-mapa.
  macroNombre: string;
  banda: string;
  color: string;
};

export type DocumentoRelacionado = {
  codigo: string;
  titulo: string;
  tipo: string;
  esDiligenciable: boolean;
};

export type FichaDocumento = {
  id: number;
  codigo: string;
  titulo: string;
  descripcion: string | null;
  nivelAcceso: "general" | "restringido";
  tipo: { nombre: string; sigla: string; esDiligenciable: boolean };
  version: {
    id: number;
    numero: number;
    estado: string;
    fechaElaboracion: string | null;
    fechaRevision: string | null;
    fechaAprobacion: string | null;
    elaboro: string | null;
    reviso: string | null;
    aprobo: string | null;
    resumenCambios: string | null;
  };
  archivos: ArchivoFicha[];
  ubicaciones: UbicacionDocumento[];
  relacionados: DocumentoRelacionado[];
};

/**
 * Ficha pública del documento: SOLO si tiene versión vigente (regla 3) y el
 * sujeto pasa la regla de acceso. Un documento en borrador, obsoleto, anulado
 * o restringido para quien pregunta devuelve null y la ruta pública responde 404.
 */
export async function obtenerFichaDocumento(
  codigo: string,
  sujeto: SujetoVisibilidad,
): Promise<FichaDocumento | null> {
  const sql = obtenerSql();

  const [doc] = await sql`
    SELECT d.id, d.codigo, d.titulo, d.descripcion, d.nivel_acceso,
           t.nombre AS tipo_nombre, t.sigla AS tipo_sigla, t.es_diligenciable,
           v.id AS version_id, v.numero, v.estado,
           v.fecha_elaboracion::text AS fecha_elaboracion,
           v.fecha_revision::text AS fecha_revision,
           v.fecha_aprobacion::text AS fecha_aprobacion,
           v.elaboro, v.reviso, v.aprobo, v.resumen_cambios
    FROM documentos d
    JOIN tipos_documento t ON t.id = d.tipo_id
    JOIN documento_versiones v ON v.documento_id = d.id AND v.estado = 'vigente'
    WHERE lower(d.codigo) = lower(${codigo}) AND ${filtroAcceso(sql, sujeto)}`;
  if (!doc) return null;

  const [archivos, ubicaciones, relacionados] = await Promise.all([
    sql`
      SELECT id, rol, nombre_original, extension, mime, tamano_bytes
      FROM archivos
      WHERE version_id = ${doc.version_id}
      ORDER BY CASE rol WHEN 'principal' THEN 0 WHEN 'editable' THEN 1 ELSE 2 END, id`,
    sql`
      SELECT dp.es_principal,
             COALESCE(s.nombre, p.nombre) AS nombre,
             CASE
               WHEN s.id IS NOT NULL
                 THEN '/procesos/' || ps.slug || '/' || s.slug
               ELSE '/procesos/' || p.slug
             END AS url,
             CASE WHEN s.id IS NOT NULL THEN ps.nombre END AS proceso,
             m.nombre AS macro_nombre, m.banda, m.color
      FROM documento_proceso dp
      LEFT JOIN procesos p ON p.id = dp.proceso_id AND p.activo
      LEFT JOIN subprocesos s ON s.id = dp.subproceso_id AND s.activo
      LEFT JOIN procesos ps ON ps.id = s.proceso_id AND ps.activo
      JOIN macroprocesos m ON m.id = COALESCE(p.macroproceso_id, ps.macroproceso_id)
      WHERE dp.documento_id = ${doc.id}
        AND (p.id IS NOT NULL OR (s.id IS NOT NULL AND ps.id IS NOT NULL))
      ORDER BY dp.es_principal DESC, nombre`,
    sql`
      SELECT d.codigo, d.titulo, t2.nombre AS tipo, t2.es_diligenciable
      FROM documento_relaciones r
      JOIN documentos d
        ON d.id = CASE WHEN r.documento_id = ${doc.id}
                       THEN r.relacionado_id ELSE r.documento_id END
      JOIN tipos_documento t2 ON t2.id = d.tipo_id
      WHERE (r.documento_id = ${doc.id} OR r.relacionado_id = ${doc.id})
        AND EXISTS (
          SELECT 1 FROM documento_versiones vv
          WHERE vv.documento_id = d.id AND vv.estado = 'vigente'
        )
        AND ${filtroAcceso(sql, sujeto)}
      ORDER BY d.codigo`,
  ]);

  return {
    id: doc.id as number,
    codigo: doc.codigo as string,
    titulo: doc.titulo as string,
    descripcion: doc.descripcion as string | null,
    nivelAcceso: doc.nivel_acceso as FichaDocumento["nivelAcceso"],
    tipo: {
      nombre: doc.tipo_nombre as string,
      sigla: doc.tipo_sigla as string,
      esDiligenciable: doc.es_diligenciable as boolean,
    },
    version: {
      id: doc.version_id as number,
      numero: doc.numero as number,
      estado: doc.estado as string,
      fechaElaboracion: doc.fecha_elaboracion as string | null,
      fechaRevision: doc.fecha_revision as string | null,
      fechaAprobacion: doc.fecha_aprobacion as string | null,
      elaboro: doc.elaboro as string | null,
      reviso: doc.reviso as string | null,
      aprobo: doc.aprobo as string | null,
      resumenCambios: doc.resumen_cambios as string | null,
    },
    archivos: archivos.map((a) => ({
      id: a.id as number,
      rol: a.rol as ArchivoFicha["rol"],
      nombreOriginal: a.nombre_original as string,
      extension: a.extension as string,
      mime: a.mime as string,
      tamanoBytes: Number(a.tamano_bytes),
    })),
    ubicaciones: ubicaciones.map((u) => ({
      esPrincipal: u.es_principal as boolean,
      nombre: u.nombre as string,
      url: u.url as string,
      proceso: (u.proceso as string | null) ?? null,
      macroNombre: u.macro_nombre as string,
      banda: u.banda as string,
      color: u.color as string,
    })),
    relacionados: relacionados.map((r) => ({
      codigo: r.codigo as string,
      titulo: r.titulo as string,
      tipo: r.tipo as string,
      esDiligenciable: r.es_diligenciable as boolean,
    })),
  };
}

export type ArchivoVigente = {
  id: number;
  ruta: string;
  nombreOriginal: string;
  mime: string;
  tamanoBytes: number;
  documentoId: number;
  versionId: number;
};

/**
 * Archivo de la VERSIÓN VIGENTE del documento identificado por su código.
 * Regla de negocio 3: si la versión del archivo no está vigente (borrador,
 * obsoleto, anulado), el código no corresponde o el sujeto no pasa la regla de
 * acceso, devuelve null — el endpoint público responde 404 sin distinguir el
 * motivo.
 */
export async function obtenerArchivoVigente(
  codigo: string,
  archivoId: number,
  sujeto: SujetoVisibilidad,
): Promise<ArchivoVigente | null> {
  const sql = obtenerSql();
  const [fila] = await sql`
    SELECT a.id, a.ruta, a.nombre_original, a.mime, a.tamano_bytes,
           d.id AS documento_id, v.id AS version_id
    FROM archivos a
    JOIN documento_versiones v ON v.id = a.version_id AND v.estado = 'vigente'
    JOIN documentos d ON d.id = v.documento_id
    WHERE a.id = ${archivoId} AND lower(d.codigo) = lower(${codigo})
      AND ${filtroAcceso(sql, sujeto)}`;

  if (!fila) return null;
  return {
    id: fila.id as number,
    ruta: fila.ruta as string,
    nombreOriginal: fila.nombre_original as string,
    mime: fila.mime as string,
    tamanoBytes: Number(fila.tamano_bytes),
    documentoId: fila.documento_id as number,
    versionId: fila.version_id as number,
  };
}
