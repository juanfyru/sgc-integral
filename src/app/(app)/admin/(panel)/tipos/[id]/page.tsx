import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { editarTipoAccion } from "@/app/admin/acciones-mapa";
import { FormularioTipo } from "@/componentes/admin/mapa/FormularioTipo";
import { obtenerTipo } from "@/db/consultas/mapa-admin";
import { exigirPermiso } from "@/lib/paginas";

export const metadata: Metadata = { title: "Editar tipo — Administración SGC" };

export default async function PaginaEditarTipo({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await exigirPermiso("mapa.administrar");
  const tipo = await obtenerTipo(Number((await params).id));
  if (!tipo) notFound();
  return (
    <main>
      <h1 className="mb-6 font-display text-2xl font-semibold">Editar tipo de documento</h1>
      <FormularioTipo accion={editarTipoAccion} id={tipo.id} valores={tipo} />
    </main>
  );
}
