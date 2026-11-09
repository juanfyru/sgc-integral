import { obtenerSql, type Cliente } from "@/db/cliente";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { columnasDeVigencia, vigenciaEnLista, vigenciaPorDocumento, type VigenciaEnLista } from "@/db/consultas/vigencia/fragmentos";
import { filtroAcceso, type SujetoVisibilidad } from "@/lib/alcance";
import { ROLES_ARCHIVO_LISTA } from "@/lib/subida";

type Opciones = { sql?: Cliente; ahora?: Date };

export type NodoHermano = { nombre: string; slug: string };

export type SubprocesoResumen = {
  id: number;
  nombre: string;
  slug: string;
  // D10: documentos vigentes que aplican al subproceso y que el usuario puede ver.
  docsVigentes: number;
};

export type DetalleProceso = {
  id: number;
  nombre: string;
  sigla: string;
  slug: string;
  icono: string;
  descripcion: string | null;
  macro: {
    nombre: string;
    letra: string;
    slug: string;
    color: string;
    banda: string;
  };
  subprocesos: SubprocesoResumen[];
  anterior: NodoHermano | null;
  siguiente: NodoHermano | null;
};

export type ArchivoResumen = {
  id: number;
  rol: "principal" | "editable" | "anexo";
  mime: string;
  tamanoBytes: number;
};

export type DocumentoListado = {
  id: number;
  codigo: string;
  titulo: string;
  descripcion: string | null;
  tipo: { nombre: string; sigla: string; esDiligenciable: boolean; orden: number };
  version: number;
  // true si la asociación principal del documento vive en este nodo:
  // define la sección "propios" frente a "también aplica aquí".
  esPrincipal: boolean;
  // Nombre del proceso dueño (asociación principal), para mostrar la
  // procedencia de los documentos que "también aplican aquí".
  propietario: string | null;
  subproceso: { nombre: string; slug: string } | null;
  archivos: ArchivoResumen[];
  /** El semáforo de la versión vigente (spec 13C §7.2). */
  vigencia: VigenciaEnLista | null;
};

export async function obtenerDetalleProceso(
  slug: string,
  sujeto: SujetoVisibilidad,
): Promise<DetalleProceso | null> {
  const sql = obtenerSql();

  const [proceso] = await sql`
    SELECT p.id, p.nombre, p.sigla, p.slug, p.icono, p.descripcion,
           p.macroproceso_id, p.orden,
           m.nombre AS macro_nombre, m.letra, m.slug AS macro_slug,
           m.color, m.banda
    FROM procesos p
    JOIN macroprocesos m ON m.id = p.macroproceso_id
    WHERE p.slug = ${slug} AND p.activo AND m.activo`;
  if (!proceso) return null;

  const [subprocesos, hermanos] = await Promise.all([
    sql`
      SELECT s.id, s.nombre, s.slug,
        (
          SELECT count(DISTINCT dp.documento_id)::int
          FROM documento_proceso dp
          JOIN documentos d ON d.id = dp.documento_id
          WHERE dp.subproceso_id = s.id
            AND EXISTS (
              SELECT 1 FROM documento_versiones v
              WHERE v.documento_id = dp.documento_id AND v.estado = 'vigente'
            )
            AND ${filtroAcceso(sql, sujeto)}
        ) AS docs_vigentes
      FROM subprocesos s
      WHERE s.proceso_id = ${proceso.id} AND s.activo
      ORDER BY s.orden`,
    sql`
      SELECT nombre, slug FROM procesos
      WHERE macroproceso_id = ${proceso.macroproceso_id} AND activo
      ORDER BY orden`,
  ]);

  const indice = hermanos.findIndex((h) => h.slug === proceso.slug);

  return {
    id: proceso.id as number,
    nombre: proceso.nombre as string,
    sigla: proceso.sigla as string,
    slug: proceso.slug as string,
    icono: proceso.icono as string,
    descripcion: proceso.descripcion as string | null,
    macro: {
      nombre: proceso.macro_nombre as string,
      letra: proceso.letra as string,
      slug: proceso.macro_slug as string,
      color: proceso.color as string,
      banda: proceso.banda as string,
    },
    subprocesos: subprocesos.map((s) => ({
      id: s.id as number,
      nombre: s.nombre as string,
      slug: s.slug as string,
      docsVigentes: s.docs_vigentes as number,
    })),
    anterior: aHermano(hermanos[indice - 1]),
    siguiente: aHermano(hermanos[indice + 1]),
  };
}

export type DetalleSubproceso = {
  id: number;
  nombre: string;
  slug: string;
  proceso: {
    id: number;
    nombre: string;
    sigla: string;
    slug: string;
    icono: string;
  };
  macro: { nombre: string; letra: string; color: string; banda: string };
  anterior: NodoHermano | null;
  siguiente: NodoHermano | null;
};

export async function obtenerDetalleSubproceso(
  slugProceso: string,
  slugSubproceso: string,
): Promise<DetalleSubproceso | null> {
  const sql = obtenerSql();

  const [sub] = await sql`
    SELECT s.id, s.nombre, s.slug,
           p.id AS proceso_id, p.nombre AS proceso_nombre, p.sigla,
           p.slug AS proceso_slug, p.icono,
           m.nombre AS macro_nombre, m.letra, m.color, m.banda
    FROM subprocesos s
    JOIN procesos p ON p.id = s.proceso_id
    JOIN macroprocesos m ON m.id = p.macroproceso_id
    WHERE s.slug = ${slugSubproceso} AND p.slug = ${slugProceso}
      AND s.activo AND p.activo AND m.activo`;
  if (!sub) return null;

  const hermanos = await sql`
    SELECT nombre, slug FROM subprocesos
    WHERE proceso_id = ${sub.proceso_id} AND activo
    ORDER BY orden`;
  const indice = hermanos.findIndex((h) => h.slug === sub.slug);

  return {
    id: sub.id as number,
    nombre: sub.nombre as string,
    slug: sub.slug as string,
    proceso: {
      id: sub.proceso_id as number,
      nombre: sub.proceso_nombre as string,
      sigla: sub.sigla as string,
      slug: sub.proceso_slug as string,
      icono: sub.icono as string,
    },
    macro: {
      nombre: sub.macro_nombre as string,
      letra: sub.letra as string,
      color: sub.color as string,
      banda: sub.banda as string,
    },
    anterior: aHermano(hermanos[indice - 1]),
    siguiente: aHermano(hermanos[indice + 1]),
  };
}

/**
 * Documentos VIGENTES asociados al proceso (regla 3: nada de borradores,
 * obsoletos ni anulados en rutas públicas). Con `incluirSubprocesos` se suman
 * los asociados a sus subprocesos activos (la pregunta D10 del funcionario:
 * "¿qué hay aquí para mí?"). Solo los que el sujeto puede ver.
 */
export async function obtenerDocumentosDeProceso(
  procesoId: number,
  incluirSubprocesos: boolean,
  sujeto: SujetoVisibilidad,
  opciones?: Opciones,
): Promise<DocumentoListado[]> {
  const sql = opciones?.sql ?? obtenerSql();
  const filas = await sql`
    SELECT d.id, d.codigo, d.titulo, d.descripcion,
           t.nombre AS tipo_nombre, t.sigla AS tipo_sigla,
           t.es_diligenciable, t.orden AS tipo_orden,
           v.numero AS version, dp.es_principal,
           (
             SELECT COALESCE(pp.nombre, pps.nombre)
             FROM documento_proceso dpp
             LEFT JOIN procesos pp ON pp.id = dpp.proceso_id
             LEFT JOIN subprocesos sp ON sp.id = dpp.subproceso_id
             LEFT JOIN procesos pps ON pps.id = sp.proceso_id
             WHERE dpp.documento_id = d.id AND dpp.es_principal
           ) AS propietario,
           s.nombre AS sub_nombre, s.slug AS sub_slug,
           (
             SELECT json_agg(
               json_build_object('id', a.id, 'rol', a.rol, 'mime', a.mime,
                                 'tamanoBytes', a.tamano_bytes)
               ORDER BY CASE a.rol WHEN 'principal' THEN 0 WHEN 'editable' THEN 1 ELSE 2 END
             )
             FROM archivos a WHERE a.version_id = v.id AND a.rol = ANY(${ROLES_ARCHIVO_LISTA})
           ) AS archivos
    FROM documento_proceso dp
    JOIN documentos d ON d.id = dp.documento_id
    JOIN documento_versiones v ON v.documento_id = d.id AND v.estado = 'vigente'
    JOIN tipos_documento t ON t.id = d.tipo_id
    LEFT JOIN subprocesos s ON s.id = dp.subproceso_id
    WHERE (dp.proceso_id = ${procesoId}
       OR (${incluirSubprocesos} AND dp.subproceso_id IN (
             SELECT id FROM subprocesos
             WHERE proceso_id = ${procesoId} AND activo
           )))
      AND ${filtroAcceso(sql, sujeto)}
    ORDER BY t.orden, d.codigo`;

  return conVigencia(sql, deduplicar(filas.map(aDocumentoListado)), opciones?.ahora);
}

export async function obtenerDocumentosDeSubproceso(
  subprocesoId: number,
  sujeto: SujetoVisibilidad,
  opciones?: Opciones,
): Promise<DocumentoListado[]> {
  const sql = opciones?.sql ?? obtenerSql();
  const filas = await sql`
    SELECT d.id, d.codigo, d.titulo, d.descripcion,
           t.nombre AS tipo_nombre, t.sigla AS tipo_sigla,
           t.es_diligenciable, t.orden AS tipo_orden,
           v.numero AS version, dp.es_principal,
           (
             SELECT COALESCE(pp.nombre, pps.nombre)
             FROM documento_proceso dpp
             LEFT JOIN procesos pp ON pp.id = dpp.proceso_id
             LEFT JOIN subprocesos sp ON sp.id = dpp.subproceso_id
             LEFT JOIN procesos pps ON pps.id = sp.proceso_id
             WHERE dpp.documento_id = d.id AND dpp.es_principal
           ) AS propietario,
           NULL AS sub_nombre, NULL AS sub_slug,
           (
             SELECT json_agg(
               json_build_object('id', a.id, 'rol', a.rol, 'mime', a.mime,
                                 'tamanoBytes', a.tamano_bytes)
               ORDER BY CASE a.rol WHEN 'principal' THEN 0 WHEN 'editable' THEN 1 ELSE 2 END
             )
             FROM archivos a WHERE a.version_id = v.id AND a.rol = ANY(${ROLES_ARCHIVO_LISTA})
           ) AS archivos
    FROM documento_proceso dp
    JOIN documentos d ON d.id = dp.documento_id
    JOIN documento_versiones v ON v.documento_id = d.id AND v.estado = 'vigente'
    JOIN tipos_documento t ON t.id = d.tipo_id
    WHERE dp.subproceso_id = ${subprocesoId} AND ${filtroAcceso(sql, sujeto)}
    ORDER BY t.orden, d.codigo`;

  return conVigencia(sql, deduplicar(filas.map(aDocumentoListado)), opciones?.ahora);
}

type FilaDocumento = Record<string, unknown>;

function aDocumentoListado(fila: FilaDocumento): DocumentoListado {
  return {
    id: fila.id as number,
    codigo: fila.codigo as string,
    titulo: fila.titulo as string,
    descripcion: fila.descripcion as string | null,
    tipo: {
      nombre: fila.tipo_nombre as string,
      sigla: fila.tipo_sigla as string,
      esDiligenciable: fila.es_diligenciable as boolean,
      orden: fila.tipo_orden as number,
    },
    version: fila.version as number,
    esPrincipal: fila.es_principal as boolean,
    propietario: (fila.propietario as string | null) ?? null,
    subproceso: fila.sub_nombre
      ? { nombre: fila.sub_nombre as string, slug: fila.sub_slug as string }
      : null,
    archivos: (fila.archivos ?? []) as ArchivoResumen[],
    vigencia: null,
  };
}

/** La vigencia de cada documento de la lista, que ya trae solo lo que el sujeto ve. */
async function conVigencia(sql: Cliente, docs: DocumentoListado[], ahora = new Date()): Promise<DocumentoListado[]> {
  const vigencias = await vigenciaPorDocumento(sql, docs.map((d) => Number(d.id)), ahora);
  return docs.map((d) => {
    const v = vigencias.get(Number(d.id));
    return { ...d, vigencia: v ? vigenciaEnLista(v) : null };
  });
}

/**
 * Cuántos documentos del proceso (los de su asociación principal, también por un subproceso) tienen la revisión
 * vencida y cuántos están en atención, contando solo los que la persona puede ver. Para el encabezado de la página.
 */
export async function resumenVigenciaDeProceso(
  procesoId: number,
  sesion: SesionFlujo,
  opciones?: Opciones,
): Promise<{ vencidas: number; atencion: number }> {
  const sql = opciones?.sql ?? obtenerSql();
  const filas = await columnasDeVigencia(sql, sql`p.id = ${procesoId} AND ${filtroAcceso(sql, sesion)}`, opciones?.ahora ?? new Date());
  return {
    vencidas: filas.filter((f) => f.vigencia.estado === "vencida").length,
    atencion: filas.filter((f) => f.vigencia.estado === "atencion").length,
  };
}

// Un documento asociado al proceso Y a uno de sus subprocesos aparecería dos
// veces: se conserva una sola entrada, prefiriendo la asociación principal.
function deduplicar(docs: DocumentoListado[]): DocumentoListado[] {
  const porCodigo = new Map<string, DocumentoListado>();
  for (const doc of docs) {
    const existente = porCodigo.get(doc.codigo);
    if (!existente || (doc.esPrincipal && !existente.esPrincipal)) {
      porCodigo.set(doc.codigo, doc);
    }
  }
  return [...porCodigo.values()];
}

function aHermano(fila?: Record<string, unknown>): NodoHermano | null {
  if (!fila) return null;
  return { nombre: fila.nombre as string, slug: fila.slug as string };
}

export type ProcesoBreve = { id: number; nombre: string; sigla: string; slug: string };

/**
 * Los procesos activos de macroprocesos activos, por nombre: el filtro del normograma, su Excel y las asociaciones.
 * El mapa es público para toda sesión, así que la lista también.
 */
export async function procesosActivos(opciones?: { sql?: Cliente }): Promise<ProcesoBreve[]> {
  const sql = opciones?.sql ?? obtenerSql();
  const filas = await sql`SELECT p.id, p.nombre, p.sigla, p.slug FROM procesos p
    JOIN macroprocesos m ON m.id = p.macroproceso_id
    WHERE p.activo AND m.activo
    ORDER BY p.nombre`;
  return filas.map((f) => ({ id: Number(f.id), nombre: f.nombre as string, sigla: f.sigla as string, slug: f.slug as string }));
}
