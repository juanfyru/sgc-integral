import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { crearProcesoAccion } from "@/app/admin/acciones-mapa";
import { FormularioProceso } from "@/componentes/admin/mapa/FormularioProceso";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
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
    <div>
      <EncabezadoPagina titulo="Nuevo proceso" descripcion={`En ${macro.nombre}`} />
      <FormularioProceso accion={crearProcesoAccion} macroprocesoId={macro.id} />
    </div>
  );
}
