import { type NextRequest, NextResponse } from "next/server";
import { obtenerArchivoVigente } from "@/db/consultas/documentos";
import { ipDePeticion, registrarEventoConsulta } from "@/db/consultas/eventos";
import { crearLimitador } from "@/lib/limite";
import { respuesta404, respuestaArchivo } from "@/lib/servir-archivo";

export const dynamic = "force-dynamic";

// Rate limiting en memoria (Fase 5): 60 archivos/minuto por IP es holgado
// para consulta humana y frena la descarga masiva automatizada.
const permitirArchivo = crearLimitador({ limite: 60, ventanaMs: 60_000 });

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

  return respuestaArchivo(archivo, esDescarga);
}
