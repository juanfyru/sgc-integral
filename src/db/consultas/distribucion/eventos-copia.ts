import type { Cliente } from "@/db/cliente";
import type { TipoEventoCopia } from "@/lib/distribucion/tipos";

/** Una sola puerta para escribir en `copia_eventos`; `creado_en` es la hora de la operación. */
export async function evento(
  sql: Cliente,
  copiaId: number,
  tipo: TipoEventoCopia,
  usuarioId: number | null,
  detalle: Record<string, unknown>,
  ahora: Date,
): Promise<void> {
  await sql`INSERT INTO copia_eventos (copia_id, tipo, usuario_id, detalle, creado_en)
    VALUES (${copiaId}, ${tipo}, ${usuarioId}, ${sql.json(detalle as never)}, ${ahora})`;
}
