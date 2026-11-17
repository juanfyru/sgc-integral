import { type NextRequest } from "next/server";
import { subirAMejora } from "../../../_subida";

export const dynamic = "force-dynamic";

/** Adjunta un archivo a un hallazgo (evidencia, corrección o escaneo de la carga) (spec 15 §12.2). Quién puede, lo decide `autorizarSubida`. */
export async function POST(peticion: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return subirAMejora(peticion, "mejora_hallazgo", "mejora.ejecutar", id);
}
