import type { Sql, TransactionSql } from "postgres";
import { obtenerSql } from "@/db/cliente";
import { registrarAuditoria } from "@/db/consultas/admin";

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
