import type { Metadata } from "next";
import { crearTipoAccion } from "@/app/admin/acciones-mapa";
import { FormularioTipo } from "@/componentes/admin/mapa/FormularioTipo";

export const metadata: Metadata = { title: "Nuevo tipo — Administración SGC" };

export default function PaginaNuevoTipo() {
  return (
    <main>
      <h1 className="mb-6 font-display text-2xl font-semibold">Nuevo tipo de documento</h1>
      <FormularioTipo accion={crearTipoAccion} />
    </main>
  );
}
