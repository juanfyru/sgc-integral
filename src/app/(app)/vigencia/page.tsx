import { notFound, redirect } from "next/navigation";
import { exigirSesion } from "@/lib/paginas";
import { puede } from "@/lib/permisos";
import { exigirVigencia } from "./_comun";

export const dynamic = "force-dynamic";

/**
 * Lleva a la pestaña que le toca a la persona: el semáforo con `vigencia.ver`; sin él, los indicadores con
 * `documentos.indicadores` o sus externos si solo es responsable técnico.
 */
export default async function PaginaVigencia() {
  const sesion = await exigirSesion();
  const { responsableTecnico } = await exigirVigencia(sesion);
  if (puede(sesion, "vigencia.ver")) redirect("/vigencia/semaforo");
  if (puede(sesion, "documentos.indicadores")) redirect("/vigencia/indicadores");
  if (responsableTecnico) redirect("/vigencia/externos");
  notFound();
}
