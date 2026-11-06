import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { editarTipoAccion } from "@/app/admin/acciones-mapa";
import { FormularioTipo } from "@/componentes/admin/mapa/FormularioTipo";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { listarPlantillasPosibles, obtenerTipo } from "@/db/consultas/mapa-admin";
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
    <div>
      <EncabezadoPagina titulo="Editar tipo de documento" />
      <FormularioTipo accion={editarTipoAccion} id={tipo.id} valores={tipo} plantillas={await listarPlantillasPosibles()} />
    </div>
  );
}
