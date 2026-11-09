import { notFound, redirect } from "next/navigation";
import { exigirSesion } from "@/lib/paginas";
import { puede } from "@/lib/permisos";
import { exigirVigencia } from "./_comun";

export const dynamic = "force-dynamic";

/** Lleva a la primera pestaña que la persona puede ver: el semáforo, o sus externos si solo es responsable técnico. */
export default async function PaginaVigencia() {
  const sesion = await exigirSesion();
  const { responsableTecnico } = await exigirVigencia(sesion);
  if (puede(sesion, "vigencia.ver")) redirect("/vigencia/semaforo");
  if (responsableTecnico) redirect("/vigencia/externos");
  notFound();
}
