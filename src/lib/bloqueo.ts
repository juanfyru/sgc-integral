export const INTENTOS_PARA_BLOQUEO = 5;
export const BLOQUEO_BASE_MS = 15 * 60_000;
export const BLOQUEO_MAXIMO_MS = 24 * 60 * 60_000;

export type EstadoBloqueo = {
  intentosFallidos: number;
  bloqueosConsecutivos: number;
  bloqueadoHasta: Date | null;
};

/** Estado tras un ingreso correcto o un desbloqueo manual. */
export const SIN_BLOQUEO: EstadoBloqueo = {
  intentosFallidos: 0,
  bloqueosConsecutivos: 0,
  bloqueadoHasta: null,
};

/** Al llegar al quinto fallo bloquea 15 min, y cada bloqueo consecutivo duplica hasta 24 h. */
export function registrarIntentoFallido(estado: EstadoBloqueo, ahora: Date): EstadoBloqueo {
  const intentos = estado.intentosFallidos + 1;
  if (intentos < INTENTOS_PARA_BLOQUEO) {
    return { ...estado, intentosFallidos: intentos };
  }
  const duracion = Math.min(
    BLOQUEO_BASE_MS * 2 ** Math.min(estado.bloqueosConsecutivos, 30),
    BLOQUEO_MAXIMO_MS,
  );
  return {
    intentosFallidos: 0,
    bloqueosConsecutivos: estado.bloqueosConsecutivos + 1,
    bloqueadoHasta: new Date(ahora.getTime() + duracion),
  };
}

export function estaBloqueado(estado: EstadoBloqueo, ahora: Date): boolean {
  return estado.bloqueadoHasta !== null && estado.bloqueadoHasta.getTime() > ahora.getTime();
}

/**
 * Estado tras una clave errónea. Con la cuenta ya bloqueada no cambia nada:
 * los intentos durante el bloqueo no se acumulan ni lo prolongan (solo cuentan
 * los hechos con la cuenta libre).
 */
export function estadoTrasFallo(estado: EstadoBloqueo, ahora: Date): EstadoBloqueo {
  return estaBloqueado(estado, ahora) ? estado : registrarIntentoFallido(estado, ahora);
}
