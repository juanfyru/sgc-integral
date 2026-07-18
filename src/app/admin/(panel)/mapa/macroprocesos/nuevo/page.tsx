import type { Metadata } from "next";
import { crearMacroprocesoAccion } from "@/app/admin/acciones-mapa";
import { FormularioMacroproceso } from "@/componentes/admin/mapa/FormularioMacroproceso";

export const metadata: Metadata = { title: "Nuevo macroproceso — Administración SGC" };

export default function PaginaNuevoMacroproceso() {
  return (
    <main>
      <h1 className="mb-6 font-display text-2xl font-semibold">Nuevo macroproceso</h1>
      <FormularioMacroproceso accion={crearMacroprocesoAccion} />
    </main>
  );
}
