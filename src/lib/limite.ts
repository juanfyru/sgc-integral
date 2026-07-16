/**
 * Rate limiting en memoria (Fase 5). La app corre como instancia única en el
 * NAS (sin Redis, restricción de RAM), así que una ventana deslizante por
 * clave en un Map basta. El reloj se inyecta como parámetro para poder probar
 * la ventana sin timers falsos.
 */

export type OpcionesLimitador = {
  limite: number;
  ventanaMs: number;
};

export type Limitador = (clave: string | null, ahora?: number) => boolean;

// Techo de claves vivas: ~20 usuarios concurrentes reales; si un escáner
// inventa miles de IPs, se poda lo vencido antes de crecer sin límite.
const MAXIMO_CLAVES = 1000;

export function crearLimitador({
  limite,
  ventanaMs,
}: OpcionesLimitador): Limitador {
  const ventanas = new Map<string, number[]>();

  return function permitir(clave, ahora = Date.now()) {
    const k = clave ?? "desconocida";

    if (ventanas.size > MAXIMO_CLAVES) {
      for (const [otra, marcas] of ventanas) {
        if (marcas.every((t) => ahora - t >= ventanaMs)) ventanas.delete(otra);
      }
    }

    const vivas = (ventanas.get(k) ?? []).filter((t) => ahora - t < ventanaMs);
    if (vivas.length >= limite) {
      ventanas.set(k, vivas);
      return false;
    }
    vivas.push(ahora);
    ventanas.set(k, vivas);
    return true;
  };
}
