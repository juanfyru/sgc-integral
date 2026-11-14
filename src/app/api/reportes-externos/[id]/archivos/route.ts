import { type NextRequest, NextResponse } from "next/server";
import { autorizarSoporteDeConstancia } from "@/db/consultas/indicadores/constancias";
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
 * Adjunta un soporte (PDF o imagen, por sus bytes) a una constancia de envío al ente (anexo 14B, §8), en
 * `reportes-externos/<id>` del almacén. Lo sube quien puede registrar la constancia (ve el indicador y lo mide, o administra
 * indicadores) mientras el indicador esté activo, también a una ya registrada: una corrección puede necesitar el documento
 * correcto. Quien no ve el indicador recibe 404. Va fuera del `matcher` del proxy (el búfer truncaba las subidas grandes):
 * este handler exige la sesión.
 */
export async function POST(peticion: NextRequest, { params }: Params) {
  const sesion = await sesionDePeticion(peticion);
  if (!sesion) return error(401, "No autorizado");
  if (!puede(sesion, "indicadores.medir")) return error(403, "Sin permiso");
  if (!origenValido(peticion.headers)) return error(403, "Origen no permitido");
  if (!permitirSubida(String(sesion.usuarioId))) return error(429, "Demasiadas subidas seguidas. Espere un minuto.");

  const { id } = await params;
  if (!/^\d{1,15}$/.test(id)) return error(404, "La constancia no existe");
  const permiso = await autorizarSoporteDeConstancia(Number(id), sesion);
  if (!permiso.ok) {
    if (permiso.estado === 409) return error(409, "El indicador está retirado: ya no admite reportes");
    return permiso.estado === 403 ? error(403, "Sin permiso") : error(404, "La constancia no existe");
  }
  return recibirArchivo(peticion, { contexto: "reporte_externo", contextoId: Number(id), carpeta: `reportes-externos/${id}` }, sesion.usuarioId);
}
