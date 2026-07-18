import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { editarProcesoAccion } from "@/app/admin/acciones-mapa";
import { FormularioProceso } from "@/componentes/admin/mapa/FormularioProceso";
import { obtenerProceso } from "@/db/consultas/mapa-admin";

export const metadata: Metadata = { title: "Editar proceso — Administración SGC" };

export default async function PaginaEditarProceso({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const p = await obtenerProceso(Number((await params).id));
  if (!p) notFound();
  return (
    <main>
      <Link
        href={`/admin/mapa/macroprocesos/${p.macroprocesoId}`}
        className="mb-4 inline-block text-sm text-muted-foreground hover:underline"
      >
        ← Volver al macroproceso
      </Link>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold">Editar proceso</h1>
        <Link
          href={`/admin/mapa/subprocesos/nuevo?proc=${p.id}`}
          className="rounded-md border px-3 py-2 text-sm hover:bg-muted"
        >
          + Subproceso
        </Link>
      </div>
      <FormularioProceso accion={editarProcesoAccion} macroprocesoId={p.macroprocesoId} id={p.id} valores={p} />
    </main>
  );
}
