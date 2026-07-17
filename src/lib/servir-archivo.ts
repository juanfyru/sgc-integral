import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { resolverRutaAlmacen } from "@/lib/almacen";

export type ArchivoServible = {
  ruta: string;
  mime: string;
  nombreOriginal: string;
};

// Content-Disposition con nombre ASCII de respaldo + filename* UTF-8
// (RFC 6266/5987) para títulos con acentos.
function contentDisposition(tipo: "inline" | "attachment", nombre: string) {
  const ascii = nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\x20-\x7e]/g, "_")
    .replace(/["\\]/g, "_");
  return `${tipo}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nombre)}`;
}

/**
 * Respuesta de streaming para un archivo del almacén (reglas 3, 6 y 7):
 * MIME de BD, disposición correcta, no-store, y 404 ante ruta inválida o
 * archivo faltante. Compartida por la ruta pública (solo vigentes) y la del
 * admin (cualquier estado).
 */
export async function respuestaArchivo(
  archivo: ArchivoServible,
  esDescarga: boolean,
): Promise<NextResponse> {
  const rutaAbsoluta = resolverRutaAlmacen(archivo.ruta);
  if (!rutaAbsoluta) {
    console.error(`Ruta de almacén inválida en BD: ${archivo.ruta}`);
    return respuesta404();
  }
  let tamano: number;
  try {
    tamano = (await stat(rutaAbsoluta)).size;
  } catch {
    console.error(`Archivo faltante en el almacén: ${archivo.ruta}`);
    return respuesta404();
  }
  const flujo = Readable.toWeb(createReadStream(rutaAbsoluta)) as ReadableStream;
  return new NextResponse(flujo, {
    headers: {
      // El MIME servido es el detectado por magic bytes y guardado en BD
      // (regla 6), nunca el de la extensión.
      "Content-Type": archivo.mime,
      "Content-Length": String(tamano),
      "Content-Disposition": contentDisposition(
        esDescarga ? "attachment" : "inline",
        archivo.nombreOriginal,
      ),
      "X-Content-Type-Options": "nosniff",
      // Un documento puede pasar a obsoleto en cualquier momento: nada de
      // servir copias cacheadas de algo que dejó de estar vigente.
      "Cache-Control": "no-store",
    },
  });
}

export function respuesta404() {
  return NextResponse.json({ error: "Archivo no encontrado" }, { status: 404 });
}
