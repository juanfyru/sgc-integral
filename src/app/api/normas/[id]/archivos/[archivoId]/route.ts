import { type NextRequest, NextResponse } from "next/server";
import { eliminarEvidencia } from "@/db/consultas/distribucion/evidencias";
import { ErrorTramite } from "@/db/consultas/flujo/contrato";
import { crearLimitador } from "@/lib/limite";
import { origenValido } from "@/lib/origen";
import { puede } from "@/lib/permisos";
import { sesionDePeticion } from "@/lib/sesion-actual";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; archivoId: string }> };

// El mismo tope de la subida: reemplazar un archivo es quitarlo y volver a subirlo.
const permitirCambio = crearLimitador({ limite: 30, ventanaMs: 60_000 });

function error(estado: number, mensaje: string) {
  return NextResponse.json({ error: mensaje }, { status: estado });
}

/** Quita el PDF de una norma, con las mismas comprobaciones de la subida; solo un archivo de esa norma. */
export async function DELETE(peticion: NextRequest, { params }: Params) {
  const sesion = await sesionDePeticion(peticion);
  if (!sesion) return error(401, "No autorizado");
  if (!puede(sesion, "normograma.administrar")) return error(403, "Sin permiso");
  if (!origenValido(peticion.headers)) return error(403, "Origen no permitido");
  if (!permitirCambio(String(sesion.usuarioId))) return error(429, "Demasiados cambios seguidos. Espere un minuto.");

  const { id, archivoId } = await params;
  if (!/^\d{1,15}$/.test(id) || !/^\d{1,15}$/.test(archivoId)) return error(404, "El archivo no existe");
  try {
    await eliminarEvidencia("norma", Number(id), Number(archivoId), sesion.usuarioId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof Error && err.message === "La evidencia no existe") return error(404, "El archivo no existe");
    if (err instanceof ErrorTramite) return error(409, err.message);
    console.error("Fallo al quitar el PDF de una norma:", err);
    return error(500, "No se pudo quitar el archivo");
  }
}
