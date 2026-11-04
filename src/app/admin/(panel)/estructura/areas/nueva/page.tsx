import type { Metadata } from "next";
import { crearAreaAccion } from "@/app/admin/acciones-estructura";
import { FormularioArea } from "@/componentes/admin/estructura/FormularioArea";
import { exigirPermiso } from "@/lib/paginas";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Nueva área — Administración SGC" };

export default async function PaginaNuevaArea() {
  await exigirPermiso("estructura.administrar");
  return (
    <main>
      <h1 className="mb-6 font-display text-2xl font-semibold">Nueva área</h1>
      <FormularioArea accion={crearAreaAccion} />
    </main>
  );
}
