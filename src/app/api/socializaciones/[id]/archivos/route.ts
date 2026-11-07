import { type NextRequest, NextResponse } from "next/server";
import { autorizarEvidenciaDeJornada } from "@/db/consultas/distribucion/jornadas";
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
 * Adjunta evidencia a una jornada: solo quien la registró, mientras no esté anulada y durante las 24 horas
 * siguientes. Quien no la registró recibe 404, como si no existiera.
 */
export async function POST(peticion: NextRequest, { params }: Params) {
  const sesion = await sesionDePeticion(peticion);
  if (!sesion) return error(401, "No autorizado");
  if (!puede(sesion, "socializaciones.registrar")) return error(403, "Sin permiso");
  if (!origenValido(peticion.headers)) return error(403, "Origen no permitido");
  if (!permitirSubida(String(sesion.usuarioId))) return error(429, "Demasiadas subidas seguidas. Espere un minuto.");

  const { id } = await params;
  if (!/^\d{1,15}$/.test(id)) return error(404, "La jornada no existe");
  const permiso = await autorizarEvidenciaDeJornada(Number(id), sesion);
  if (!permiso.ok) {
    return permiso.estado === 409
      ? error(409, "La evidencia de esta jornada ya no se puede cambiar")
      : error(404, "La jornada no existe");
  }
  return recibirArchivo(
    peticion,
    { contexto: "jornada", contextoId: Number(id), carpeta: `jornadas/${id}` },
    sesion.usuarioId,
  );
}
