import type { Metadata } from "next";
import { crearTipoAccion } from "@/app/admin/acciones-mapa";
import { FormularioTipo } from "@/componentes/admin/mapa/FormularioTipo";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { exigirPermiso } from "@/lib/paginas";

export const metadata: Metadata = { title: "Nuevo tipo — Administración SGC" };

export default async function PaginaNuevoTipo() {
  await exigirPermiso("mapa.administrar");
  return (
    <div>
      <EncabezadoPagina titulo="Nuevo tipo de documento" />
      <FormularioTipo accion={crearTipoAccion} />
    </div>
  );
}
