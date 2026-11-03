/** Solo rutas internas relativas: evita open redirect si el campo se manipula. */
export function rutaInterna(v: unknown, porDefecto = "/"): string {
  const ruta = typeof v === "string" ? v : "";
  return ruta.startsWith("/") && !ruta.startsWith("//") && !ruta.includes("\\")
    ? ruta
    : porDefecto;
}
