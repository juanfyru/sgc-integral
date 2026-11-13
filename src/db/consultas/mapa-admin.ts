import type { Sql, TransactionSql } from "postgres";
import { obtenerSql } from "@/db/cliente";
import { registrarAuditoria } from "@/db/consultas/admin";
import {
  validarBanda,
  validarColor,
  validarSigla,
  validarSiglaOpcional,
  exigirSiglaNoReservada,
  validarSlug,
} from "@/lib/validaciones-mapa";

export type Cliente = Sql | TransactionSql;

export type Tabla =
  | "macroprocesos"
  | "procesos"
  | "subprocesos"
  | "elementos_perifericos"
  | "tipos_documento";

export const TABLAS_MAPA: readonly Tabla[] = [
  "macroprocesos",
  "procesos",
  "subprocesos",
  "elementos_perifericos",
  "tipos_documento",
];

// Columna que delimita a los hermanos para reordenar (null = orden global).
const AMBITO: Record<Tabla, string | null> = {
  macroprocesos: "banda",
  procesos: "macroproceso_id",
  subprocesos: "proceso_id",
  elementos_perifericos: "tipo",
  tipos_documento: null,
};

// Nombre singular de la entidad para la acción de auditoría.
const SINGULAR: Record<Tabla, string> = {
  macroprocesos: "macroproceso",
  procesos: "proceso",
  subprocesos: "subproceso",
  elementos_perifericos: "periferico",
  tipos_documento: "tipo_documento",
};

// Siguiente `orden` dentro del ámbito (para altas). Exportado para reuso.
export async function siguienteOrden(
  tx: Cliente,
  tabla: Tabla,
  ambitoCol: string | null,
  ambitoValor: string | number | null,
): Promise<number> {
  const filtro = ambitoCol ? tx`WHERE ${tx(ambitoCol)} = ${ambitoValor}` : tx``;
  const [r] = await tx`SELECT coalesce(max(orden), 0) + 1 AS n
    FROM ${tx(tabla)} ${filtro}`;
  return r.n as number;
}

/** Intercambia el `orden` de la fila con su hermano inmediato en la dirección
 *  dada, dentro del mismo ámbito. No-op silencioso si ya está en el extremo. */
export async function mover(
  tabla: Tabla,
  id: number,
  direccion: "arriba" | "abajo",
  usuarioId: number,
): Promise<void> {
  const ambito = AMBITO[tabla];
  const sql = obtenerSql();
  await sql.begin(async (tx) => {
    const [fila] = await tx`SELECT * FROM ${tx(tabla)} WHERE id = ${id} FOR UPDATE`;
    if (!fila) throw new Error("El elemento no existe");
    const mismoAmbito = ambito ? tx`AND ${tx(ambito)} = ${fila[ambito]}` : tx``;
    const [vecino] =
      direccion === "arriba"
        ? await tx`SELECT id, orden FROM ${tx(tabla)}
            WHERE orden < ${fila.orden} ${mismoAmbito}
            ORDER BY orden DESC LIMIT 1 FOR UPDATE`
        : await tx`SELECT id, orden FROM ${tx(tabla)}
            WHERE orden > ${fila.orden} ${mismoAmbito}
            ORDER BY orden ASC LIMIT 1 FOR UPDATE`;
    if (!vecino) return; // extremo: no-op
    await tx`UPDATE ${tx(tabla)} SET orden = ${vecino.orden} WHERE id = ${fila.id}`;
    await tx`UPDATE ${tx(tabla)} SET orden = ${fila.orden} WHERE id = ${vecino.id}`;
    await registrarAuditoria(tx, {
      usuarioId, accion: `reordenar_${SINGULAR[tabla]}`, entidad: tabla,
      entidadId: id, detalle: { direccion },
    });
  });
}

/** Activa o desactiva una fila (todas las tablas del mapa tienen `activo`). */
export async function alternarActivo(
  tabla: Tabla,
  id: number,
  activo: boolean,
  usuarioId: number,
): Promise<void> {
  const sql = obtenerSql();
  await sql.begin(async (tx) => {
    const [fila] = await tx`UPDATE ${tx(tabla)} SET activo = ${activo}
      WHERE id = ${id} RETURNING id`;
    if (!fila) throw new Error("El elemento no existe");
    await registrarAuditoria(tx, {
      usuarioId,
      accion: `${activo ? "activar" : "desactivar"}_${SINGULAR[tabla]}`,
      entidad: tabla, entidadId: id, detalle: {},
    });
  });
}

/** Borrado duro: audita ANTES (la fila desaparece) y traduce la violación de
 *  FK (onDelete restrict) en un error de negocio legible. La UI solo ofrece
 *  este botón cuando no hay dependientes; esto es la red de seguridad. */
export async function borrar(
  tabla: Tabla,
  id: number,
  usuarioId: number,
): Promise<void> {
  const sql = obtenerSql();
  await sql.begin(async (tx) => {
    const [fila] = await tx`SELECT * FROM ${tx(tabla)} WHERE id = ${id} FOR UPDATE`;
    if (!fila) throw new Error("El elemento no existe");
    await registrarAuditoria(tx, {
      usuarioId, accion: `borrar_${SINGULAR[tabla]}`, entidad: tabla,
      entidadId: id,
      detalle: { nombre: fila.nombre ?? fila.texto ?? null },
    });
    try {
      await tx`DELETE FROM ${tx(tabla)} WHERE id = ${id}`;
    } catch (err) {
      if ((err as { code?: string }).code === "23503") {
        throw new Error(
          "No se puede borrar: tiene elementos o documentos asociados. Desactívelo.",
        );
      }
      throw err;
    }
  });
}

// Traduce la violación de índice único (23505) en un error de negocio legible.
export function traducirUnico(err: unknown, mensaje: string): Error {
  if ((err as { code?: string }).code === "23505") return new Error(mensaje);
  return err as Error;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tipos de documento (tabla maestra)
// ─────────────────────────────────────────────────────────────────────────────

export type AutoridadTipo = "estrategico" | "operativo";
export const AUTORIDADES_TIPO: readonly AutoridadTipo[] = ["estrategico", "operativo"];

export type FilaTipo = {
  id: number; nombre: string; sigla: string;
  esDiligenciable: boolean; orden: number; activo: boolean; numDocs: number;
  autoridad: AutoridadTipo; plantillaDocumentoId: number | null; plantillaCodigo: string | null; plantillaVigente: boolean;
  mesesRevision: number;
};

export async function listarTipos(): Promise<FilaTipo[]> {
  const sql = obtenerSql();
  const filas = await sql`
    SELECT t.id, t.nombre, t.sigla, t.es_diligenciable, t.orden, t.activo, t.autoridad, t.meses_revision,
      t.plantilla_documento_id, p.codigo AS plantilla_codigo,
      EXISTS (SELECT 1 FROM documento_versiones v WHERE v.documento_id = t.plantilla_documento_id AND v.estado = 'vigente') AS plantilla_vigente,
      (SELECT count(*)::int FROM documentos d WHERE d.tipo_id = t.id) AS num_docs
    FROM tipos_documento t LEFT JOIN documentos p ON p.id = t.plantilla_documento_id
    ORDER BY t.orden`;
  return filas.map((f) => ({
    id: f.id, nombre: f.nombre, sigla: f.sigla,
    esDiligenciable: f.es_diligenciable, orden: f.orden,
    activo: f.activo, numDocs: f.num_docs, autoridad: f.autoridad,
    plantillaDocumentoId: f.plantilla_documento_id === null ? null : Number(f.plantilla_documento_id),
    plantillaCodigo: f.plantilla_codigo,
    plantillaVigente: f.plantilla_vigente,
    mesesRevision: f.meses_revision,
  }));
}

export async function obtenerTipo(id: number) {
  const sql = obtenerSql();
  const [f] = await sql`SELECT t.id, t.nombre, t.sigla, t.es_diligenciable, t.autoridad, t.meses_revision,
      t.plantilla_documento_id, p.codigo AS plantilla_codigo
    FROM tipos_documento t LEFT JOIN documentos p ON p.id = t.plantilla_documento_id
    WHERE t.id = ${id}`;
  if (!f) return null;
  return {
    id: f.id, nombre: f.nombre, sigla: f.sigla, esDiligenciable: f.es_diligenciable,
    autoridad: f.autoridad as AutoridadTipo, mesesRevision: f.meses_revision as number,
    plantillaDocumentoId: f.plantilla_documento_id === null ? null : Number(f.plantilla_documento_id),
    plantillaCodigo: f.plantilla_codigo as string | null,
  };
}

/** Los documentos que pueden ser plantilla: los que tienen una versión vigente. */
export async function listarPlantillasPosibles(): Promise<{ id: number; codigo: string; titulo: string }[]> {
  const sql = obtenerSql();
  const filas = await sql`SELECT d.id, d.codigo, d.titulo FROM documentos d
    WHERE EXISTS (SELECT 1 FROM documento_versiones v WHERE v.documento_id = d.id AND v.estado = 'vigente')
    ORDER BY d.codigo`;
  return filas.map((f) => ({ id: Number(f.id), codigo: f.codigo, titulo: f.titulo }));
}

export type DatosTipo = {
  nombre: string; sigla: string; esDiligenciable: boolean;
  autoridad: AutoridadTipo; plantillaDocumentoId: number | null;
  /** Plazo de revisión de los documentos del tipo, en meses calendario (1 a 120). */
  mesesRevision: number;
};

/** La autoridad es una de las dos y la plantilla, si hay, es un documento con versión vigente. */
async function validarAutoridadYPlantilla(tx: TransactionSql, d: DatosTipo): Promise<void> {
  if (!AUTORIDADES_TIPO.includes(d.autoridad)) throw new Error("La autoridad del tipo es inválida");
  if (!Number.isInteger(d.mesesRevision) || d.mesesRevision < 1 || d.mesesRevision > 120) {
    throw new Error("El plazo de revisión debe ser un número entero de meses entre 1 y 120");
  }
  if (d.plantillaDocumentoId === null) return;
  const [vigente] = await tx`SELECT 1 FROM documento_versiones
    WHERE documento_id = ${d.plantillaDocumentoId} AND estado = 'vigente'`;
  if (!vigente) throw new Error("La plantilla debe ser un documento vigente");
}

/** `IND` e `ID` son las siglas de los códigos de indicador: ningún tipo de documento las usa. */
function exigirSiglaLibre(sigla: string): void {
  exigirSiglaNoReservada(sigla);
}

/**
 * La sigla de un proceso o de un subproceso es única entre las dos tablas (14A §4): el índice único de cada tabla no ve
 * la otra, así que se comprueba aquí, dentro de la misma transacción. `excluir` es la fila que se está editando.
 */
async function exigirSiglaDeMapaLibre(
  tx: TransactionSql,
  sigla: string,
  excluir: { proceso?: number; subproceso?: number },
): Promise<void> {
  const [hay] = await tx`SELECT 1 AS hay FROM (
      SELECT id, 'p' AS t FROM procesos WHERE lower(sigla) = lower(${sigla})
      UNION ALL
      SELECT id, 's' AS t FROM subprocesos WHERE lower(sigla) = lower(${sigla})
    ) x
    WHERE NOT (x.t = 'p' AND x.id = ${excluir.proceso ?? 0})
      AND NOT (x.t = 's' AND x.id = ${excluir.subproceso ?? 0})
    LIMIT 1`;
  if (hay) throw new Error(`Ya hay un proceso o subproceso con la sigla ${sigla}`);
}

/** Un `23505` de un índice de sigla llega a veces antes que la comprobación: se traduce igual. */
function traducirSigla(err: unknown, sigla: string | null, alternativa: string): Error {
  const e = err as { code?: string; constraint_name?: string };
  if (e.code === "23505" && sigla !== null && /sigla/.test(e.constraint_name ?? "")) {
    return new Error(`Ya hay un proceso o subproceso con la sigla ${sigla}`);
  }
  return traducirUnico(err, alternativa);
}

export async function crearTipo(
  d: DatosTipo,
  usuarioId: number,
): Promise<{ id: number }> {
  exigirSiglaLibre(d.sigla);
  const sql = obtenerSql();
  try {
    return await sql.begin(async (tx) => {
      await validarAutoridadYPlantilla(tx, d);
      const orden = await siguienteOrden(tx, "tipos_documento", null, null);
      const [t] = await tx`INSERT INTO tipos_documento (nombre, sigla, es_diligenciable, orden, autoridad, plantilla_documento_id, meses_revision)
        VALUES (${d.nombre}, ${d.sigla}, ${d.esDiligenciable}, ${orden}, ${d.autoridad}, ${d.plantillaDocumentoId}, ${d.mesesRevision}) RETURNING id`;
      await registrarAuditoria(tx, {
        usuarioId, accion: "crear_tipo_documento", entidad: "tipos_documento",
        entidadId: t.id, detalle: d,
      });
      return { id: t.id };
    });
  } catch (err) {
    throw traducirUnico(err, "Ya existe un tipo con ese nombre o sigla");
  }
}

export async function editarTipo(
  id: number,
  d: DatosTipo,
  usuarioId: number,
): Promise<void> {
  exigirSiglaLibre(d.sigla);
  const sql = obtenerSql();
  try {
    await sql.begin(async (tx) => {
      await validarAutoridadYPlantilla(tx, d);
      const [antes] = await tx`SELECT autoridad, plantilla_documento_id, meses_revision FROM tipos_documento WHERE id = ${id} FOR UPDATE`;
      if (!antes) throw new Error("El tipo no existe");
      await tx`UPDATE tipos_documento SET nombre = ${d.nombre},
          sigla = ${d.sigla}, es_diligenciable = ${d.esDiligenciable},
          autoridad = ${d.autoridad}, plantilla_documento_id = ${d.plantillaDocumentoId},
          meses_revision = ${d.mesesRevision}
        WHERE id = ${id}`;
      await registrarAuditoria(tx, {
        usuarioId, accion: "editar_tipo_documento", entidad: "tipos_documento",
        entidadId: id,
        detalle: {
          ...d,
          autoridadAnterior: antes.autoridad,
          mesesRevisionAnterior: antes.meses_revision,
          plantillaDocumentoIdAnterior: antes.plantilla_documento_id === null ? null : Number(antes.plantilla_documento_id),
        },
      });
    });
  } catch (err) {
    throw traducirUnico(err, "Ya existe un tipo con ese nombre o sigla");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Textos institucionales (tabla clave-valor `configuracion`)
// ─────────────────────────────────────────────────────────────────────────────

export const CLAVES_TEXTO: ReadonlyArray<{
  clave: string; etiqueta: string; textarea?: boolean;
}> = [
  { clave: "subtitulo_mapa", etiqueta: "Subtítulo del mapa" },
  { clave: "titulo_phva", etiqueta: "Título del ciclo PHVA" },
  { clave: "texto_phva", etiqueta: "Texto del ciclo PHVA", textarea: true },
];

export async function obtenerTextos(): Promise<Record<string, string>> {
  const sql = obtenerSql();
  const claves = CLAVES_TEXTO.map((c) => c.clave);
  const filas = await sql`SELECT clave, valor FROM configuracion
    WHERE clave IN ${sql(claves)}`;
  return Object.fromEntries(filas.map((f) => [f.clave, f.valor]));
}

export async function guardarTextos(
  valores: Record<string, string>,
  usuarioId: number,
): Promise<void> {
  // Solo claves conocidas; ignora cualquier otra que llegue.
  const permitidas = new Set(CLAVES_TEXTO.map((c) => c.clave));
  const entradas = Object.entries(valores).filter(([k]) => permitidas.has(k));
  const sql = obtenerSql();
  await sql.begin(async (tx) => {
    for (const [clave, valor] of entradas) {
      await tx`INSERT INTO configuracion (clave, valor) VALUES (${clave}, ${valor})
        ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor`;
    }
    await registrarAuditoria(tx, {
      usuarioId, accion: "editar_configuracion", entidad: "configuracion",
      entidadId: null, detalle: { claves: entradas.map(([k]) => k) },
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Elementos periféricos (entradas / salidas / convenciones)
// ─────────────────────────────────────────────────────────────────────────────

const TIPOS_PERIFERICO = ["entrada", "salida", "convencion"] as const;
type TipoPeriferico = (typeof TIPOS_PERIFERICO)[number];

export type FilaPeriferico = {
  id: number; tipo: string; texto: string;
  icono: string | null; orden: number; activo: boolean;
};

export async function listarPerifericos(): Promise<
  Record<TipoPeriferico, FilaPeriferico[]>
> {
  const sql = obtenerSql();
  const filas = await sql`SELECT id, tipo, texto, icono, orden, activo
    FROM elementos_perifericos ORDER BY tipo, orden`;
  const grupos: Record<TipoPeriferico, FilaPeriferico[]> = {
    entrada: [], salida: [], convencion: [],
  };
  for (const f of filas) {
    grupos[f.tipo as TipoPeriferico]?.push({
      id: f.id, tipo: f.tipo, texto: f.texto, icono: f.icono,
      orden: f.orden, activo: f.activo,
    });
  }
  return grupos;
}

export async function obtenerPeriferico(id: number) {
  const sql = obtenerSql();
  const [f] = await sql`SELECT id, tipo, texto, icono FROM elementos_perifericos WHERE id = ${id}`;
  if (!f) return null;
  return { id: f.id, tipo: f.tipo, texto: f.texto, icono: f.icono };
}

export type DatosPeriferico = { tipo: string; texto: string; icono: string | null };

function validarTipoPeriferico(tipo: string): TipoPeriferico {
  if (!(TIPOS_PERIFERICO as readonly string[]).includes(tipo)) {
    throw new Error("El tipo debe ser entrada, salida o convención");
  }
  return tipo as TipoPeriferico;
}

export async function crearPeriferico(
  d: DatosPeriferico,
  usuarioId: number,
): Promise<{ id: number }> {
  const tipo = validarTipoPeriferico(d.tipo);
  if (!d.texto.trim()) throw new Error("El texto es obligatorio");
  const sql = obtenerSql();
  return await sql.begin(async (tx) => {
    const orden = await siguienteOrden(tx, "elementos_perifericos", "tipo", tipo);
    const [p] = await tx`INSERT INTO elementos_perifericos (tipo, texto, icono, orden)
      VALUES (${tipo}, ${d.texto}, ${d.icono}, ${orden}) RETURNING id`;
    await registrarAuditoria(tx, {
      usuarioId, accion: "crear_periferico", entidad: "elementos_perifericos",
      entidadId: p.id, detalle: d,
    });
    return { id: p.id };
  });
}

export async function editarPeriferico(
  id: number,
  d: DatosPeriferico,
  usuarioId: number,
): Promise<void> {
  const tipo = validarTipoPeriferico(d.tipo);
  if (!d.texto.trim()) throw new Error("El texto es obligatorio");
  const sql = obtenerSql();
  await sql.begin(async (tx) => {
    const [p] = await tx`UPDATE elementos_perifericos
      SET tipo = ${tipo}, texto = ${d.texto}, icono = ${d.icono}
      WHERE id = ${id} RETURNING id`;
    if (!p) throw new Error("El elemento no existe");
    await registrarAuditoria(tx, {
      usuarioId, accion: "editar_periferico", entidad: "elementos_perifericos",
      entidadId: id, detalle: d,
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Macroprocesos (primera capa del mapa)
// ─────────────────────────────────────────────────────────────────────────────

export type FilaMacro = {
  id: number; letra: string; nombre: string; banda: string; color: string;
  icono: string; slug: string; orden: number; activo: boolean;
  numProcesos: number; docsAfectados: string[];
};

export async function listarMacroprocesos(): Promise<FilaMacro[]> {
  const sql = obtenerSql();
  const filas = await sql`
    SELECT m.id, m.letra, m.nombre, m.banda, m.color, m.icono, m.slug, m.orden, m.activo,
      (SELECT count(*)::int FROM procesos p WHERE p.macroproceso_id = m.id) AS num_procesos,
      coalesce((
        SELECT json_agg(DISTINCT d.codigo ORDER BY d.codigo)
        FROM documentos d
        WHERE EXISTS (SELECT 1 FROM documento_versiones v
                      WHERE v.documento_id = d.id AND v.estado = 'vigente')
          AND EXISTS (
            SELECT 1 FROM documento_proceso dp
            LEFT JOIN subprocesos s ON s.id = dp.subproceso_id
            JOIN procesos p ON p.id = coalesce(dp.proceso_id, s.proceso_id)
            WHERE dp.documento_id = d.id AND p.macroproceso_id = m.id
          )
      ), '[]') AS docs_afectados
    FROM macroprocesos m
    ORDER BY array_position(ARRAY['estrategicos','misionales','apoyo','evaluacion'], m.banda), m.orden`;
  return filas.map((f) => ({
    id: f.id, letra: f.letra, nombre: f.nombre, banda: f.banda, color: f.color,
    icono: f.icono, slug: f.slug, orden: f.orden, activo: f.activo,
    numProcesos: f.num_procesos, docsAfectados: f.docs_afectados as string[],
  }));
}

export async function obtenerMacroproceso(id: number) {
  const sql = obtenerSql();
  const [f] = await sql`SELECT id, letra, nombre, banda, color, icono, slug
    FROM macroprocesos WHERE id = ${id}`;
  if (!f) return null;
  return { id: f.id, letra: f.letra, nombre: f.nombre, banda: f.banda,
    color: f.color, icono: f.icono, slug: f.slug };
}

export type DatosMacro = {
  letra: string; nombre: string; banda: string;
  color: string; icono: string; slug: string;
};

function normalizarMacro(d: DatosMacro) {
  const datos = {
    ...d,
    banda: validarBanda(d.banda),
    color: validarColor(d.color),
    slug: validarSlug(d.slug),
    letra: d.letra.trim().toUpperCase(),
  };
  if (!datos.nombre.trim()) throw new Error("El nombre es obligatorio");
  return datos;
}

export async function crearMacroproceso(
  d: DatosMacro,
  usuarioId: number,
): Promise<{ id: number }> {
  const datos = normalizarMacro(d);
  const sql = obtenerSql();
  try {
    return await sql.begin(async (tx) => {
      const orden = await siguienteOrden(tx, "macroprocesos", "banda", datos.banda);
      const [m] = await tx`INSERT INTO macroprocesos (letra, nombre, slug, banda, color, icono, orden)
        VALUES (${datos.letra}, ${datos.nombre}, ${datos.slug}, ${datos.banda},
                ${datos.color}, ${datos.icono}, ${orden}) RETURNING id`;
      await registrarAuditoria(tx, {
        usuarioId, accion: "crear_macroproceso", entidad: "macroprocesos",
        entidadId: m.id, detalle: datos,
      });
      return { id: m.id };
    });
  } catch (err) {
    throw traducirUnico(err, "Ya existe un macroproceso con esa letra o slug");
  }
}

export async function editarMacroproceso(
  id: number,
  d: DatosMacro,
  usuarioId: number,
): Promise<void> {
  const datos = normalizarMacro(d);
  const sql = obtenerSql();
  try {
    await sql.begin(async (tx) => {
      const [m] = await tx`UPDATE macroprocesos SET letra = ${datos.letra},
          nombre = ${datos.nombre}, slug = ${datos.slug}, banda = ${datos.banda},
          color = ${datos.color}, icono = ${datos.icono}
        WHERE id = ${id} RETURNING id`;
      if (!m) throw new Error("El macroproceso no existe");
      await registrarAuditoria(tx, {
        usuarioId, accion: "editar_macroproceso", entidad: "macroprocesos",
        entidadId: id, detalle: datos,
      });
    });
  } catch (err) {
    throw traducirUnico(err, "Ya existe un macroproceso con esa letra o slug");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Procesos (segunda capa del mapa)
// ─────────────────────────────────────────────────────────────────────────────

export type FilaProceso = {
  id: number; nombre: string; sigla: string; icono: string; slug: string;
  orden: number; activo: boolean; numSubprocesos: number; numDocs: number;
  docsAfectados: string[];
};

export async function listarProcesos(macroprocesoId: number): Promise<FilaProceso[]> {
  const sql = obtenerSql();
  const filas = await sql`
    SELECT p.id, p.nombre, p.sigla, p.icono, p.slug, p.orden, p.activo,
      (SELECT count(*)::int FROM subprocesos s WHERE s.proceso_id = p.id) AS num_subprocesos,
      (SELECT count(*)::int FROM documento_proceso dp WHERE dp.proceso_id = p.id) AS num_docs,
      coalesce((
        SELECT json_agg(DISTINCT d.codigo ORDER BY d.codigo)
        FROM documentos d
        WHERE EXISTS (SELECT 1 FROM documento_versiones v
                      WHERE v.documento_id = d.id AND v.estado = 'vigente')
          AND EXISTS (
            SELECT 1 FROM documento_proceso dp
            LEFT JOIN subprocesos s ON s.id = dp.subproceso_id
            WHERE dp.documento_id = d.id AND (dp.proceso_id = p.id OR s.proceso_id = p.id)
          )
      ), '[]') AS docs_afectados
    FROM procesos p WHERE p.macroproceso_id = ${macroprocesoId}
    ORDER BY p.orden`;
  return filas.map((f) => ({
    id: f.id, nombre: f.nombre, sigla: f.sigla, icono: f.icono, slug: f.slug,
    orden: f.orden, activo: f.activo, numSubprocesos: f.num_subprocesos,
    numDocs: f.num_docs, docsAfectados: f.docs_afectados as string[],
  }));
}

export async function obtenerProceso(id: number) {
  const sql = obtenerSql();
  const [f] = await sql`SELECT id, macroproceso_id, nombre, sigla, icono, descripcion, slug
    FROM procesos WHERE id = ${id}`;
  if (!f) return null;
  return { id: f.id, macroprocesoId: f.macroproceso_id, nombre: f.nombre,
    sigla: f.sigla, icono: f.icono, descripcion: f.descripcion, slug: f.slug };
}

export type DatosProceso = {
  macroprocesoId: number; nombre: string; sigla: string;
  icono: string; descripcion: string | null; slug: string;
};

function normalizarProceso(d: DatosProceso) {
  const datos = { ...d, sigla: validarSigla(d.sigla), slug: validarSlug(d.slug) };
  exigirSiglaNoReservada(datos.sigla);
  if (!datos.nombre.trim()) throw new Error("El nombre es obligatorio");
  return datos;
}

export async function crearProceso(
  d: DatosProceso,
  usuarioId: number,
): Promise<{ id: number }> {
  const datos = normalizarProceso(d);
  const sql = obtenerSql();
  try {
    return await sql.begin(async (tx) => {
      await exigirSiglaDeMapaLibre(tx, datos.sigla, {});
      const orden = await siguienteOrden(tx, "procesos", "macroproceso_id", datos.macroprocesoId);
      const [p] = await tx`INSERT INTO procesos
          (macroproceso_id, nombre, sigla, slug, descripcion, icono, orden)
        VALUES (${datos.macroprocesoId}, ${datos.nombre}, ${datos.sigla}, ${datos.slug},
                ${datos.descripcion}, ${datos.icono}, ${orden}) RETURNING id`;
      await registrarAuditoria(tx, {
        usuarioId, accion: "crear_proceso", entidad: "procesos",
        entidadId: p.id, detalle: datos,
      });
      return { id: p.id };
    });
  } catch (err) {
    throw traducirSigla(err, datos.sigla, "Ya existe un proceso con esa sigla o slug");
  }
}

export async function editarProceso(
  id: number,
  d: DatosProceso,
  usuarioId: number,
): Promise<void> {
  const datos = normalizarProceso(d);
  const sql = obtenerSql();
  try {
    await sql.begin(async (tx) => {
      await exigirSiglaDeMapaLibre(tx, datos.sigla, { proceso: id });
      const [p] = await tx`UPDATE procesos SET nombre = ${datos.nombre},
          sigla = ${datos.sigla}, slug = ${datos.slug}, descripcion = ${datos.descripcion},
          icono = ${datos.icono}
        WHERE id = ${id} RETURNING id`;
      if (!p) throw new Error("El proceso no existe");
      await registrarAuditoria(tx, {
        usuarioId, accion: "editar_proceso", entidad: "procesos",
        entidadId: id, detalle: datos,
      });
    });
  } catch (err) {
    throw traducirSigla(err, datos.sigla, "Ya existe un proceso con esa sigla o slug");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Subprocesos (tercera capa del mapa)
// ─────────────────────────────────────────────────────────────────────────────

export type FilaSubproceso = {
  id: number; nombre: string; slug: string; sigla: string | null; orden: number; activo: boolean;
  numDocs: number; docsAfectados: string[];
};

export async function listarSubprocesos(procesoId: number): Promise<FilaSubproceso[]> {
  const sql = obtenerSql();
  const filas = await sql`
    SELECT s.id, s.nombre, s.slug, s.sigla, s.orden, s.activo,
      (SELECT count(*)::int FROM documento_proceso dp WHERE dp.subproceso_id = s.id) AS num_docs,
      coalesce((
        SELECT json_agg(DISTINCT d.codigo ORDER BY d.codigo)
        FROM documentos d
        WHERE EXISTS (SELECT 1 FROM documento_versiones v
                      WHERE v.documento_id = d.id AND v.estado = 'vigente')
          AND EXISTS (SELECT 1 FROM documento_proceso dp
                      WHERE dp.documento_id = d.id AND dp.subproceso_id = s.id)
      ), '[]') AS docs_afectados
    FROM subprocesos s WHERE s.proceso_id = ${procesoId}
    ORDER BY s.orden`;
  return filas.map((f) => ({
    id: f.id, nombre: f.nombre, slug: f.slug, sigla: (f.sigla as string | null) ?? null, orden: f.orden, activo: f.activo,
    numDocs: f.num_docs, docsAfectados: f.docs_afectados as string[],
  }));
}

export async function obtenerSubproceso(id: number) {
  const sql = obtenerSql();
  const [f] = await sql`SELECT id, proceso_id, nombre, slug, sigla FROM subprocesos WHERE id = ${id}`;
  if (!f) return null;
  return { id: f.id, procesoId: f.proceso_id, nombre: f.nombre, slug: f.slug, sigla: (f.sigla as string | null) ?? null };
}

export type DatosSubproceso = { procesoId: number; nombre: string; slug: string; sigla: string | null };

function normalizarSubproceso(d: DatosSubproceso) {
  const datos = { ...d, slug: validarSlug(d.slug), sigla: d.sigla === null ? null : validarSiglaOpcional(d.sigla) };
  if (datos.sigla !== null) exigirSiglaNoReservada(datos.sigla);
  if (!datos.nombre.trim()) throw new Error("El nombre es obligatorio");
  return datos;
}

export async function crearSubproceso(
  d: DatosSubproceso,
  usuarioId: number,
): Promise<{ id: number }> {
  const datos = normalizarSubproceso(d);
  const sql = obtenerSql();
  try {
    return await sql.begin(async (tx) => {
      if (datos.sigla !== null) await exigirSiglaDeMapaLibre(tx, datos.sigla, {});
      const orden = await siguienteOrden(tx, "subprocesos", "proceso_id", datos.procesoId);
      const [s] = await tx`INSERT INTO subprocesos (proceso_id, nombre, slug, sigla, orden)
        VALUES (${datos.procesoId}, ${datos.nombre}, ${datos.slug}, ${datos.sigla}, ${orden}) RETURNING id`;
      await registrarAuditoria(tx, {
        usuarioId, accion: "crear_subproceso", entidad: "subprocesos",
        entidadId: s.id, detalle: datos,
      });
      return { id: s.id };
    });
  } catch (err) {
    throw traducirSigla(err, datos.sigla, "Ya existe un subproceso con ese slug en este proceso");
  }
}

export async function editarSubproceso(
  id: number,
  d: DatosSubproceso,
  usuarioId: number,
): Promise<void> {
  const datos = normalizarSubproceso(d);
  const sql = obtenerSql();
  try {
    await sql.begin(async (tx) => {
      if (datos.sigla !== null) await exigirSiglaDeMapaLibre(tx, datos.sigla, { subproceso: id });
      const [s] = await tx`UPDATE subprocesos SET nombre = ${datos.nombre}, slug = ${datos.slug}, sigla = ${datos.sigla}
        WHERE id = ${id} RETURNING id`;
      if (!s) throw new Error("El subproceso no existe");
      await registrarAuditoria(tx, {
        usuarioId, accion: "editar_subproceso", entidad: "subprocesos",
        entidadId: id, detalle: datos,
      });
    });
  } catch (err) {
    throw traducirSigla(err, datos.sigla, "Ya existe un subproceso con ese slug en este proceso");
  }
}

/**
 * Da la sigla a un subproceso dentro de la transacción de quien llama (la importación de indicadores, 14A §6): las mismas
 * validaciones del alta y la edición, y la auditoría de `editar_subproceso` con la sigla en el detalle.
 */
export async function asignarSiglaASubproceso(
  tx: TransactionSql,
  subprocesoId: number,
  sigla: string,
  usuarioId: number,
): Promise<void> {
  const valida = validarSigla(sigla);
  exigirSiglaNoReservada(valida);
  await exigirSiglaDeMapaLibre(tx, valida, { subproceso: subprocesoId });
  let s;
  try {
    [s] = await tx`UPDATE subprocesos SET sigla = ${valida} WHERE id = ${subprocesoId} RETURNING id`;
  } catch (err) {
    // Otra transacción pudo dar la misma sigla entre la comprobación y el UPDATE: el índice único la frena.
    throw traducirSigla(err, valida, "No se pudo asignar la sigla");
  }
  if (!s) throw new Error("El subproceso no existe");
  await registrarAuditoria(tx, {
    usuarioId, accion: "editar_subproceso", entidad: "subprocesos",
    entidadId: subprocesoId, detalle: { sigla: valida },
  });
}
