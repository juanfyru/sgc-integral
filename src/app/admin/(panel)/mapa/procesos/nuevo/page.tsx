import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { crearProcesoAccion } from "@/app/admin/acciones-mapa";
import { FormularioProceso } from "@/componentes/admin/mapa/FormularioProceso";
import { obtenerMacroproceso } from "@/db/consultas/mapa-admin";
import { exigirPermiso } from "@/lib/paginas";

export const metadata: Metadata = { title: "Nuevo proceso — Administración SGC" };

export default async function PaginaNuevoProceso({
  searchParams,
}: {
  searchParams: Promise<{ macro?: string }>;
}) {
  await exigirPermiso("mapa.administrar");
  const macroId = Number((await searchParams).macro);
  if (!Number.isInteger(macroId) || macroId <= 0) notFound();
  const macro = await obtenerMacroproceso(macroId);
  if (!macro) notFound();
  return (
    <main>
      <h1 className="mb-2 font-display text-2xl font-semibold">Nuevo proceso</h1>
      <p className="mb-6 text-sm text-muted-foreground">En {macro.nombre}</p>
      <FormularioProceso accion={crearProcesoAccion} macroprocesoId={macro.id} />
    </main>
  );
}
