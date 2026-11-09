import { type NextRequest, NextResponse } from "next/server";
import { anioDeRevisionCerrada, asegurarInforme, nombreDeInforme } from "@/db/consultas/vigencia/informe";
import { puedeVerInformeAnual } from "@/lib/alcance";
import { crearLimitador } from "@/lib/limite";
import { respuesta404, respuestaArchivo } from "@/lib/servir-archivo";
import { sesionDePeticion } from "@/lib/sesion-actual";

export const dynamic = "force-dynamic";

// El mismo tope de la ruta del acta.
const permitirInforme = crearLimitador({ limite: 60, ventanaMs: 60_000 });

/** Lo que se responde a quien sí ve el informe cuando no se pudo entregar: el motivo quedó en la bitácora. */
const NO_ENTREGABLE =
  "No se pudo entregar el informe: el archivo de su formato falta o cambió, o no salió idéntico al registrado. Quedó anotado en la bitácora.";

/**
 * El informe en PDF de una revisión anual cerrada (spec 13C §9.5 y §6.4). Nombra documentos restringidos: lo ven el
 * Admin SGC, Gerencia y Control Interno (`puedeVerInformeAnual`); para los demás, y para una revisión abierta o que no
 * existe, no existe (404). Se genera al primer pedido desde el informe congelado, como el acta.
 */
export async function GET(peticion: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sesion = await sesionDePeticion(peticion);
  if (!sesion) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  if (!permitirInforme(String(sesion.usuarioId))) {
    return NextResponse.json(
      { error: "Demasiadas peticiones, intente de nuevo en un momento" },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const { id } = await params;
  if (!/^\d{1,15}$/.test(id) || !puedeVerInformeAnual(sesion)) return respuesta404();
  const anio = await anioDeRevisionCerrada(Number(id));
  if (anio === null) return respuesta404();

  const informe = await asegurarInforme(Number(id), { usuarioId: sesion.usuarioId });
  if (!informe) return NextResponse.json({ error: NO_ENTREGABLE }, { status: 404 });
  return respuestaArchivo({ ruta: informe.ruta, mime: "application/pdf", nombreOriginal: nombreDeInforme(anio) }, false);
}
