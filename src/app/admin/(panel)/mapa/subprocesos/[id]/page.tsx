import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { editarSubprocesoAccion } from "@/app/admin/acciones-mapa";
import { FormularioSubproceso } from "@/componentes/admin/mapa/FormularioSubproceso";
import { obtenerSubproceso } from "@/db/consultas/mapa-admin";

export const metadata: Metadata = { title: "Editar subproceso — Administración SGC" };

export default async function PaginaEditarSubproceso({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const s = await obtenerSubproceso(Number((await params).id));
  if (!s) notFound();
  return (
    <main>
      <Link
        href={`/admin/mapa/procesos/${s.procesoId}`}
        className="mb-4 inline-block text-sm text-muted-foreground hover:underline"
      >
        ← Volver al proceso
      </Link>
      <h1 className="mb-6 font-display text-2xl font-semibold">Editar subproceso</h1>
      <FormularioSubproceso accion={editarSubprocesoAccion} procesoId={s.procesoId} id={s.id} valores={s} />
    </main>
  );
}
