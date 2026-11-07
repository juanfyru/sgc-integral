import { type NextRequest, NextResponse } from "next/server";
import { asegurarActa, versionDeActa } from "@/db/consultas/actas";
import { obtenerTramite } from "@/db/consultas/tramites";
import { puedeVerVersion } from "@/lib/alcance";
import { crearLimitador } from "@/lib/limite";
import { respuesta404, respuestaArchivo } from "@/lib/servir-archivo";
import { sesionDePeticion } from "@/lib/sesion-actual";

export const dynamic = "force-dynamic";

// El mismo tope de las rutas de archivos.
const permitirActa = crearLimitador({ limite: 60, ventanaMs: 60_000 });

/**
 * Sirve el acta de un trámite publicado o eliminado a quien puede ver su versión o el trámite cerrado
 * (spec 13A §11.2 y §12; acta con formato, §6). Va sin marca de agua: es el registro de la aprobación, no una copia del documento. Si no se
 * generó al publicar, se genera aquí. Quien no ve ni la versión ni el trámite, o un trámite sin acta, recibe 404.
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
  if (!cierre) return respuesta404();
  // El acta es del trámite: quien ya no ve la versión (obsoleta) pero sí el trámite cerrado la ve,
  // sin abrir los archivos del documento. Lo común y barato primero.
  const veVersion = await puedeVerVersion(cierre.versionId, sesion);
  if (!veVersion && (await obtenerTramite(Number(id), sesion)) === null) return respuesta404();

  const acta = await asegurarActa(Number(id), { usuarioId: sesion.usuarioId });
  if (!acta) return respuesta404();
  return respuestaArchivo({ ruta: acta.ruta, mime: "application/pdf", nombreOriginal: `Acta ${cierre.numero}.pdf` }, false);
}
