import { type NextRequest, NextResponse } from "next/server";
import { autorizarFotoDeHallazgo } from "@/db/consultas/distribucion/hallazgos";
import { crearLimitador } from "@/lib/limite";
import { origenValido } from "@/lib/origen";
import { puede } from "@/lib/permisos";
import { recibirArchivo } from "@/lib/recepcion-archivo";
import { sesionDePeticion } from "@/lib/sesion-actual";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// 30 subidas por minuto y usuario (instancia única, en memoria).
const permitirSubida = crearLimitador({ limite: 30, ventanaMs: 60_000 });

function error(estado: number, mensaje: string) {
  return NextResponse.json({ error: mensaje }, { status: estado });
}

/**
 * Adjunta la foto de la corrección de un hallazgo (spec 13C §12.5): una imagen o un PDF por sus bytes, en
 * `hallazgos/<id>` del almacén. La sube el responsable actual del punto o quien gestiona, mientras no esté cerrado. Va
 * fuera del `matcher` del proxy (el búfer truncaba las subidas grandes): este handler exige la sesión.
 */
export async function POST(peticion: NextRequest, { params }: Params) {
  const sesion = await sesionDePeticion(peticion);
  if (!sesion) return error(401, "No autorizado");
  if (!puede(sesion, "distribucion.responder")) return error(403, "Sin permiso");
  if (!origenValido(peticion.headers)) return error(403, "Origen no permitido");
  if (!permitirSubida(String(sesion.usuarioId))) return error(429, "Demasiadas subidas seguidas. Espere un minuto.");

  const { id } = await params;
  if (!/^\d{1,15}$/.test(id)) return error(404, "El hallazgo no existe");
  const permiso = await autorizarFotoDeHallazgo(Number(id), sesion);
  if (!permiso.ok) {
    if (permiso.estado === 409) return error(409, "El hallazgo ya está cerrado");
    return permiso.estado === 403 ? error(403, "Sin permiso") : error(404, "El hallazgo no existe");
  }
  return recibirArchivo(peticion, { contexto: "hallazgo", contextoId: Number(id), carpeta: `hallazgos/${id}` }, sesion.usuarioId);
}
