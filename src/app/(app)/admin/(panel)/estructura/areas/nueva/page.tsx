import type { Metadata } from "next";
import { crearAreaAccion } from "@/app/admin/acciones-estructura";
import { FormularioArea } from "@/componentes/admin/estructura/FormularioArea";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { exigirPermiso } from "@/lib/paginas";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Nueva área — Administración SGC" };

export default async function PaginaNuevaArea() {
  await exigirPermiso("estructura.administrar");
  return (
    <div>
      <EncabezadoPagina titulo="Nueva área" />
      <FormularioArea accion={crearAreaAccion} />
    </div>
  );
}
