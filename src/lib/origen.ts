/**
 * CSRF de los handlers (las server actions lo traen integrado): el Origin, si
 * viene, debe coincidir con el host servido.
 */
export function origenValido(headers: Headers): boolean {
  const origen = headers.get("origin");
  if (!origen) return true; // sin Origin no hay vector CSRF de navegador
  const host = headers.get("x-forwarded-host") ?? headers.get("host");
  try {
    return new URL(origen).host === host;
  } catch {
    return false;
  }
}
