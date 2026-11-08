import type { Cliente } from "@/db/cliente";
import { ErrorTramite } from "@/db/consultas/flujo/contrato";

/**
 * La foto de un ítem solo cambia mientras su verificación está abierta: se bloquea (`FOR SHARE`, contra el
 * `FOR UPDATE` del cierre) y se comprueba dentro de la transacción de quien sube o borra; cerrada, 409 y nada
 * cambia. Si el ítem no existe no decide: la ruta ya respondió 404 (`autorizarFotoDeItem`).
 */
export async function exigirVerificacionAbierta(tx: Cliente, itemId: number): Promise<void> {
  const [v] = await tx`SELECT v.estado FROM verificaciones v JOIN verificacion_items i ON i.verificacion_id = v.id
    WHERE i.id = ${itemId} FOR SHARE OF v`;
  if (v && v.estado !== "abierta") throw new ErrorTramite("La verificación ya está cerrada");
}
