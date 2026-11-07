import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { editarSubprocesoAccion } from "@/app/admin/acciones-mapa";
import { FormularioSubproceso } from "@/componentes/admin/mapa/FormularioSubproceso";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { claseBoton } from "@/componentes/ui/Boton";
import { obtenerSubproceso } from "@/db/consultas/mapa-admin";
import { exigirPermiso } from "@/lib/paginas";
import { puede } from "@/lib/permisos";

export const metadata: Metadata = { title: "Editar subproceso — Administración SGC" };

export default async function PaginaEditarSubproceso({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const sesion = await exigirPermiso("mapa.administrar");
  const s = await obtenerSubproceso(Number((await params).id));
  if (!s) notFound();
  // El atajo de F13B-DC18: el formulario del punto llega con el nombre y el proceso del subproceso, sin vínculo.
  const atajoPunto = puede(sesion, "distribucion.gestionar");
  return (
    <div>
      <Link
        href={`/admin/mapa/procesos/${s.procesoId}`}
        className="mb-4 inline-block text-sm text-muted-foreground hover:underline"
      >
        ← Volver al proceso
      </Link>
      <EncabezadoPagina
        titulo="Editar subproceso"
        acciones={
          atajoPunto ? (
            <Link href={`/admin/puntos-uso/nuevo?subproceso=${s.id}`} className={claseBoton("secundario")}>
              Nuevo punto de uso para este subproceso
            </Link>
          ) : undefined
        }
      />
      <FormularioSubproceso accion={editarSubprocesoAccion} procesoId={s.procesoId} id={s.id} valores={s} />
    </div>
  );
}
