import { type Rol, rolesConTotpObligatorio } from "./roles";

export type Pendiente = "factor" | "clave" | "aviso" | "totp_obligatorio";

export type EstadoCuenta = {
  rol: Rol;
  factorPendiente: boolean;
  debeCambiarClave: boolean;
  aceptoDatos: boolean;
  totpActivo: boolean;
};

/** Primer paso pendiente de la cuenta, en orden: factor > clave > aviso > TOTP obligatorio. */
export function pendienteDeCuenta(
  cuenta: EstadoCuenta,
  rolesObligatorios: readonly Rol[] = rolesConTotpObligatorio(),
): Pendiente | null {
  if (cuenta.factorPendiente) return "factor";
  if (cuenta.debeCambiarClave) return "clave";
  if (!cuenta.aceptoDatos) return "aviso";
  if (rolesObligatorios.includes(cuenta.rol) && !cuenta.totpActivo) return "totp_obligatorio";
  return null;
}

const RUTAS: Record<Pendiente, string> = {
  factor: "/ingreso/verificar",
  clave: "/cuenta/clave-inicial",
  aviso: "/aviso-datos",
  totp_obligatorio: "/cuenta/segundo-factor?obligatorio=1",
};

export function rutaDePendiente(p: Pendiente): string {
  return RUTAS[p];
}

/** Un rol que exige segundo factor no puede quitárselo (se reabriría el paso pendiente). */
export function puedeDesactivarTotp(
  rol: Rol,
  rolesObligatorios: readonly Rol[] = rolesConTotpObligatorio(),
): boolean {
  return !rolesObligatorios.includes(rol);
}

/** Inscribir el segundo factor solo es válido si no quedan antes la clave inicial ni el aviso. */
export function inscripcionBloqueada(pendiente: Pendiente | null): boolean {
  return pendiente === "clave" || pendiente === "aviso";
}
