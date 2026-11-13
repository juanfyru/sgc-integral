import { type NextRequest, NextResponse } from "next/server";
import { autorizarArchivoDeLote } from "@/db/consultas/indicadores/importacion";
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
 * Sube la plantilla llena de un lote de importación de indicadores (spec 14A §5.3, paso 1): solo un `.xlsx`, validado por
 * sus bytes sobre el archivo completo, en `importaciones/<id>` del almacén, una vez por lote. La sube quien administra
 * indicadores. Va fuera del `matcher` del proxy (el búfer truncaba las subidas grandes): este handler exige la sesión.
 */
export async function POST(peticion: NextRequest, { params }: Params) {
  const sesion = await sesionDePeticion(peticion);
  if (!sesion) return error(401, "No autorizado");
  if (!puede(sesion, "indicadores.administrar")) return error(403, "Sin permiso");
  if (!origenValido(peticion.headers)) return error(403, "Origen no permitido");
  if (!permitirSubida(String(sesion.usuarioId))) return error(429, "Demasiadas subidas seguidas. Espere un minuto.");

  const { id } = await params;
  if (!/^\d{1,9}$/.test(id)) return error(404, "La importación no existe");
  const permiso = await autorizarArchivoDeLote(Number(id), sesion);
  if (!permiso.ok) {
    return permiso.estado === 409 ? error(409, "La importación ya tiene su plantilla") : error(404, "La importación no existe");
  }
  return recibirArchivo(
    peticion,
    { contexto: "importacion_indicadores", contextoId: Number(id), carpeta: `importaciones/${id}` },
    sesion.usuarioId,
  );
}
