import { notFound } from "next/navigation";
import { esResponsableTecnicoDePeticion } from "@/db/consultas/vigencia/externos";
import { puedeVerVigencia } from "@/lib/alcance";
import type { SesionValida } from "@/lib/sesion";

/**
 * Quien no ve «Vigencia» recibe «no encontrado», nunca «sin permiso» (spec 13C §6.4, el patrón de
 * `exigirDistribucion`). Entran `vigencia.ver` y `documentos.indicadores` (la pestaña Indicadores), y también el
 * responsable técnico de algún externo que ve, aunque sea de rol Consulta: a la pestaña Externos, con los suyos. Devuelve
 * si lo es, para que cada pestaña decida sin volver a consultar; la respuesta es la que el cascarón ya pidió en la misma
 * petición (`esResponsableTecnicoDePeticion`).
 */
export async function exigirVigencia(sesion: SesionValida): Promise<{ responsableTecnico: boolean }> {
  const responsableTecnico = await esResponsableTecnicoDePeticion(sesion.usuarioId);
  if (!puedeVerVigencia({ ...sesion, responsableTecnico })) notFound();
  return { responsableTecnico };
}
