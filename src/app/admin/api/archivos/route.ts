import { type NextRequest, NextResponse } from "next/server";
import { obtenerSql } from "@/db/cliente";
import { exigirEscrituraEnVersion, obtenerVersionParaSubida } from "@/db/consultas/admin";
import { ErrorTramite } from "@/db/consultas/flujo/contrato";
import { origenValido } from "@/lib/origen";
import { crearLimitador } from "@/lib/limite";
import { puede } from "@/lib/permisos";
import { nombreDeArchivo, recibirArchivo } from "@/lib/recepcion-archivo";
import { sesionDePeticion } from "@/lib/sesion-actual";
import { ROLES_ARCHIVO, type RolArchivo } from "@/lib/subida";

export const dynamic = "force-dynamic";

// 30 subidas por minuto y usuario (instancia única, en memoria).
const permitirSubida = crearLimitador({ limite: 30, ventanaMs: 60_000 });

function error(estado: number, mensaje: string) {
  return NextResponse.json({ error: mensaje }, { status: estado });
}

export async function POST(peticion: NextRequest) {
  const sesion = await sesionDePeticion(peticion);
  if (!sesion) return error(401, "No autorizado");
  if (!puede(sesion, "documentos.administrar")) return error(403, "Sin permiso");
  if (!origenValido(peticion.headers)) return error(403, "Origen no permitido");
  if (!permitirSubida(String(sesion.usuarioId))) {
    return error(429, "Demasiadas subidas seguidas. Espere un minuto.");
  }

  const versionId = Number(peticion.nextUrl.searchParams.get("version"));
  const rol = peticion.nextUrl.searchParams.get("rol") as RolArchivo;
  if (!Number.isInteger(versionId) || versionId <= 0) {
    return error(400, "Falta la versión de destino");
  }
  if (!ROLES_ARCHIVO.includes(rol)) return error(400, "Rol de archivo inválido");
  if (!nombreDeArchivo(peticion)) return error(400, "Falta el nombre del archivo");

  const version = await obtenerVersionParaSubida(versionId);
  if (!version) return error(404, "La versión no existe");
  if (version.estado !== "borrador") {
    return error(409, "Solo se pueden subir archivos a una versión en borrador");
  }
  // Aquí, para responder sin recibir el archivo; registrarlo lo comprueba otra vez bajo su transacción.
  try {
    await exigirEscrituraEnVersion(obtenerSql(), versionId);
  } catch (err) {
    if (err instanceof ErrorTramite) return error(409, err.message);
    throw err;
  }

  return recibirArchivo(
    peticion,
    { versionId, codigo: version.codigo, numero: version.numero, rol },
    sesion.usuarioId,
  );
}
