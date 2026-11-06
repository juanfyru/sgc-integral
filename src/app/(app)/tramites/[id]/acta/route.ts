import { type NextRequest, NextResponse } from "next/server";
import { asegurarActa, versionDeActa } from "@/db/consultas/actas";
import { puedeVerVersion } from "@/lib/alcance";
import { crearLimitador } from "@/lib/limite";
import { respuesta404, respuestaArchivo } from "@/lib/servir-archivo";
import { sesionDePeticion } from "@/lib/sesion-actual";

export const dynamic = "force-dynamic";

// El mismo tope de las rutas de archivos.
const permitirActa = crearLimitador({ limite: 60, ventanaMs: 60_000 });

/**
 * Sirve el acta de un trámite publicado o eliminado a quien puede ver su versión (spec 13A §11.2 y
 * §12). Va sin marca de agua: es el registro de la aprobación, no una copia del documento. Si no se
 * generó al publicar, se genera aquí. Quien no puede verla, o un trámite sin acta, recibe 404.
 */
export async function GET(peticion: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sesion = await sesionDePeticion(peticion);
  if (!sesion) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  if (!permitirActa(String(sesion.usuarioId))) {
    return NextResponse.json(
      { error: "Demasiadas peticiones, intente de nuevo en un momento" },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const { id } = await params;
  if (!/^\d{1,15}$/.test(id)) return respuesta404();
  const cierre = await versionDeActa(Number(id));
  if (!cierre || !(await puedeVerVersion(cierre.versionId, sesion))) return respuesta404();

  const acta = await asegurarActa(Number(id));
  if (!acta) return respuesta404();
  return respuestaArchivo(
    { ruta: acta.ruta, mime: "application/pdf", nombreOriginal: `Acta ${cierre.numero}.pdf` },
    peticion.nextUrl.searchParams.get("descarga") === "1",
  );
}
