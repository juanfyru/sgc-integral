/**
 * IP del cliente. Solo se confía en las cabeceras de reenvío si la app corre
 * detrás del proxy de QTS (CONFIAR_PROXY=1): sin proxy cualquiera las falsifica.
 * Con confianza se toma el ÚLTIMO elemento de X-Forwarded-For, el que añadió
 * el proxy; los anteriores los controla el cliente.
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
  if (elementos.length > 0) return elementos[elementos.length - 1];
  return headers.get("x-real-ip")?.trim() || null;
}
