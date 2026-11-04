import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { crearSubprocesoAccion } from "@/app/admin/acciones-mapa";
import { FormularioSubproceso } from "@/componentes/admin/mapa/FormularioSubproceso";
import { obtenerProceso } from "@/db/consultas/mapa-admin";
import { exigirPermiso } from "@/lib/paginas";

export const metadata: Metadata = { title: "Nuevo subproceso — Administración SGC" };

export default async function PaginaNuevoSubproceso({
  searchParams,
}: {
  searchParams: Promise<{ proc?: string }>;
}) {
  await exigirPermiso("mapa.administrar");
  const procId = Number((await searchParams).proc);
  if (!Number.isInteger(procId) || procId <= 0) notFound();
  const proc = await obtenerProceso(procId);
  if (!proc) notFound();
  return (
    <main>
      <h1 className="mb-2 font-display text-2xl font-semibold">Nuevo subproceso</h1>
      <p className="mb-6 text-sm text-muted-foreground">En {proc.nombre}</p>
      <FormularioSubproceso accion={crearSubprocesoAccion} procesoId={proc.id} />
    </main>
  );
}
