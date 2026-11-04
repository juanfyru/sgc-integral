import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { editarMacroprocesoAccion } from "@/app/admin/acciones-mapa";
import { FormularioMacroproceso } from "@/componentes/admin/mapa/FormularioMacroproceso";
import { ListaProcesos } from "@/componentes/admin/mapa/ListaProcesos";
import { listarProcesos, obtenerMacroproceso } from "@/db/consultas/mapa-admin";
import { exigirPermiso } from "@/lib/paginas";

export const metadata: Metadata = { title: "Editar macroproceso — Administración SGC" };

export default async function PaginaEditarMacroproceso({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await exigirPermiso("mapa.administrar");
  const m = await obtenerMacroproceso(Number((await params).id));
  if (!m) notFound();
  const procesos = await listarProcesos(m.id);
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
      <section className="mt-8">
        <h2 className="mb-2 font-display text-lg font-semibold">Procesos</h2>
        <ListaProcesos procesos={procesos} volverA={`/admin/mapa/macroprocesos/${m.id}`} />
      </section>
    </main>
  );
}
