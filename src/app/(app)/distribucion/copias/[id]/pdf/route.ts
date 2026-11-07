import { type NextRequest, NextResponse } from "next/server";
import { copiaParaPdf } from "@/db/consultas/distribucion/copias";
import { respuestaDeCopia, respuestaDemasiadas } from "@/lib/distribucion/respuesta-copia";
import { crearLimitador } from "@/lib/limite";
import { respuesta404 } from "@/lib/servir-archivo";
import { sesionDePeticion } from "@/lib/sesion-actual";

export const dynamic = "force-dynamic";

const permitirPdf = crearLimitador({ limite: 60, ventanaMs: 60_000 });

/**
 * El PDF sellado de una copia controlada. Imprimirlo es una acción de quien emite y solo cabe en la
 * ventana que abre la emisión o una reimpresión; quien solo consulta lo ve siempre. Quien no ve la
 * copia recibe 404, no 403; fuera de la ventana, vuelve a la copia con el aviso y «Reimprimir».
 */
export async function GET(peticion: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sesion = await sesionDePeticion(peticion);
  if (!sesion) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!permitirPdf(String(sesion.usuarioId))) return respuestaDemasiadas();

  const { id } = await params;
  if (!/^\d{1,15}$/.test(id)) return respuesta404();
  return respuestaDeCopia(peticion, Number(id), await copiaParaPdf(Number(id), sesion));
}
