/** Ayudantes de los tests de la distribución: todo corre dentro de una transacción que se revierte. */
import type { TransactionSql } from "postgres";
import type { SesionFlujo } from "@/db/consultas/tramites-flujo";

let consecutivo = 0;

/** Un punto de uso activo; `procesos` son siglas. El nombre no se repite entre corridas. */
export async function puntoDePrueba(
  tx: TransactionSql,
  d: { responsable: SesionFlujo; procesos?: string[]; nombre?: string; sede?: string },
): Promise<{ id: number; nombre: string }> {
  consecutivo += 1;
  const nombre = d.nombre ?? `zz_punto_${Date.now()}_${consecutivo}`;
  const [p] = await tx`INSERT INTO puntos_uso (nombre, sede, responsable_id)
    VALUES (${nombre}, ${d.sede ?? null}, ${d.responsable.usuarioId}) RETURNING id`;
  for (const sigla of d.procesos ?? []) {
    await tx`INSERT INTO punto_uso_procesos (punto_uso_id, proceso_id)
      SELECT ${p.id}, id FROM procesos WHERE sigla = ${sigla}`;
  }
  return { id: Number(p.id), nombre };
}
