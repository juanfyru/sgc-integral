/** Las opciones de los formularios y filtros del módulo de mejoramiento. */
import { obtenerSql, type Cliente } from "@/db/cliente";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { nombreSql } from "@/db/consultas/normograma/busqueda";
import { alcanceProcesos, filtroAcceso, filtroHallazgos, filtroIndicadores } from "@/lib/alcance";
import { periodoDe } from "@/lib/indicadores-documentales/periodo";
import { etiquetasDeUsuarios } from "@/lib/mejoramiento/textos";
import { zonaHoraria } from "@/lib/zona-horaria";

/** Los procesos activos que la persona alcanza: el líder, solo los suyos; Admin SGC y Control Interno, todos (`alcanceProcesos`). */
export async function procesosDelAlcance(sesion: SesionFlujo, opciones?: { sql?: Cliente }): Promise<Array<{ id: number; nombre: string }>> {
  const sql = opciones?.sql ?? obtenerSql();
  const alcance = await alcanceProcesos(sesion, { sql });
  const filas = alcance.todos
    ? await sql`SELECT id, nombre FROM procesos WHERE activo ORDER BY nombre`
    : await sql`SELECT id, nombre FROM procesos WHERE activo AND id = ANY(${sql.array(alcance.procesoIds)}::bigint[]) ORDER BY nombre`;
  return filas.map((f) => ({ id: Number(f.id), nombre: f.nombre as string }));
}

/** Todos los procesos activos: en qué proceso vio algo quien reporta (spec 15 §7.3), sea cual sea su alcance. */
export async function procesosActivos(opciones?: { sql?: Cliente }): Promise<Array<{ id: number; nombre: string }>> {
  const filas = await (opciones?.sql ?? obtenerSql())`SELECT id, nombre FROM procesos WHERE activo ORDER BY nombre`;
  return filas.map((f) => ({ id: Number(f.id), nombre: f.nombre as string }));
}

/** Las normas del normograma que rigen (vigentes o modificadas), para elegir el requisito incumplido; las lee toda sesión. */
export async function normasQueRigen(opciones?: { sql?: Cliente }): Promise<Array<{ id: number; nombre: string; titulo: string }>> {
  const sql = opciones?.sql ?? obtenerSql();
  const filas = await sql`
    SELECT n.id, ${nombreSql(sql)} AS nombre, n.titulo
    FROM normas n JOIN tipos_norma tn ON tn.id = n.tipo_norma_id
    WHERE n.estado IN ('vigente', 'modificada')
    ORDER BY n.anio DESC, tn.orden, n.numero, n.id`;
  return filas.map((f) => ({ id: Number(f.id), nombre: f.nombre as string, titulo: f.titulo as string }));
}

/**
 * Las normas de la lista y, al final, la norma `normaId` si no está entre ellas: la que llega fija del impacto de un hallazgo (Fase 15B,
 * anexo §8), que suele estar derogada o retirada, para que el formulario la muestre por su nombre. Las normas las lee toda sesión.
 */
export async function conLaNorma(
  normas: Array<{ id: number; nombre: string; titulo: string }>,
  normaId: number | null | undefined,
  opciones?: { sql?: Cliente },
): Promise<Array<{ id: number; nombre: string; titulo: string }>> {
  if (normaId === null || normaId === undefined || normas.some((n) => n.id === normaId)) return normas;
  const sql = opciones?.sql ?? obtenerSql();
  const [f] = await sql`SELECT n.id, ${nombreSql(sql)} AS nombre, n.titulo FROM normas n JOIN tipos_norma tn ON tn.id = n.tipo_norma_id
    WHERE n.id = ${normaId}`;
  return f ? [...normas, { id: Number(f.id), nombre: f.nombre as string, titulo: f.titulo as string }] : normas;
}

/** Los documentos con una versión vigente que la persona puede ver (`filtroAcceso`). */
export async function documentosVigentesVisibles(
  sesion: SesionFlujo,
  opciones?: { sql?: Cliente },
): Promise<Array<{ id: number; codigo: string; titulo: string }>> {
  const sql = opciones?.sql ?? obtenerSql();
  const filas = await sql`
    SELECT d.id, d.codigo, d.titulo FROM documentos d
    WHERE EXISTS (SELECT 1 FROM documento_versiones v WHERE v.documento_id = d.id AND v.estado = 'vigente')
      AND ${filtroAcceso(sql, sesion)}
    ORDER BY d.codigo`;
  return filas.map((f) => ({ id: Number(f.id), codigo: f.codigo as string, titulo: f.titulo as string }));
}

/** Los hallazgos cerrados de un proceso, para elegir de cuál es reincidencia otro (spec 15 §7.5). */
export async function cerradosDelProceso(
  procesoId: number,
  excluirId: number,
  opciones?: { sql?: Cliente },
): Promise<Array<{ id: number; codigo: string; titulo: string }>> {
  const sql = opciones?.sql ?? obtenerSql();
  const filas = await sql`SELECT id, codigo, titulo FROM mejora_hallazgos
    WHERE proceso_id = ${procesoId} AND estado = 'cerrado' AND id <> ${excluirId} ORDER BY cerrado_en DESC NULLS LAST, id DESC LIMIT 100`;
  return filas.map((f) => ({ id: Number(f.id), codigo: f.codigo as string, titulo: f.titulo as string }));
}

/** Un usuario activo para un selector, con su cargo y el texto que lo distingue de un homónimo (`etiquetasDeUsuarios`). */
export type UsuarioElegible = { id: number; nombre: string; cargo: string | null; etiqueta: string };

/**
 * Los usuarios activos con su cargo, para elegir un responsable (la corrección, una actividad, un ajuste o una reasignación). El
 * usuario de ingreso no sale de aquí: solo va dentro de la etiqueta de dos que se ven igual.
 */
export async function usuariosActivos(opciones?: { sql?: Cliente }): Promise<UsuarioElegible[]> {
  const sql = opciones?.sql ?? obtenerSql();
  const filas = await sql`SELECT u.id, u.nombre, u.usuario, c.nombre AS cargo
    FROM usuarios u LEFT JOIN cargos c ON c.id = u.cargo_id
    WHERE u.activo ORDER BY u.nombre, u.id`;
  const usuarios = filas.map((f) => ({ id: Number(f.id), nombre: f.nombre as string, cargo: (f.cargo as string | null) ?? null, usuario: f.usuario as string }));
  const etiquetas = etiquetasDeUsuarios(usuarios);
  return usuarios.map((u) => ({ id: u.id, nombre: u.nombre, cargo: u.cargo, etiqueta: etiquetas.get(u.id) ?? u.nombre }));
}

/** Un indicador que se puede enlazar en «A qué se refiere» y las mediciones con resultado de cada uno (`indicadoresConMediciones`). */
export type IndicadoresConMediciones = {
  /** `restringido`: el indicador es de acceso restringido (el registro lo avisa, anexo §10.3). */
  indicadores: Array<{ id: number; codigo: string; nombre: string; restringido?: boolean }>;
  /** Las mediciones con resultado de cada indicador, de la más reciente a la más antigua (hasta 24 por indicador). */
  mediciones: Array<{ id: number; indicadorId: number; etiqueta: string }>;
};

/**
 * Los indicadores que «A qué se refiere» deja enlazar (Fase 15B, anexo §10.3; `revisarIdentificacion` lo vuelve a comprobar): los
 * activos o retirados que la persona ve (`filtroIndicadores`), y las mediciones con resultado de cada uno. Es la misma regla con que
 * `prellenadoDeRegistro` acepta `?indicador=`: lo que propone siempre está en la lista.
 */
export async function indicadoresConMediciones(sesion: SesionFlujo, opciones?: { sql?: Cliente }): Promise<IndicadoresConMediciones> {
  const sql = opciones?.sql ?? obtenerSql();
  const zona = zonaHoraria();
  const indicadores = await sql`SELECT i.id, i.codigo, coalesce((SELECT iv.nombre FROM indicador_versiones iv
      WHERE iv.indicador_id = i.id AND iv.estado = 'aprobada' ORDER BY iv.numero DESC LIMIT 1), i.codigo) AS nombre,
      i.nivel_acceso = 'restringido' AS restringido
    FROM indicadores i WHERE i.estado IN ('activo', 'retirado') AND ${filtroIndicadores(sql, sesion)}
    ORDER BY i.codigo, i.id`;
  const ids = indicadores.map((f) => Number(f.id));
  const mediciones = ids.length
    ? await sql`SELECT id, indicador_id, periodo FROM (
          SELECT m.id, m.indicador_id, m.periodo, row_number() OVER (PARTITION BY m.indicador_id ORDER BY m.desde DESC, m.id DESC) AS n
          FROM mediciones m WHERE m.indicador_id = ANY(${ids}::bigint[]) AND m.resultado IS NOT NULL) x
        WHERE n <= 24 ORDER BY indicador_id, n`
    : [];
  return {
    indicadores: indicadores.map((f) => ({ id: Number(f.id), codigo: f.codigo as string, nombre: f.nombre as string, restringido: f.restringido === true })),
    mediciones: mediciones.map((f) => ({
      id: Number(f.id),
      indicadorId: Number(f.indicador_id),
      etiqueta: periodoDe(f.periodo as string, zona)?.etiqueta ?? (f.periodo as string),
    })),
  };
}

/** Un objetivo del maestro que se puede elegir, con su clase delante («Institucional · …»). */
export type ObjetivoElegible = { id: number; etiqueta: string };

/**
 * Los objetivos activos del maestro `objetivos` (Fase 15B, anexo §10.4): los de calidad primero y después los institucionales, en
 * su orden. Uno desactivado no se elige de nuevo (`OBJETIVO_INACTIVO` en el servidor). Los lee toda sesión.
 */
export async function objetivosActivos(opciones?: { sql?: Cliente }): Promise<ObjetivoElegible[]> {
  const filas = await (opciones?.sql ?? obtenerSql())`SELECT id, clase, enunciado FROM objetivos WHERE activo
    ORDER BY clase <> 'calidad', orden, id`;
  return filas.map((f) => ({
    id: Number(f.id),
    etiqueta: `${f.clase === "calidad" ? "Calidad" : "Institucional"} · ${f.enunciado as string}`,
  }));
}

/** Lo que la carga de un hallazgo en curso deja enlazar en su identificación (`opcionesDeLaCarga`). */
export type OpcionesDeLaCarga = IndicadoresConMediciones & {
  subprocesos: Array<{ id: number; nombre: string; procesoId: number }>;
  /** De qué hallazgo cerrado del mismo proceso es reincidencia (spec §7.5). */
  cerrados: Array<{ id: number; codigo: string; titulo: string; procesoId: number }>;
};

/**
 * Lo que la identificación de una carga (spec §15) enlaza como la de un registro (§7.1, `revisarIdentificacion` lo vuelve a
 * comprobar): los subprocesos activos de cada proceso, los cerrados de cada proceso que la persona ve (los 100 más recientes), y los
 * indicadores con sus mediciones de «A qué se refiere» (`indicadoresConMediciones`).
 */
export async function opcionesDeLaCarga(sesion: SesionFlujo, opciones?: { sql?: Cliente }): Promise<OpcionesDeLaCarga> {
  const sql = opciones?.sql ?? obtenerSql();
  const [subprocesos, cerrados, aQueSeRefiere] = await Promise.all([
    sql`SELECT s.id, s.nombre, s.proceso_id FROM subprocesos s JOIN procesos p ON p.id = s.proceso_id AND p.activo
      WHERE s.activo ORDER BY s.proceso_id, s.orden, s.id`,
    sql`SELECT id, codigo, titulo, proceso_id FROM (
        SELECT h.id, h.codigo, h.titulo, h.proceso_id,
          row_number() OVER (PARTITION BY h.proceso_id ORDER BY h.cerrado_en DESC NULLS LAST, h.id DESC) AS n
        FROM mejora_hallazgos h WHERE h.estado = 'cerrado' AND ${filtroHallazgos(sql, sesion)}) c
      WHERE n <= 100 ORDER BY proceso_id, n`,
    indicadoresConMediciones(sesion, { sql }),
  ]);
  return {
    subprocesos: subprocesos.map((f) => ({ id: Number(f.id), nombre: f.nombre as string, procesoId: Number(f.proceso_id) })),
    cerrados: cerrados.map((f) => ({ id: Number(f.id), codigo: f.codigo as string, titulo: f.titulo as string, procesoId: Number(f.proceso_id) })),
    ...aQueSeRefiere,
  };
}
