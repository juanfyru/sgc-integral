import { obtenerSql, type Cliente } from "@/db/cliente";
import { vigenciaPorDocumento } from "@/db/consultas/vigencia/fragmentos";
import { fechaEnZona } from "@/lib/tramites/plazos";
import type { OrigenAprobacion } from "@/lib/tramites/tipos";
import type { EstadoVigencia } from "@/lib/vigencia/tipos";
import { zonaHoraria } from "@/lib/zona-horaria";

export type FilaMaestro = {
  codigo: string;
  titulo: string;
  tipo: string;
  origen: "interno" | "externo";
  version: number | null;
  /** El texto de la edición de un externo. */
  edicion: string | null;
  estado: string;
  fechaElaboracion: string | null;
  fechaRevision: string | null;
  fechaAprobacion: string | null;
  elaboro: string | null;
  reviso: string | null;
  aprobo: string | null;
  origenAprobacion: OrigenAprobacion | null;
  /** Fechas `yyyy-mm-dd` en la zona de la instalación; como la vigencia, nulas en lo que no está vigente. */
  ultimaRevision: string | null;
  proximaRevision: string | null;
  /** La próxima revisión fijada a mano: quién y cuándo (spec 13C §7.4). */
  fijada: { por: string; en: string } | null;
  vigencia: EstadoVigencia | null;
  propietario: string;
};

/**
 * Listado Maestro (ISO 7.5): una fila por documento, contada UNA sola vez por
 * su asociación principal (D6). Por defecto solo documentos con versión
 * vigente; `incluir:'todos'` agrega los que no la tienen (obsoleto/anulado),
 * describiendo su versión de mayor número. Un borrador o una versión descartada
 * nunca es la representativa: el documento que solo tiene esas no aparece.
 * La vigencia de cada fila vigente sale de la misma consulta del semáforo.
 */
export async function obtenerListadoMaestro(
  opciones: { incluir: "vigentes" | "todos"; sql?: Cliente; ahora?: Date },
): Promise<FilaMaestro[]> {
  const sql = opciones.sql ?? obtenerSql();
  const ahora = opciones.ahora ?? new Date();
  const soloVigentes = opciones.incluir === "vigentes";

  // La versión "representativa": la vigente si existe; si no y se piden todos,
  // la de mayor número entre las que son historial.
  const filas = await sql`
    SELECT d.id, d.codigo, d.titulo, d.origen, t.nombre AS tipo,
           v.numero AS version, v.edicion_externa, v.estado,
           v.fecha_elaboracion::text AS fecha_elaboracion,
           v.fecha_revision::text AS fecha_revision,
           v.fecha_aprobacion::text AS fecha_aprobacion,
           v.elaboro, v.reviso, v.aprobo, v.origen_aprobacion,
           COALESCE(
             pd.nombre,
             ps.nombre || ' › ' || sp.nombre
           ) AS propietario
    FROM documentos d
    JOIN tipos_documento t ON t.id = d.tipo_id
    JOIN LATERAL (
      SELECT * FROM documento_versiones vv
      WHERE vv.documento_id = d.id
        ${soloVigentes ? sql`AND vv.estado = 'vigente'` : sql`AND vv.estado NOT IN ('borrador', 'descartado')`}
      ORDER BY (vv.estado = 'vigente') DESC, vv.numero DESC
      LIMIT 1
    ) v ON true
    JOIN documento_proceso dp ON dp.documento_id = d.id AND dp.es_principal
    LEFT JOIN procesos pd ON pd.id = dp.proceso_id
    LEFT JOIN subprocesos sp ON sp.id = dp.subproceso_id
    LEFT JOIN procesos ps ON ps.id = sp.proceso_id
    ORDER BY d.codigo`;

  // Una versión obsoleta, anulada o descartada no tiene semáforo (spec 13C §7.2).
  const vigentes = filas.filter((f) => f.estado === "vigente").map((f) => Number(f.id));
  const vigencias = await vigenciaPorDocumento(sql, vigentes, ahora);
  const zona = zonaHoraria();
  const fecha = (d: Date | null | undefined) => (d ? fechaEnZona(d, zona) : null);

  return filas.map((f) => {
    const v = vigencias.get(Number(f.id));
    return {
      codigo: f.codigo as string,
      titulo: f.titulo as string,
      tipo: f.tipo as string,
      origen: f.origen as "interno" | "externo",
      version: (f.version as number | null) ?? null,
      edicion: (f.edicion_externa as string | null) ?? null,
      estado: f.estado as string,
      fechaElaboracion: (f.fecha_elaboracion as string | null) ?? null,
      fechaRevision: (f.fecha_revision as string | null) ?? null,
      fechaAprobacion: (f.fecha_aprobacion as string | null) ?? null,
      elaboro: (f.elaboro as string | null) ?? null,
      reviso: (f.reviso as string | null) ?? null,
      aprobo: (f.aprobo as string | null) ?? null,
      origenAprobacion: (f.origen_aprobacion as OrigenAprobacion | null) ?? null,
      ultimaRevision: fecha(v?.ultimaRevision?.fecha),
      proximaRevision: fecha(v?.proximaRevision),
      fijada: v?.fijada ? { por: v.fijada.por, en: fechaEnZona(v.fijada.en, zona) } : null,
      vigencia: v?.vigencia.estado ?? null,
      propietario: f.propietario as string,
    };
  });
}
