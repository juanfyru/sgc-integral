import { type NextRequest, NextResponse } from "next/server";
import { obtenerArchivoVigente } from "@/db/consultas/documentos";
import { registrarEventoConsulta } from "@/db/consultas/eventos";
import { ipDePeticion } from "@/lib/ip";
import { crearLimitador } from "@/lib/limite";
import { sesionDePeticion } from "@/lib/sesion-actual";
import {
  respuesta404,
  respuestaArchivo,
  respuestaArchivoEstampado,
} from "@/lib/servir-archivo";

export const dynamic = "force-dynamic";

// Rate limiting en memoria (Fase 5): 60 archivos/minuto por usuario es holgado
// para consulta humana y frena la descarga masiva automatizada.
const permitirArchivo = crearLimitador({ limite: 60, ventanaMs: 60_000 });

/**
 * Sirve un archivo de la versión VIGENTE de un documento que el usuario puede
 * ver, desde fuera del webroot (reglas 3 y 7). Sin `?descarga=1` responde inline (vista previa);
 * con él, como adjunto y registra el evento de descarga (D8). La vista de la
 * ficha ya registra el evento 'vista' — el servido inline no lo duplica.
 *
 * El último segmento opcional `[[...nombre]]` es cosmético: lleva el nombre
 * real del archivo (con su extensión) al final de la URL. El archivo se
 * resuelve SIEMPRE por `archivoId`; el nombre solo hace que el visor de PDF
 * embebido del navegador (y las extensiones/gestores de descarga) deriven un
 * nombre correcto con extensión en vez de un GUID sin extensión.
 */
export async function GET(
  peticion: NextRequest,
  { params }: { params: Promise<{ codigo: string; archivoId: string; nombre?: string[] }> },
) {
  const sesion = await sesionDePeticion(peticion);
  if (!sesion) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const { codigo, archivoId } = await params;

  if (!permitirArchivo(String(sesion.usuarioId))) {
    return NextResponse.json(
      { error: "Demasiadas peticiones, intente de nuevo en un momento" },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const id = Number(archivoId);
  if (!Number.isInteger(id) || id <= 0) return respuesta404();

  const archivo = await obtenerArchivoVigente(codigo, id, sesion);
  if (!archivo) return respuesta404();

  const esDescarga = peticion.nextUrl.searchParams.get("descarga") === "1";
  if (esDescarga) {
    await registrarEventoConsulta({
      tipo: "descarga",
      documentoId: archivo.documentoId,
      versionId: archivo.versionId,
      usuarioId: sesion.usuarioId,
      ip: ipDePeticion(peticion.headers),
      userAgent: peticion.headers.get("user-agent"),
    }).catch((err) => console.error("No se pudo registrar la descarga:", err));
  }

  // ISO 7.5.3: la copia que sale del sistema deja de estar controlada. TODO
  // PDF que salga por la ruta pública va estampado — también la vista previa
  // inline, porque el visor del navegador permite descargar e imprimir. El
  // admin sirve el original por su propia ruta, y los formatos no-PDF bajan
  // tal cual (existen para diligenciarse).
  if (archivo.mime === "application/pdf") {
    return respuestaArchivoEstampado(archivo, esDescarga, sesion.nombre);
  }
  return respuestaArchivo(archivo, esDescarga);
}
