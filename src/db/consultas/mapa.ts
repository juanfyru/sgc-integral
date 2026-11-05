import { obtenerSql } from "@/db/cliente";
import { filtroAcceso, type SujetoVisibilidad } from "@/lib/alcance";

export type ProcesoMapa = {
  id: number;
  nombre: string;
  sigla: string;
  slug: string;
  icono: string;
  descripcion: string | null;
  // D10: documentos vigentes que aplican al proceso (asociación principal o
  // secundaria), incluyendo los de sus subprocesos. En el mapa del portal, solo
  // los que el usuario puede ver.
  docsVigentes: number;
  numSubprocesos: number;
  // Solo lo pobla la vista de admin (obtenerDatosMapaAdmin); el mapa público
  // no lo trae y los componentes lo tratan como activo.
  activo?: boolean;
};

export type MacroprocesoMapa = {
  id: number;
  letra: string;
  nombre: string;
  slug: string;
  banda: "estrategicos" | "misionales" | "apoyo" | "evaluacion";
  color: string;
  icono: string;
  procesos: ProcesoMapa[];
  activo?: boolean;
};

export type ElementoPeriferico = {
  tipo: "entrada" | "salida" | "convencion";
  texto: string;
  icono: string | null;
  activo?: boolean;
};

export type DatosMapa = {
  macroprocesos: MacroprocesoMapa[];
  entradas: ElementoPeriferico[];
  salidas: ElementoPeriferico[];
  convenciones: ElementoPeriferico[];
  configuracion: Record<string, string>;
};

export async function obtenerDatosMapa(sujeto: SujetoVisibilidad): Promise<DatosMapa> {
  const sql = obtenerSql();

  const [macros, procesos, elementos, config] = await Promise.all([
    sql`
      SELECT id, letra, nombre, slug, banda, color, icono
      FROM macroprocesos
      WHERE activo
      ORDER BY orden`,
    sql`
      SELECT
        p.id, p.nombre, p.sigla, p.slug, p.icono, p.descripcion,
        p.macroproceso_id AS macroproceso_id,
        (
          SELECT count(DISTINCT dp.documento_id)::int
          FROM documento_proceso dp
          JOIN documentos d ON d.id = dp.documento_id
          WHERE (
            dp.proceso_id = p.id
            OR dp.subproceso_id IN (
              SELECT s.id FROM subprocesos s
              WHERE s.proceso_id = p.id AND s.activo
            )
          )
          AND EXISTS (
            SELECT 1 FROM documento_versiones v
            WHERE v.documento_id = dp.documento_id AND v.estado = 'vigente'
          )
          AND ${filtroAcceso(sql, sujeto)}
        ) AS docs_vigentes,
        (
          SELECT count(*)::int FROM subprocesos s
          WHERE s.proceso_id = p.id AND s.activo
        ) AS num_subprocesos
      FROM procesos p
      WHERE p.activo
      ORDER BY p.orden`,
    sql`
      SELECT tipo, texto, icono
      FROM elementos_perifericos
      WHERE activo
      ORDER BY orden`,
    sql`SELECT clave, valor FROM configuracion`,
  ]);

  const macroprocesos: MacroprocesoMapa[] = macros.map((m) => ({
    id: m.id as number,
    letra: m.letra as string,
    nombre: m.nombre as string,
    slug: m.slug as string,
    banda: m.banda as MacroprocesoMapa["banda"],
    color: m.color as string,
    icono: m.icono as string,
    procesos: procesos
      .filter((p) => p.macroproceso_id === m.id)
      .map((p) => ({
        id: p.id as number,
        nombre: p.nombre as string,
        sigla: p.sigla as string,
        slug: p.slug as string,
        icono: p.icono as string,
        descripcion: p.descripcion as string | null,
        docsVigentes: p.docs_vigentes as number,
        numSubprocesos: p.num_subprocesos as number,
      })),
  }));

  const deTipo = (tipo: ElementoPeriferico["tipo"]) =>
    elementos
      .filter((e) => e.tipo === tipo)
      .map((e) => ({
        tipo,
        texto: e.texto as string,
        icono: e.icono as string | null,
      }));

  return {
    macroprocesos,
    entradas: deTipo("entrada"),
    salidas: deTipo("salida"),
    convenciones: deTipo("convencion"),
    configuracion: Object.fromEntries(config.map((c) => [c.clave, c.valor])),
  };
}

/**
 * Variante para la vista previa del admin: incluye TODOS los nodos (activos e
 * inactivos) con su bandera `activo`, para pintarlos en gris. El mapa público
 * usa `obtenerDatosMapa`, que filtra por `activo` y no toca este camino.
 */
export async function obtenerDatosMapaAdmin(): Promise<DatosMapa> {
  const sql = obtenerSql();

  const [macros, procesos, elementos, config] = await Promise.all([
    sql`
      SELECT id, letra, nombre, slug, banda, color, icono, activo
      FROM macroprocesos
      ORDER BY array_position(ARRAY['estrategicos','misionales','apoyo','evaluacion'], banda), orden`,
    sql`
      SELECT
        p.id, p.nombre, p.sigla, p.slug, p.icono, p.descripcion, p.activo,
        p.macroproceso_id AS macroproceso_id,
        (
          SELECT count(DISTINCT dp.documento_id)::int
          FROM documento_proceso dp
          WHERE (
            dp.proceso_id = p.id
            OR dp.subproceso_id IN (
              SELECT s.id FROM subprocesos s WHERE s.proceso_id = p.id
            )
          )
          AND EXISTS (
            SELECT 1 FROM documento_versiones v
            WHERE v.documento_id = dp.documento_id AND v.estado = 'vigente'
          )
        ) AS docs_vigentes,
        (SELECT count(*)::int FROM subprocesos s WHERE s.proceso_id = p.id) AS num_subprocesos
      FROM procesos p
      ORDER BY p.orden`,
    sql`SELECT tipo, texto, icono, activo FROM elementos_perifericos ORDER BY tipo, orden`,
    sql`SELECT clave, valor FROM configuracion`,
  ]);

  const macroprocesos: MacroprocesoMapa[] = macros.map((m) => ({
    id: m.id as number,
    letra: m.letra as string,
    nombre: m.nombre as string,
    slug: m.slug as string,
    banda: m.banda as MacroprocesoMapa["banda"],
    color: m.color as string,
    icono: m.icono as string,
    activo: m.activo as boolean,
    procesos: procesos
      .filter((p) => p.macroproceso_id === m.id)
      .map((p) => ({
        id: p.id as number,
        nombre: p.nombre as string,
        sigla: p.sigla as string,
        slug: p.slug as string,
        icono: p.icono as string,
        descripcion: p.descripcion as string | null,
        docsVigentes: p.docs_vigentes as number,
        numSubprocesos: p.num_subprocesos as number,
        activo: p.activo as boolean,
      })),
  }));

  const deTipo = (tipo: ElementoPeriferico["tipo"]) =>
    elementos
      .filter((e) => e.tipo === tipo)
      .map((e) => ({
        tipo,
        texto: e.texto as string,
        icono: e.icono as string | null,
        activo: e.activo as boolean,
      }));

  return {
    macroprocesos,
    entradas: deTipo("entrada"),
    salidas: deTipo("salida"),
    convenciones: deTipo("convencion"),
    configuracion: Object.fromEntries(config.map((c) => [c.clave, c.valor])),
  };
}
