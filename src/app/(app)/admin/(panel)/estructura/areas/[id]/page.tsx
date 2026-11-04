import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { editarAreaAccion } from "@/app/admin/acciones-estructura";
import { FormularioArea } from "@/componentes/admin/estructura/FormularioArea";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { obtenerArea } from "@/db/consultas/estructura";
import { exigirPermiso } from "@/lib/paginas";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Editar área — Administración SGC" };

export default async function PaginaEditarArea({ params }: { params: Promise<{ id: string }> }) {
  await exigirPermiso("estructura.administrar");
  const area = await obtenerArea(Number((await params).id));
  if (!area) notFound();
  return (
    <div>
      <EncabezadoPagina titulo="Editar área" />
      <FormularioArea accion={editarAreaAccion} id={area.id} nombre={area.nombre} />
    </div>
  );
}
