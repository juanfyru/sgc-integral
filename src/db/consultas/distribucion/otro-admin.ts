import type { Cliente } from "@/db/cliente";
import { adminsActivos } from "@/db/consultas/tramites";
import { ErrorDistribucion } from "@/lib/distribucion/tipos";

/** Si hay otro Administrador del SGC activo además de `usuarioId`. */
export async function hayOtroAdmin(sql: Cliente, usuarioId: number): Promise<boolean> {
  return (await adminsActivos({ sql })).some((id) => id !== usuarioId);
}

/**
 * Lo que una persona hace sobre algo suyo (verificar el punto del que responde, cerrar la corrección que ella misma
 * hizo) solo vale si no hay otro Administrador del SGC activo que pueda hacerlo (spec 13B §6.3, 13C §12.5).
 */
export async function exigirSinOtroAdmin(sql: Cliente, usuarioId: number, mensaje: string): Promise<void> {
  if (await hayOtroAdmin(sql, usuarioId)) throw new ErrorDistribucion(mensaje);
}
