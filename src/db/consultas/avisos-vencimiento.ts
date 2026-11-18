/**
 * Lo que comparten la revisión de vencimientos de los trámites (`vencimientos.ts`) y la de la distribución
 * (`distribucion/vencimientos.ts`): la inserción de avisos y los jefes a quienes se escala. Vive aparte para que
 * ninguno de los dos módulos importe al otro.
 */
import type { TransactionSql } from "postgres";
import { supervisoresDe } from "@/db/consultas/estructura";

// La inserción vive en `avisar.ts`, liviano (no llega a `estructura.ts`); aquí se reexporta.
export { avisarA, type Destinatario } from "./avisar";

/** Cada jefe, sin repetir, con los subalternos suyos que tienen el paso. */
export async function jefesDe(tx: TransactionSql, responsables: number[]): Promise<Map<number, string[]>> {
  const filas = await tx`SELECT id, nombre FROM usuarios WHERE id = ANY(${responsables}) ORDER BY nombre, id`;
  const jefes = new Map<number, string[]>();
  for (const { id, nombre } of filas) {
    for (const jefe of await supervisoresDe(Number(id), { sql: tx })) {
      jefes.set(jefe.id, [...(jefes.get(jefe.id) ?? []), nombre]);
    }
  }
  return jefes;
}
