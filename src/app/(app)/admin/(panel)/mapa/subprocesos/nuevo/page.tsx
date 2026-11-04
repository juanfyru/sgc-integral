import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { crearSubprocesoAccion } from "@/app/admin/acciones-mapa";
import { FormularioSubproceso } from "@/componentes/admin/mapa/FormularioSubproceso";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
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
    <div>
      <EncabezadoPagina titulo="Nuevo subproceso" descripcion={`En ${proc.nombre}`} />
      <FormularioSubproceso accion={crearSubprocesoAccion} procesoId={proc.id} />
    </div>
  );
}
