import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { editarCargoAccion } from "@/app/admin/acciones-estructura";
import { FormularioCargo } from "@/componentes/admin/estructura/FormularioCargo";
import { listarAreas, listarCargos, obtenerCargo } from "@/db/consultas/estructura";
import { exigirPermiso } from "@/lib/paginas";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Editar cargo — Administración SGC" };

export default async function PaginaEditarCargo({ params }: { params: Promise<{ id: string }> }) {
  await exigirPermiso("estructura.administrar");
  const cargo = await obtenerCargo(Number((await params).id));
  if (!cargo) notFound();
  const [areas, cargos] = await Promise.all([listarAreas(), listarCargos()]);
  return (
    <main>
      <h1 className="mb-6 font-display text-2xl font-semibold">Editar cargo</h1>
      <FormularioCargo
        accion={editarCargoAccion}
        id={cargo.id}
        valores={cargo}
        areas={areas.filter((a) => a.activo || a.id === cargo.areaId)}
        cargos={cargos.filter((c) => c.id !== cargo.id && (c.activo || c.id === cargo.superiorId))}
      />
    </main>
  );
}
