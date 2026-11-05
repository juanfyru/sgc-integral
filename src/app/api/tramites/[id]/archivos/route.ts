import { type NextRequest, NextResponse } from "next/server";
import { autorizarArchivoDeTramite } from "@/db/consultas/tramites-archivos";
import { crearLimitador } from "@/lib/limite";
import { origenValido } from "@/lib/origen";
import { puede } from "@/lib/permisos";
import { recibirArchivo } from "@/lib/recepcion-archivo";
import { sesionDePeticion } from "@/lib/sesion-actual";
import { ROLES_ARCHIVO, type RolArchivo } from "@/lib/subida";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// 30 subidas por minuto y usuario (instancia única, en memoria).
const permitirSubida = crearLimitador({ limite: 30, ventanaMs: 60_000 });

function error(estado: number, mensaje: string) {
  return NextResponse.json({ error: mensaje }, { status: estado });
}

/** Sube un archivo al borrador del trámite: solo su elaborador, y solo en elaboración (spec 13A §9.1). */
export async function POST(peticion: NextRequest, { params }: Params) {
  const sesion = await sesionDePeticion(peticion);
  if (!sesion) return error(401, "No autorizado");
  if (!puede(sesion, "tramites.participar")) return error(403, "Sin permiso");
  if (!origenValido(peticion.headers)) return error(403, "Origen no permitido");
  if (!permitirSubida(String(sesion.usuarioId))) {
    return error(429, "Demasiadas subidas seguidas. Espere un minuto.");
  }

  const rol = peticion.nextUrl.searchParams.get("rol") as RolArchivo;
  if (!ROLES_ARCHIVO.includes(rol)) return error(400, "Rol de archivo inválido");

  const { id } = await params;
  if (!/^\d{1,15}$/.test(id)) return error(404, "El trámite no existe");
  const tramiteId = Number(id);
  const permiso = await autorizarArchivoDeTramite(tramiteId, sesion, "escribir");
  if (!permiso.ok) {
    return permiso.estado === 409
      ? error(409, "Este trámite ya no está en elaboración")
      : error(404, "El trámite no existe");
  }

  const { versionId, codigo, numero } = permiso;
  return recibirArchivo(peticion, { versionId, codigo, numero, rol, tramiteId }, sesion.usuarioId);
}
