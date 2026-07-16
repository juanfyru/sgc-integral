import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { type NextRequest, NextResponse } from "next/server";
import { obtenerArchivoVigente } from "@/db/consultas/documentos";
import { ipDePeticion, registrarEventoConsulta } from "@/db/consultas/eventos";
import { resolverRutaAlmacen } from "@/lib/almacen";
import { crearLimitador } from "@/lib/limite";

export const dynamic = "force-dynamic";

// Rate limiting en memoria (Fase 5): 60 archivos/minuto por IP es holgado
// para consulta humana y frena la descarga masiva automatizada.
const permitirArchivo = crearLimitador({ limite: 60, ventanaMs: 60_000 });

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
 * Sirve un archivo de la versión VIGENTE de un documento, desde fuera del
 * webroot (reglas 3 y 7). Sin `?descarga=1` responde inline (vista previa);
 * con él, como adjunto y registra el evento de descarga (D8). La vista de la
 * ficha ya registra el evento 'vista' — el servido inline no lo duplica.
 */
export async function GET(
  peticion: NextRequest,
  { params }: { params: Promise<{ codigo: string; archivoId: string }> },
) {
  const { codigo, archivoId } = await params;

  if (!permitirArchivo(ipDePeticion(peticion.headers))) {
    return NextResponse.json(
      { error: "Demasiadas peticiones, intente de nuevo en un momento" },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const id = Number(archivoId);
  if (!Number.isInteger(id) || id <= 0) return respuesta404();

  const archivo = await obtenerArchivoVigente(codigo, id);
  if (!archivo) return respuesta404();

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

  const esDescarga = peticion.nextUrl.searchParams.get("descarga") === "1";
  if (esDescarga) {
    await registrarEventoConsulta({
      tipo: "descarga",
      documentoId: archivo.documentoId,
      versionId: archivo.versionId,
      ip: ipDePeticion(peticion.headers),
      userAgent: peticion.headers.get("user-agent"),
    }).catch((err) => console.error("No se pudo registrar la descarga:", err));
  }

  const flujo = Readable.toWeb(
    createReadStream(rutaAbsoluta),
  ) as ReadableStream;

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

function respuesta404() {
  return NextResponse.json({ error: "Archivo no encontrado" }, { status: 404 });
}
