import { cache } from "react";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { pendienteDeCuenta } from "@/lib/cuenta-estado";
import { COOKIE_SESION } from "@/lib/sesion-constantes";
import { validarSesion, type SesionValida } from "@/lib/sesion";

export type OpcionesRequerir = { permitirPendientes?: boolean };

// Regla única de "sesión aceptable": segundo factor pendiente nunca pasa;
// cambio de clave, aviso de datos o TOTP obligatorio pendientes pasan solo si se permiten.
// Devuelve el mensaje de rechazo o null si es aceptable.
function motivoRechazo(
  sesion: SesionValida,
  opciones?: OpcionesRequerir,
): string | null {
  const pendiente = pendienteDeCuenta(sesion);
  if (pendiente === "factor") return "No autorizado";
  if (pendiente && !opciones?.permitirPendientes) return "Cuenta pendiente de completar";
  return null;
}

/** Sesión de la petición en curso (una consulta por render). Fuera de un request, cookies() lanza. */
export const sesionActual = cache(async (): Promise<SesionValida | null> => {
  const almacen = await cookies();
  return validarSesion(almacen.get(COOKIE_SESION)?.value);
});

/**
 * Validación REAL de la sesión (capa dos del guard). Lanza si no hay sesión:
 * toda Server Action y todo route handler del admin la llaman en su primera
 * línea — regla ISO 4: ninguna escritura sin sesión.
 */
export async function requerirSesion(
  opciones?: OpcionesRequerir,
): Promise<SesionValida> {
  const sesion = await sesionActual();
  if (!sesion) throw new Error("No autorizado");
  const motivo = motivoRechazo(sesion, opciones);
  if (motivo) throw new Error(motivo);
  return sesion;
}

/** Igual que requerirSesion pero con la cookie de un NextRequest y null en vez de lanzar. */
export async function sesionDePeticion(
  peticion: NextRequest,
  opciones?: OpcionesRequerir,
): Promise<SesionValida | null> {
  const sesion = await validarSesion(peticion.cookies.get(COOKIE_SESION)?.value);
  if (!sesion || motivoRechazo(sesion, opciones)) return null;
  return sesion;
}
