import { NextResponse } from "next/server";
import type { ResultadoPdf } from "@/db/consultas/distribucion/copias";
import { respuesta404 } from "@/lib/servir-archivo";

export const MENSAJE_VENTANA = "La ventana de impresión terminó. Use «Reimprimir» para volver a imprimir esta copia.";

/** La respuesta de `copiaParaPdf`: el PDF sellado, «no encontrado» o el aviso de la ventana. */
export function respuestaDeCopia(r: ResultadoPdf): NextResponse {
  if (!r.ok) return r.estado === 404 ? respuesta404() : NextResponse.json({ error: MENSAJE_VENTANA }, { status: 409 });
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
