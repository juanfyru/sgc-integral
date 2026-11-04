import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { pendienteDeCuenta, rutaDePendiente } from "@/lib/cuenta-estado";
import { rutaInterna } from "@/lib/rutas";
import { CABECERA_RUTA } from "@/lib/sesion-constantes";
import { puede, type Permiso } from "@/lib/permisos";
import type { SesionValida } from "@/lib/sesion";
import { sesionActual } from "@/lib/sesion-actual";

/**
 * Capa dos del guard para páginas y layouts. Sin sesión → /ingreso; con
 * algún paso de cuenta pendiente → ese paso. Cuando la cookie existe pero la
 * sesión ya no vale, redirige SIN `volver` (un layout no conoce la ruta
 * pedida); el proxy sí lo añade cuando no hay cookie.
 */
export async function exigirSesion(): Promise<SesionValida> {
  const sesion = await sesionActual();
  if (!sesion) redirect("/ingreso");
  const pendiente = pendienteDeCuenta(sesion);
  if (pendiente) {
    const ruta = rutaDePendiente(pendiente);
    // El aviso de datos devuelve a la ruta que el usuario pedía.
    const pedida = rutaInterna((await headers()).get(CABECERA_RUTA));
    redirect(pendiente === "aviso" && pedida !== "/" ? `${ruta}?volver=${encodeURIComponent(pedida)}` : ruta);
  }
  return sesion;
}

export async function exigirPermiso(permiso: Permiso): Promise<SesionValida> {
  const sesion = await exigirSesion();
  if (!puede(sesion, permiso)) redirect("/sin-acceso");
  return sesion;
}
