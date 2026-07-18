import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { editarMacroprocesoAccion } from "@/app/admin/acciones-mapa";
import { FormularioMacroproceso } from "@/componentes/admin/mapa/FormularioMacroproceso";
import { obtenerMacroproceso } from "@/db/consultas/mapa-admin";

export const metadata: Metadata = { title: "Editar macroproceso — Administración SGC" };

export default async function PaginaEditarMacroproceso({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const m = await obtenerMacroproceso(Number((await params).id));
  if (!m) notFound();
  return (
    <main>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold">Editar macroproceso</h1>
        <Link
          href={`/admin/mapa/procesos/nuevo?macro=${m.id}`}
          className="rounded-md border px-3 py-2 text-sm hover:bg-muted"
        >
          + Proceso en este macroproceso
        </Link>
      </div>
      <FormularioMacroproceso accion={editarMacroprocesoAccion} id={m.id} valores={m} />
      <p className="mt-6 text-sm text-muted-foreground">
        Los procesos de este macroproceso se gestionan desde el
        <Link href="/admin/mapa" className="ml-1 underline">editor del mapa</Link>.
      </p>
    </main>
  );
}
