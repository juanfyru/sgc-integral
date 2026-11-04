import { isIP } from "node:net";

/**
 * IP del cliente. Solo se confía en las cabeceras de reenvío si la app corre
 * detrás del proxy de QTS (CONFIAR_PROXY=1): sin proxy cualquiera las falsifica.
 * Con confianza se toma el ÚLTIMO elemento de X-Forwarded-For, el que añadió
 * el proxy; los anteriores los controla el cliente. Un valor que no sea una IP
 * válida (p. ej. "1.2.3.4:5678") da null: iría a columnas inet y las rompería.
 */
export function ipDePeticion(
  headers: Headers,
  confiarProxy: boolean = process.env.CONFIAR_PROXY === "1",
): string | null {
  if (!confiarProxy) return null;
  const elementos = (headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
  const elegido =
    elementos.length > 0
      ? elementos[elementos.length - 1]
      : headers.get("x-real-ip")?.trim();
  return elegido && isIP(elegido) !== 0 ? elegido : null;
}
