import type { Metadata } from "next";
import { crearPerifericoAccion } from "@/app/admin/acciones-mapa";
import { FormularioPeriferico } from "@/componentes/admin/mapa/FormularioPeriferico";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { exigirPermiso } from "@/lib/paginas";

export const metadata: Metadata = { title: "Nuevo periférico — Administración SGC" };

export default async function PaginaNuevoPeriferico() {
  await exigirPermiso("mapa.administrar");
  return (
    <div>
      <EncabezadoPagina titulo="Nuevo elemento periférico" />
      <FormularioPeriferico accion={crearPerifericoAccion} />
    </div>
  );
}
