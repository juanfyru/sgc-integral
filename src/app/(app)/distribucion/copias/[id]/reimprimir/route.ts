import { type NextRequest, NextResponse } from "next/server";
import { CopiaNoVisible, copiaParaPdf, reimprimirCopia } from "@/db/consultas/distribucion/copias";
import {
  avisoDeReimpresion,
  redirigirACopia,
  respuestaDeCopia,
  respuestaDemasiadas,
} from "@/lib/distribucion/respuesta-copia";
import { ErrorDistribucion, MOTIVOS_REIMPRESION, type MotivoReimpresion } from "@/lib/distribucion/tipos";
import { crearLimitador } from "@/lib/limite";
import { origenValido } from "@/lib/origen";
import { ErrorPermiso, puede } from "@/lib/permisos";
import { respuesta404 } from "@/lib/servir-archivo";
import { sesionDePeticion } from "@/lib/sesion-actual";

export const dynamic = "force-dynamic";

const permitirReimpresion = crearLimitador({ limite: 60, ventanaMs: 60_000 });

/**
 * Reimprime una copia: abre una ventana nueva de impresión y responde con el PDF sellado. Lo que impide
 * reimprimir vuelve a la página de la copia con su aviso (la respuesta se abre en otra pestaña: no un JSON).
 */
export async function POST(peticion: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sesion = await sesionDePeticion(peticion);
  if (!sesion) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!puede(sesion, "copias.emitir")) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  if (!origenValido(peticion.headers)) return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  if (!permitirReimpresion(String(sesion.usuarioId))) return respuestaDemasiadas();

  const { id } = await params;
  if (!/^\d{1,15}$/.test(id)) return respuesta404();

  const formulario = await peticion.formData().catch(() => null);
  const motivo = formulario?.get("motivo");
  const texto = formulario?.get("texto");
  if (typeof motivo !== "string" || !MOTIVOS_REIMPRESION.includes(motivo as MotivoReimpresion)) {
    return redirigirACopia(peticion, Number(id), "aviso=motivo");
  }
  try {
    await reimprimirCopia(Number(id), sesion, motivo as MotivoReimpresion, typeof texto === "string" ? texto : null);
  } catch (err) {
    if (err instanceof CopiaNoVisible) return respuesta404();
    if (err instanceof ErrorDistribucion) return redirigirACopia(peticion, Number(id), `aviso=${avisoDeReimpresion(err.message)}`);
    if (err instanceof ErrorPermiso) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
    throw err;
  }
  return respuestaDeCopia(peticion, Number(id), await copiaParaPdf(Number(id), sesion));
}
