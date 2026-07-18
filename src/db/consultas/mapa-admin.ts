import type { Sql, TransactionSql } from "postgres";
import { obtenerSql } from "@/db/cliente";
import { registrarAuditoria } from "@/db/consultas/admin";
import { validarPatronCodigo } from "@/lib/validaciones-mapa";

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

export type FilaTipo = {
  id: number; nombre: string; sigla: string;
  esDiligenciable: boolean; orden: number; activo: boolean; numDocs: number;
};

export async function listarTipos(): Promise<FilaTipo[]> {
  const sql = obtenerSql();
  const filas = await sql`
    SELECT t.id, t.nombre, t.sigla, t.es_diligenciable, t.orden, t.activo,
      (SELECT count(*)::int FROM documentos d WHERE d.tipo_id = t.id) AS num_docs
    FROM tipos_documento t ORDER BY t.orden`;
  return filas.map((f) => ({
    id: f.id, nombre: f.nombre, sigla: f.sigla,
    esDiligenciable: f.es_diligenciable, orden: f.orden,
    activo: f.activo, numDocs: f.num_docs,
  }));
}

export async function obtenerTipo(id: number) {
  const sql = obtenerSql();
  const [f] = await sql`SELECT id, nombre, sigla, es_diligenciable
    FROM tipos_documento WHERE id = ${id}`;
  if (!f) return null;
  return { id: f.id, nombre: f.nombre, sigla: f.sigla, esDiligenciable: f.es_diligenciable };
}

export type DatosTipo = { nombre: string; sigla: string; esDiligenciable: boolean };

export async function crearTipo(
  d: DatosTipo,
  usuarioId: number,
): Promise<{ id: number }> {
  const sql = obtenerSql();
  try {
    return await sql.begin(async (tx) => {
      const orden = await siguienteOrden(tx, "tipos_documento", null, null);
      const [t] = await tx`INSERT INTO tipos_documento (nombre, sigla, es_diligenciable, orden)
        VALUES (${d.nombre}, ${d.sigla}, ${d.esDiligenciable}, ${orden}) RETURNING id`;
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
  const sql = obtenerSql();
  try {
    await sql.begin(async (tx) => {
      const [t] = await tx`UPDATE tipos_documento SET nombre = ${d.nombre},
          sigla = ${d.sigla}, es_diligenciable = ${d.esDiligenciable}
        WHERE id = ${id} RETURNING id`;
      if (!t) throw new Error("El tipo no existe");
      await registrarAuditoria(tx, {
        usuarioId, accion: "editar_tipo_documento", entidad: "tipos_documento",
        entidadId: id, detalle: d,
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
  { clave: "nombre_entidad", etiqueta: "Nombre de la entidad" },
  { clave: "subtitulo_mapa", etiqueta: "Subtítulo del mapa" },
  { clave: "lema", etiqueta: "Lema institucional", textarea: true },
  { clave: "titulo_phva", etiqueta: "Título del ciclo PHVA" },
  { clave: "texto_phva", etiqueta: "Texto del ciclo PHVA", textarea: true },
  { clave: "patron_codigo", etiqueta: "Patrón del código (expresión regular)" },
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
  if ("patron_codigo" in valores) {
    validarPatronCodigo(valores.patron_codigo);
  }
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
