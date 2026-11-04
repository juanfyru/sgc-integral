import type { Metadata } from "next";
import { crearMacroprocesoAccion } from "@/app/admin/acciones-mapa";
import { FormularioMacroproceso } from "@/componentes/admin/mapa/FormularioMacroproceso";
import { exigirPermiso } from "@/lib/paginas";

export const metadata: Metadata = { title: "Nuevo macroproceso — Administración SGC" };

export default async function PaginaNuevoMacroproceso() {
  await exigirPermiso("mapa.administrar");
  return (
    <main>
      <h1 className="mb-6 font-display text-2xl font-semibold">Nuevo macroproceso</h1>
      <FormularioMacroproceso accion={crearMacroprocesoAccion} />
    </main>
  );
}
