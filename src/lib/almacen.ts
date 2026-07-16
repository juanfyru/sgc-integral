import path from "node:path";

/**
 * Carpeta del almacén de archivos, FUERA del webroot (regla de negocio 7).
 * En desarrollo es ./almacen (gitignored); en el NAS será el bind mount de la
 * carpeta compartida, configurado con ALMACEN_RUTA en el compose.
 */
export function rutaBaseAlmacen(): string {
  return path.resolve(process.env.ALMACEN_RUTA ?? "./almacen");
}

// Cada segmento: solo letras, dígitos, punto, guion y guion bajo. Esto excluye
// de raíz separadores alternativos, unidades de Windows, %XX y control chars.
const SEGMENTO_VALIDO = /^[A-Za-z0-9._-]+$/;

/**
 * Resuelve una ruta relativa del almacén (como se guarda en BD) a una ruta
 * absoluta verificada dentro de la carpeta base. Devuelve null ante cualquier
 * intento de escape: la ruta viene de la BD, pero se valida igual — defensa
 * en profundidad contra path traversal.
 */
export function resolverRutaAlmacen(rutaRelativa: string): string | null {
  if (!rutaRelativa) return null;

  const segmentos = rutaRelativa.split("/");
  for (const segmento of segmentos) {
    if (!SEGMENTO_VALIDO.test(segmento)) return null;
    if (segmento === "." || segmento === ".." || /^\.+$/.test(segmento)) {
      return null;
    }
  }

  const base = rutaBaseAlmacen();
  const resuelta = path.resolve(base, segmentos.join(path.sep));
  if (!resuelta.startsWith(base + path.sep)) return null;

  return resuelta;
}
