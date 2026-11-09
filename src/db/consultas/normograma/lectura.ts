/**
 * Las lecturas del normograma (spec 13C §10.6): la ficha de una norma y las listas, para toda sesión. Un documento que
 * la persona no ve no se nombra. Se reexportan desde `normas.ts`.
 */
import type { PendingQuery, Row } from "postgres";
import { obtenerSql, type Cliente } from "@/db/cliente";
import { evidenciasDe, type Evidencia } from "@/db/consultas/distribucion/evidencias";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { alcanceProcesos, filtroAcceso, puedeAsociarNorma, type SujetoVisibilidad } from "@/lib/alcance";
import type { EstadoNorma, TipoRelacion } from "@/lib/normograma/tipos";
import { puede } from "@/lib/permisos";
import { condicionTexto, escaparLike, nombreSql } from "./busqueda";

type Opciones = { sql?: Cliente; ahora?: Date };

/** Para las rutas del PDF: la norma existe (también una retirada, que conserva su ficha). */
export async function existeNorma(normaId: number, opciones?: Opciones): Promise<boolean> {
  const sql = opciones?.sql ?? obtenerSql();
  return (await sql`SELECT 1 FROM normas WHERE id = ${normaId}`).length > 0;
}

export type Norma = {
  id: number;
  tipoNormaId: number;
  tipo: string;
  numero: string;
  anio: number;
  nombre: string;
  fechaExpedicion: string | null;
  entidadEmisora: string;
  titulo: string;
  tema: string | null;
  estado: EstadoNorma;
  estadoEn: string | null;
  /** Texto tal como se guardó: no se convierte en un enlace navegable (F13C-DC19). */
  enlaceOficial: string | null;
  notas: string | null;
  /** `directa`: esta norma es la que modifica, deroga o reglamenta a la otra. `id` es el de la relación. */
  relaciones: { id: number; tipo: TipoRelacion; norma: { id: number; nombre: string; estado: EstadoNorma }; detalle: string | null; directa: boolean }[];
  /**
   * El historial de estados. `relacion`: la que causó el cambio, con la norma que la causa; `eliminada` si se dio de
   * baja después (el cambio queda: `norma_cambios` es de solo inserción).
   */
  cambios: {
    estadoAnterior: EstadoNorma;
    estadoNuevo: EstadoNorma;
    fecha: string;
    nombre: string;
    nota: string | null;
    creadoEn: Date;
    relacion: { id: number; tipo: TipoRelacion; norma: { id: number; nombre: string }; eliminada: boolean } | null;
  }[];
  procesos: { id: number; nombre: string; sigla: string; slug: string; requisito: string | null; puedeEditar: boolean }[];
  /** Un documento que la persona no ve sale con `visible: false`, sin id, código ni título, después de los que ve. */
  documentos: { id: number | null; codigo: string | null; titulo: string | null; origen: "interno" | "externo"; visible: boolean }[];
  archivo: Evidencia | null;
  acciones: { administrar: boolean };
};

/** La ficha de una norma (spec 13C §10.6), para toda sesión; también la de una retirada. `null` si no existe. */
export async function obtenerNorma(id: number, sesion: SesionFlujo, opciones?: Opciones): Promise<Norma | null> {
  const sql = opciones?.sql ?? obtenerSql();
  const [n] = await sql`SELECT n.id, n.tipo_norma_id, tn.nombre AS tipo, n.numero, n.anio, ${nombreSql(sql)} AS nombre,
      n.fecha_expedicion::text AS fecha_expedicion, n.entidad_emisora, n.titulo, n.tema, n.estado, n.estado_en::text AS estado_en,
      n.enlace_oficial, n.notas
    FROM normas n JOIN tipos_norma tn ON tn.id = n.tipo_norma_id WHERE n.id = ${id}`;
  if (!n) return null;
  const [relaciones, cambios, procesos, documentos, archivos, alcance] = await Promise.all([
    sql`SELECT r.id, r.tipo, r.detalle, true AS directa, o.id AS otra_id, o.estado AS otra_estado,
        concat_ws(' ', otn.nombre, o.numero, 'de', o.anio::text) AS otra_nombre
      FROM norma_relaciones r JOIN normas o ON o.id = r.afectada_id JOIN tipos_norma otn ON otn.id = o.tipo_norma_id
      WHERE r.norma_id = ${id} AND r.eliminada_en IS NULL
      UNION ALL
      SELECT r.id, r.tipo, r.detalle, false AS directa, o.id AS otra_id, o.estado AS otra_estado,
        concat_ws(' ', otn.nombre, o.numero, 'de', o.anio::text) AS otra_nombre
      FROM norma_relaciones r JOIN normas o ON o.id = r.norma_id JOIN tipos_norma otn ON otn.id = o.tipo_norma_id
      WHERE r.afectada_id = ${id} AND r.eliminada_en IS NULL
      ORDER BY directa DESC, id`,
    sql`SELECT c.estado_anterior, c.estado_nuevo, c.fecha::text AS fecha, u.nombre, c.nota, c.creado_en,
        r.id AS relacion_id, r.tipo AS relacion_tipo, r.eliminada_en IS NOT NULL AS relacion_eliminada,
        o.id AS causa_id, concat_ws(' ', otn.nombre, o.numero, 'de', o.anio::text) AS causa_nombre
      FROM norma_cambios c JOIN usuarios u ON u.id = c.usuario_id
      LEFT JOIN norma_relaciones r ON r.id = c.relacion_id
      LEFT JOIN normas o ON o.id = r.norma_id
      LEFT JOIN tipos_norma otn ON otn.id = o.tipo_norma_id
      WHERE c.norma_id = ${id} ORDER BY c.creado_en, c.id`,
    sql`SELECT p.id, p.nombre, p.sigla, p.slug, np.requisito
      FROM norma_procesos np JOIN procesos p ON p.id = np.proceso_id
      WHERE np.norma_id = ${id} ORDER BY p.nombre`,
    sql`SELECT d.id, d.codigo, d.titulo, d.origen, ${filtroAcceso(sql, sesion)} AS visible
      FROM norma_documentos nd JOIN documentos d ON d.id = nd.documento_id
      WHERE nd.norma_id = ${id}
      ORDER BY 5 DESC, CASE WHEN ${filtroAcceso(sql, sesion)} THEN d.codigo END, nd.id`,
    evidenciasDe("norma", id, { sql }),
    alcanceProcesos(sesion, { sql }),
  ]);
  return {
    id: Number(n.id),
    tipoNormaId: Number(n.tipo_norma_id),
    tipo: n.tipo,
    numero: n.numero,
    anio: n.anio,
    nombre: n.nombre,
    fechaExpedicion: n.fecha_expedicion ?? null,
    entidadEmisora: n.entidad_emisora,
    titulo: n.titulo,
    tema: n.tema ?? null,
    estado: n.estado,
    estadoEn: n.estado_en ?? null,
    enlaceOficial: n.enlace_oficial ?? null,
    notas: n.notas ?? null,
    relaciones: relaciones.map((r) => ({
      id: Number(r.id),
      tipo: r.tipo,
      norma: { id: Number(r.otra_id), nombre: r.otra_nombre, estado: r.otra_estado },
      detalle: r.detalle ?? null,
      directa: r.directa,
    })),
    cambios: cambios.map((c) => ({
      estadoAnterior: c.estado_anterior,
      estadoNuevo: c.estado_nuevo,
      fecha: c.fecha,
      nombre: c.nombre,
      nota: c.nota ?? null,
      creadoEn: new Date(c.creado_en),
      relacion:
        c.relacion_id === null
          ? null
          : {
              id: Number(c.relacion_id),
              tipo: c.relacion_tipo,
              norma: { id: Number(c.causa_id), nombre: c.causa_nombre },
              eliminada: c.relacion_eliminada,
            },
    })),
    procesos: procesos.map((p) => ({
      id: Number(p.id),
      nombre: p.nombre,
      sigla: p.sigla,
      slug: p.slug,
      requisito: p.requisito ?? null,
      puedeEditar: puedeAsociarNorma(sesion, Number(p.id), alcance),
    })),
    documentos: documentos.map((d) =>
      d.visible
        ? { id: Number(d.id), codigo: d.codigo, titulo: d.titulo, origen: d.origen, visible: true }
        : { id: null, codigo: null, titulo: null, origen: d.origen, visible: false },
    ),
    archivo: archivos.at(-1) ?? null,
    acciones: { administrar: puede(sesion, "normograma.administrar") },
  };
}

export type FilaNorma = {
  id: number;
  nombre: string;
  titulo: string;
  entidadEmisora: string;
  estado: EstadoNorma;
  estadoEn: string | null;
  anio: number;
  tipo: string;
  /** Los nombres de los procesos asociados. */
  procesos: string[];
  /** Los documentos enlazados que la persona ve. */
  documentos: number;
};

export type FiltroNormas = {
  tipoNormaId?: number;
  anio?: number;
  emisor?: string;
  estado?: EstadoNorma | "todas";
  procesoId?: number;
  q?: string;
  incluirRetiradas?: boolean;
};

/**
 * Las filas de las listas del normograma que cumplen `condicion` (sobre `normas n` y `tipos_norma tn`), de la más
 * reciente a la más antigua. `documentos` cuenta solo lo que `sujeto` ve (un restringido que no ve no se
 * revela por diferencia). `requisitoDe`: el requisito que la norma impone a ese proceso.
 */
export async function filasDeNormas(
  sql: Cliente,
  condicion: PendingQuery<Row[]>,
  sujeto: SujetoVisibilidad,
  requisitoDe?: number,
): Promise<{ fila: FilaNorma; requisito: string | null }[]> {
  const filas = await sql`
    SELECT n.id, ${nombreSql(sql)} AS nombre, n.titulo, n.entidad_emisora, n.estado, n.estado_en::text AS estado_en, n.anio,
      tn.nombre AS tipo,
      ARRAY(SELECT p.nombre FROM norma_procesos np JOIN procesos p ON p.id = np.proceso_id
        WHERE np.norma_id = n.id ORDER BY p.nombre) AS procesos,
      (SELECT count(*) FROM norma_documentos nd JOIN documentos d ON d.id = nd.documento_id
        WHERE nd.norma_id = n.id AND ${filtroAcceso(sql, sujeto)})::int AS documentos,
      ${requisitoDe === undefined
        ? sql`NULL::text`
        : sql`(SELECT np.requisito FROM norma_procesos np WHERE np.norma_id = n.id AND np.proceso_id = ${requisitoDe})`} AS requisito
    FROM normas n JOIN tipos_norma tn ON tn.id = n.tipo_norma_id
    WHERE ${condicion}
    ORDER BY n.anio DESC, tn.orden, n.numero, n.id`;
  return filas.map((f) => ({
    fila: {
      id: Number(f.id),
      nombre: f.nombre,
      titulo: f.titulo,
      entidadEmisora: f.entidad_emisora,
      estado: f.estado,
      estadoEn: f.estado_en ?? null,
      anio: f.anio,
      tipo: f.tipo,
      procesos: f.procesos as string[],
      documentos: f.documentos,
    },
    requisito: f.requisito ?? null,
  }));
}

/**
 * El normograma institucional con sus filtros (spec 13C §10.6). Sin las retiradas salvo `incluirRetiradas` o
 * `estado: "retirada"`. `documentos` cuenta solo lo que `sesion` ve.
 */
export async function listarNormas(filtro: FiltroNormas, sesion: SujetoVisibilidad, opciones?: Opciones): Promise<FilaNorma[]> {
  const sql = opciones?.sql ?? obtenerSql();
  const condiciones: PendingQuery<Row[]>[] = [];
  if (filtro.estado === "retirada") condiciones.push(sql`n.estado = 'retirada'`);
  else {
    if (!filtro.incluirRetiradas) condiciones.push(sql`n.estado <> 'retirada'`);
    if (filtro.estado && filtro.estado !== "todas") condiciones.push(sql`n.estado = ${filtro.estado}`);
  }
  if (filtro.tipoNormaId !== undefined) condiciones.push(sql`n.tipo_norma_id = ${filtro.tipoNormaId}`);
  if (filtro.anio !== undefined) condiciones.push(sql`n.anio = ${filtro.anio}`);
  if (filtro.emisor?.trim()) condiciones.push(sql`lower(n.entidad_emisora) = lower(${filtro.emisor.trim()})`);
  if (filtro.procesoId !== undefined) {
    condiciones.push(sql`EXISTS (SELECT 1 FROM norma_procesos fnp WHERE fnp.norma_id = n.id AND fnp.proceso_id = ${filtro.procesoId})`);
  }
  if (filtro.q?.trim()) condiciones.push(condicionTexto(sql, filtro.q.trim()));
  const condicion = condiciones.reduce((a, b) => sql`${a} AND ${b}`, sql`true`);
  return (await filasDeNormas(sql, condicion, sesion)).map((f) => f.fila);
}

/** Hasta 10 entidades emisoras ya escritas que empiezan por `prefijo` (el `datalist` del formulario). */
export async function sugerirEmisores(prefijo: string, opciones?: Opciones): Promise<string[]> {
  const sql = opciones?.sql ?? obtenerSql();
  const filas = await sql`SELECT DISTINCT entidad_emisora FROM normas
    WHERE entidad_emisora ILIKE ${`${escaparLike(prefijo.trim())}%`}
    ORDER BY entidad_emisora LIMIT 10`;
  return filas.map((f) => f.entidad_emisora as string);
}

/** Los años y los emisores de las normas no retiradas, para los filtros de la lista. */
export async function aniosYEmisores(opciones?: Opciones): Promise<{ anios: number[]; emisores: string[] }> {
  const sql = opciones?.sql ?? obtenerSql();
  const [f] = await sql`SELECT
      ARRAY(SELECT DISTINCT anio FROM normas WHERE estado <> 'retirada' ORDER BY anio DESC) AS anios,
      ARRAY(SELECT DISTINCT entidad_emisora FROM normas WHERE estado <> 'retirada' ORDER BY entidad_emisora) AS emisores`;
  return { anios: (f.anios as number[]).map(Number), emisores: f.emisores as string[] };
}
