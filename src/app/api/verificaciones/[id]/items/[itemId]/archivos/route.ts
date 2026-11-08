import { type NextRequest, NextResponse } from "next/server";
import { autorizarFotoDeItem } from "@/db/consultas/distribucion/verificaciones";
import { crearLimitador } from "@/lib/limite";
import { origenValido } from "@/lib/origen";
import { puede } from "@/lib/permisos";
import { recibirArchivo } from "@/lib/recepcion-archivo";
import { sesionDePeticion } from "@/lib/sesion-actual";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; itemId: string }> };

// 30 subidas por minuto y usuario (instancia única, en memoria).
const permitirSubida = crearLimitador({ limite: 30, ventanaMs: 60_000 });

function error(estado: number, mensaje: string) {
  return NextResponse.json({ error: mensaje }, { status: estado });
}

/** Adjunta una foto a un ítem de una verificación abierta. */
export async function POST(peticion: NextRequest, { params }: Params) {
  const sesion = await sesionDePeticion(peticion);
  if (!sesion) return error(401, "No autorizado");
  if (!puede(sesion, "verificaciones.realizar")) return error(403, "Sin permiso");
  if (!origenValido(peticion.headers)) return error(403, "Origen no permitido");
  if (!permitirSubida(String(sesion.usuarioId))) return error(429, "Demasiadas subidas seguidas. Espere un minuto.");

  const { id, itemId } = await params;
  if (!/^\d{1,15}$/.test(id) || !/^\d{1,15}$/.test(itemId)) return error(404, "El ítem no existe");
  const permiso = await autorizarFotoDeItem(Number(id), Number(itemId), sesion);
  if (!permiso.ok) {
    return permiso.estado === 409 ? error(409, "La verificación ya está cerrada") : error(404, "El ítem no existe");
  }
  return recibirArchivo(
    peticion,
    { contexto: "verificacion_item", contextoId: Number(itemId), carpeta: `verificaciones/${id}/items/${itemId}` },
    sesion.usuarioId,
  );
}
