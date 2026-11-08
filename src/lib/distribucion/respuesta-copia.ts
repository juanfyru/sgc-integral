import { NextResponse } from "next/server";
import type { ResultadoPdf } from "@/db/consultas/distribucion/copias";
import { respuesta404 } from "@/lib/servir-archivo";

export const MENSAJE_NO_DISPONIBLE =
  "Esta copia ya no se puede imprimir: su versión dejó de estar vigente o el archivo cambió.";

export const MENSAJE_VENTANA = "La ventana de impresión terminó. Use «Reimprimir» para volver a imprimir esta copia.";

/**
 * Lo que la página de la copia dice cuando el PDF no se pudo abrir o la reimpresión no se hizo. La ruta redirige
 * con la clave (nunca con el texto) y la página la traduce: el aviso se lee en la página, no en un JSON.
 */
export const AVISOS_COPIA = {
  no_disponible: MENSAJE_NO_DISPONIBLE,
  motivo: "Elija el motivo de la reimpresión.",
  texto: "Escriba el motivo de la reimpresión.",
  estado: "La copia ya no está en ese estado: no se puede reimprimir.",
  version: "La versión de esta copia ya no está vigente: no se puede reimprimir.",
} as const;

export type AvisoCopia = keyof typeof AVISOS_COPIA;

/** La clave del aviso para el mensaje de un `ErrorDistribucion` de `reimprimirCopia`. */
export function avisoDeReimpresion(mensaje: string): AvisoCopia {
  if (mensaje === "Escriba el motivo de la reimpresión") return "texto";
  if (mensaje === "Elija el motivo de la reimpresión") return "motivo";
  if (mensaje === "La versión de esta copia ya no está vigente") return "version";
  if (mensaje === "La copia ya no está en ese estado") return "estado";
  return "no_disponible";
}

/** De vuelta a la página de la copia con el aviso; 303 para que el navegador la pida con `GET`. */
export function redirigirACopia(peticion: Request, id: number, consulta: "ventana=1" | `aviso=${AvisoCopia}`): NextResponse {
  return NextResponse.redirect(new URL(`/distribucion/copias/${id}?${consulta}`, peticion.url), 303);
}

/** La respuesta de `copiaParaPdf`: el PDF sellado, «no encontrado» o la vuelta a la copia con el aviso. */
export function respuestaDeCopia(peticion: Request, id: number, r: ResultadoPdf): NextResponse {
  if (!r.ok) {
    if (r.estado === 404) return respuesta404();
    return redirigirACopia(peticion, id, r.motivo === "ventana" ? "ventana=1" : "aviso=no_disponible");
  }
  const ascii = r.nombre.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return new NextResponse(new Uint8Array(r.bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(r.bytes.byteLength),
      "Content-Disposition": `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(r.nombre)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
    },
  });
}

export const respuestaDemasiadas = () =>
  NextResponse.json(
    { error: "Demasiadas peticiones, intente de nuevo en un momento" },
    { status: 429, headers: { "Retry-After": "60" } },
  );
