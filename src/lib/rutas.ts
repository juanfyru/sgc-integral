/** Solo rutas internas relativas: evita open redirect si el campo se manipula. */
export function rutaInterna(v: unknown, porDefecto = "/"): string {
  const ruta = typeof v === "string" ? v : "";
  return ruta.startsWith("/") && !ruta.startsWith("//") && !ruta.includes("\\") && !/[\u0000-\u001F\u007F]/.test(ruta)
    ? ruta
    : porDefecto;
}

/** Mensaje elegido por un parámetro de la URL: solo claves propias (`?motivo=__proto__` no rompe la página). */
export function mensajeDeParametro(mapa: Readonly<Record<string, string>>, clave: unknown): string | undefined {
  return typeof clave === "string" && Object.hasOwn(mapa, clave) ? mapa[clave] : undefined;
}
