import type { Metadata } from "next";
import { crearMacroprocesoAccion } from "@/app/admin/acciones-mapa";
import { FormularioMacroproceso } from "@/componentes/admin/mapa/FormularioMacroproceso";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { exigirPermiso } from "@/lib/paginas";

export const metadata: Metadata = { title: "Nuevo macroproceso — Administración SGC" };

export default async function PaginaNuevoMacroproceso() {
  await exigirPermiso("mapa.administrar");
  return (
    <div>
      <EncabezadoPagina titulo="Nuevo macroproceso" />
      <FormularioMacroproceso accion={crearMacroprocesoAccion} />
    </div>
  );
}
