import { type NextRequest, NextResponse } from "next/server";
import { autorizarEvidenciaDeJornada } from "@/db/consultas/distribucion/jornadas";
import { eliminarEvidencia } from "@/db/consultas/distribucion/evidencias";
import { ErrorTramite } from "@/db/consultas/flujo/contrato";
import { crearLimitador } from "@/lib/limite";
import { origenValido } from "@/lib/origen";
import { puede } from "@/lib/permisos";
import { sesionDePeticion } from "@/lib/sesion-actual";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; archivoId: string }> };

const permitirCambio = crearLimitador({ limite: 30, ventanaMs: 60_000 });

function error(estado: number, mensaje: string) {
  return NextResponse.json({ error: mensaje }, { status: estado });
}

/** Quita una evidencia de la jornada, con las mismas condiciones de la subida. */
export async function DELETE(peticion: NextRequest, { params }: Params) {
  const sesion = await sesionDePeticion(peticion);
  if (!sesion) return error(401, "No autorizado");
  if (!puede(sesion, "socializaciones.registrar")) return error(403, "Sin permiso");
  if (!origenValido(peticion.headers)) return error(403, "Origen no permitido");
  if (!permitirCambio(String(sesion.usuarioId))) return error(429, "Demasiados cambios seguidos. Espere un minuto.");

  const { id, archivoId } = await params;
  if (!/^\d{1,15}$/.test(id) || !/^\d{1,15}$/.test(archivoId)) return error(404, "El archivo no existe");
  const permiso = await autorizarEvidenciaDeJornada(Number(id), sesion);
  if (!permiso.ok) {
    return permiso.estado === 409
      ? error(409, "La evidencia de esta jornada ya no se puede cambiar")
      : error(404, "El archivo no existe");
  }
  try {
    await eliminarEvidencia("jornada", Number(id), Number(archivoId), sesion.usuarioId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof Error && err.message === "La evidencia no existe") return error(404, "El archivo no existe");
    if (err instanceof ErrorTramite) return error(409, err.message);
    console.error("Fallo al quitar una evidencia de la jornada:", err);
    return error(500, "No se pudo quitar el archivo");
  }
}
