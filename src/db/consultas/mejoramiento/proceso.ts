/**
 * Lo que «le toca al líder» de un hallazgo (spec 15 §6.1, F15-DC3): un líder activo de su proceso o, si el proceso no tiene
 * ninguno, el Admin SGC. Módulo liviano: solo lee `tramites.ts`. Lo importa `archivos.ts`, que importa `admin.ts`, y `admin.ts`
 * lo importa `estructura.ts`: si llegara a `avisos-vencimiento.ts`, que importa `estructura.ts`, cerraría un ciclo
 * (`tests/mejora-ciclos.test.ts`). `avisos.ts` lo reexporta.
 */
import type { Cliente } from "@/db/cliente";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { adminsActivos, lideresDeProceso } from "@/db/consultas/tramites";

/**
 * La condición de persona de todo lo que «le toca al líder» (spec §6.1, F15-DC3): ser un líder activo de ese proceso o,
 * si el proceso no tiene ninguno, ser Admin SGC.
 */
export async function actuaPorElProceso(tx: Cliente, sesion: Pick<SesionFlujo, "usuarioId" | "rol">, procesoId: number): Promise<boolean> {
  const lideres = await lideresDeProceso(procesoId, { sql: tx });
  if (sesion.rol === "lider_proceso") return lideres.includes(sesion.usuarioId);
  return sesion.rol === "admin_sgc" && lideres.length === 0;
}

/** Los líderes activos del proceso o, si no tiene ninguno, los Admin SGC activos. */
export async function lideresOAdmins(tx: Cliente, procesoId: number): Promise<number[]> {
  const lideres = await lideresDeProceso(procesoId, { sql: tx });
  return lideres.length > 0 ? lideres : adminsActivos({ sql: tx });
}
