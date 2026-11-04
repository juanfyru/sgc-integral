import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { editarSubprocesoAccion } from "@/app/admin/acciones-mapa";
import { FormularioSubproceso } from "@/componentes/admin/mapa/FormularioSubproceso";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { obtenerSubproceso } from "@/db/consultas/mapa-admin";
import { exigirPermiso } from "@/lib/paginas";

export const metadata: Metadata = { title: "Editar subproceso — Administración SGC" };

export default async function PaginaEditarSubproceso({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await exigirPermiso("mapa.administrar");
  const s = await obtenerSubproceso(Number((await params).id));
  if (!s) notFound();
  return (
    <div>
      <Link
        href={`/admin/mapa/procesos/${s.procesoId}`}
        className="mb-4 inline-block text-sm text-muted-foreground hover:underline"
      >
        ← Volver al proceso
      </Link>
      <EncabezadoPagina titulo="Editar subproceso" />
      <FormularioSubproceso accion={editarSubprocesoAccion} procesoId={s.procesoId} id={s.id} valores={s} />
    </div>
  );
}
