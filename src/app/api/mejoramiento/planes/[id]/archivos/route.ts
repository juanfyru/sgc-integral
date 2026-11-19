import { type NextRequest } from "next/server";
import { subirAMejora } from "../../../_subida";

export const dynamic = "force-dynamic";

/**
 * Adjunta un archivo a un plan de mejoramiento (Fase 15B, anexo §3.7): el informe del ente, el oficio de una respuesta… El permiso
 * de la matriz es el de los planes (`mejora.planes`); el plan que existe, no está anulado y cuyos archivos abre quien sube lo
 * decide `autorizarSubida`.
 */
export async function POST(peticion: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return subirAMejora(peticion, "mejora_plan", "mejora.planes", id);
}
