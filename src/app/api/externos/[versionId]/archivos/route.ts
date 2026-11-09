import { type NextRequest, NextResponse } from "next/server";
import { autorizarArchivoDeEdicion, NO_BORRADOR } from "@/db/consultas/vigencia/externos";
import { crearLimitador } from "@/lib/limite";
import { origenValido } from "@/lib/origen";
import { puede } from "@/lib/permisos";
import { recibirArchivo } from "@/lib/recepcion-archivo";
import { sesionDePeticion } from "@/lib/sesion-actual";
import { ROLES_ARCHIVO, type RolArchivo } from "@/lib/subida";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ versionId: string }> };

// 30 subidas por minuto y usuario (instancia única, en memoria).
const permitirSubida = crearLimitador({ limite: 30, ventanaMs: 60_000 });

function error(estado: number, mensaje: string) {
  return NextResponse.json({ error: mensaje }, { status: estado });
}

/**
 * Sube un archivo a la edición en borrador de un externo: quien lo gestiona, y solo en borrador (spec 13C §8.3). Va
 * fuera del `matcher` del proxy: con él, Next copia el cuerpo y pasados 10 MB lo entrega cortado (F13A-R10).
 */
export async function POST(peticion: NextRequest, { params }: Params) {
  const sesion = await sesionDePeticion(peticion);
  if (!sesion) return error(401, "No autorizado");
  if (!puede(sesion, "externos.gestionar")) return error(403, "Sin permiso");
  if (!origenValido(peticion.headers)) return error(403, "Origen no permitido");
  if (!permitirSubida(String(sesion.usuarioId))) {
    return error(429, "Demasiadas subidas seguidas. Espere un minuto.");
  }

  const rol = peticion.nextUrl.searchParams.get("rol") as RolArchivo;
  if (!ROLES_ARCHIVO.includes(rol)) return error(400, "Rol de archivo inválido");

  const { versionId } = await params;
  if (!/^\d{1,15}$/.test(versionId)) return error(404, "La edición no existe");
  const permiso = await autorizarArchivoDeEdicion(Number(versionId), sesion);
  if (!permiso.ok) return permiso.estado === 409 ? error(409, NO_BORRADOR) : error(404, "La edición no existe");

  return recibirArchivo(peticion, { ...permiso.destino, rol }, sesion.usuarioId);
}
