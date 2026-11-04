import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { editarPerifericoAccion } from "@/app/admin/acciones-mapa";
import { FormularioPeriferico } from "@/componentes/admin/mapa/FormularioPeriferico";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { obtenerPeriferico } from "@/db/consultas/mapa-admin";
import { exigirPermiso } from "@/lib/paginas";

export const metadata: Metadata = { title: "Editar periférico — Administración SGC" };

export default async function PaginaEditarPeriferico({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await exigirPermiso("mapa.administrar");
  const p = await obtenerPeriferico(Number((await params).id));
  if (!p) notFound();
  return (
    <div>
      <EncabezadoPagina titulo="Editar elemento periférico" />
      <FormularioPeriferico accion={editarPerifericoAccion} id={p.id} valores={p} />
    </div>
  );
}
