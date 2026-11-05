import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { resolverRutaAlmacen } from "@/lib/almacen";
import { estamparCopiaNoControlada } from "@/lib/marca-agua";
import { zonaHoraria } from "@/lib/zona-horaria";

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
 * panel; cada una autoriza antes de llamarla.
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

/**
 * Salida pública de un PDF con la marca "COPIA NO CONTROLADA", el nombre de
 * quien lo pide y la fecha en la zona de la instalación, estampados al vuelo —
 * tanto la descarga como la vista previa inline: el visor del navegador
 * permite descargar e imprimir, así que una vista limpia sería un hueco. Si el
 * estampado falla (PDF cifrado o corrupto), sirve el original:
 * la marca es una salvaguarda, nunca un motivo para dejar inaccesible un
 * documento vigente — el error queda en el log para corregir el archivo.
 * A diferencia de respuestaArchivo, aquí no hay streaming: estampar exige el
 * PDF completo en memoria (el tope de subida ya lo acota a 25 MB).
 */
export async function respuestaArchivoEstampado(
  archivo: ArchivoServible,
  esDescarga: boolean,
  nombre: string,
  fecha: Date = new Date(),
): Promise<NextResponse> {
  const rutaAbsoluta = resolverRutaAlmacen(archivo.ruta);
  if (!rutaAbsoluta) {
    console.error(`Ruta de almacén inválida en BD: ${archivo.ruta}`);
    return respuesta404();
  }

  let original: Buffer;
  try {
    original = await readFile(rutaAbsoluta);
  } catch {
    console.error(`Archivo faltante en el almacén: ${archivo.ruta}`);
    return respuesta404();
  }

  let cuerpo: Uint8Array = original;
  try {
    cuerpo = await estamparCopiaNoControlada(original, { fecha, nombre, zona: zonaHoraria() });
  } catch (err) {
    console.error(
      `No se pudo estampar ${archivo.ruta}; se sirve el original:`,
      err,
    );
  }

  return new NextResponse(new Uint8Array(cuerpo), {
    headers: {
      "Content-Type": archivo.mime,
      "Content-Length": String(cuerpo.byteLength),
      "Content-Disposition": contentDisposition(
        esDescarga ? "attachment" : "inline",
        archivo.nombreOriginal,
      ),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
    },
  });
}
