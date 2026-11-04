import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { editarProcesoAccion } from "@/app/admin/acciones-mapa";
import { FormularioProceso } from "@/componentes/admin/mapa/FormularioProceso";
import { ListaSubprocesos } from "@/componentes/admin/mapa/ListaSubprocesos";
import { claseBoton } from "@/componentes/ui/Boton";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { listarSubprocesos, obtenerProceso } from "@/db/consultas/mapa-admin";
import { exigirPermiso } from "@/lib/paginas";

export const metadata: Metadata = { title: "Editar proceso — Administración SGC" };

export default async function PaginaEditarProceso({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await exigirPermiso("mapa.administrar");
  const p = await obtenerProceso(Number((await params).id));
  if (!p) notFound();
  const subprocesos = await listarSubprocesos(p.id);
  return (
    <div>
      <Link
        href={`/admin/mapa/macroprocesos/${p.macroprocesoId}`}
        className="mb-4 inline-block text-sm text-muted-foreground hover:underline"
      >
        ← Volver al macroproceso
      </Link>
      <EncabezadoPagina
        titulo="Editar proceso"
        acciones={
          <Link href={`/admin/mapa/subprocesos/nuevo?proc=${p.id}`} className={claseBoton("secundario")}>
            + Subproceso
          </Link>
        }
      />
      <FormularioProceso accion={editarProcesoAccion} macroprocesoId={p.macroprocesoId} id={p.id} valores={p} />
      <section className="mt-8">
        <h2 className="mb-2 font-display text-lg font-semibold">Subprocesos</h2>
        <ListaSubprocesos subprocesos={subprocesos} volverA={`/admin/mapa/procesos/${p.id}`} />
      </section>
    </div>
  );
}
