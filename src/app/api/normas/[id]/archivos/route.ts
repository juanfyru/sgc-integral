import { type NextRequest, NextResponse } from "next/server";
import { existeNorma } from "@/db/consultas/normograma/normas";
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
 * Sube el PDF de una norma (spec 13C §10.1): quien administra el normograma, solo PDF por sus bytes, hasta 25 MB. Una
 * norma tiene un solo PDF: el nuevo reemplaza al anterior en la misma transacción. Va fuera del `matcher` del proxy:
 * con él, Next copia el cuerpo y pasados 10 MB lo entrega cortado (F13A-R10).
 */
export async function POST(peticion: NextRequest, { params }: Params) {
  const sesion = await sesionDePeticion(peticion);
  if (!sesion) return error(401, "No autorizado");
  if (!puede(sesion, "normograma.administrar")) return error(403, "Sin permiso");
  if (!origenValido(peticion.headers)) return error(403, "Origen no permitido");
  if (!permitirSubida(String(sesion.usuarioId))) return error(429, "Demasiadas subidas seguidas. Espere un minuto.");

  const { id } = await params;
  if (!/^\d{1,15}$/.test(id) || !(await existeNorma(Number(id)))) return error(404, "La norma no existe");
  return recibirArchivo(peticion, { contexto: "norma", contextoId: Number(id), carpeta: `normas/${id}` }, sesion.usuarioId);
}
