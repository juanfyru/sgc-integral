import type { Metadata } from "next";
import { crearCargoAccion } from "@/app/admin/acciones-estructura";
import { FormularioCargo } from "@/componentes/admin/estructura/FormularioCargo";
import { listarAreas, listarCargos } from "@/db/consultas/estructura";
import { exigirPermiso } from "@/lib/paginas";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Nuevo cargo — Administración SGC" };

export default async function PaginaNuevoCargo() {
  await exigirPermiso("estructura.administrar");
  const [areas, cargos] = await Promise.all([listarAreas(), listarCargos()]);
  return (
    <main>
      <h1 className="mb-6 font-display text-2xl font-semibold">Nuevo cargo</h1>
      <FormularioCargo
        accion={crearCargoAccion}
        areas={areas.filter((a) => a.activo)}
        cargos={cargos.filter((c) => c.activo)}
      />
    </main>
  );
}
