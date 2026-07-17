import { cookies } from "next/headers";
import { COOKIE_SESION } from "@/lib/sesion-constantes";
import { validarSesion, type SesionValida } from "@/lib/sesion";

/**
 * Validación REAL de la sesión (capa dos del guard). Lanza si no hay sesión:
 * toda Server Action y todo route handler del admin la llaman en su primera
 * línea — regla ISO 4: ninguna escritura sin sesión.
 */
export async function requerirSesion(): Promise<SesionValida> {
  const almacen = await cookies();
  const sesion = await validarSesion(almacen.get(COOKIE_SESION)?.value);
  if (!sesion) throw new Error("No autorizado");
  return sesion;
}
