import type { Metadata } from "next";
import { crearPerifericoAccion } from "@/app/admin/acciones-mapa";
import { FormularioPeriferico } from "@/componentes/admin/mapa/FormularioPeriferico";
import { exigirPermiso } from "@/lib/paginas";

export const metadata: Metadata = { title: "Nuevo periférico — Administración SGC" };

export default async function PaginaNuevoPeriferico() {
  await exigirPermiso("mapa.administrar");
  return (
    <main>
      <h1 className="mb-6 font-display text-2xl font-semibold">Nuevo elemento periférico</h1>
      <FormularioPeriferico accion={crearPerifericoAccion} />
    </main>
  );
}
