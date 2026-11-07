import type { Metadata } from "next";
import { crearPuntoUsoAccion } from "@/app/admin/acciones-puntos-uso";
import { FormularioPuntoUso } from "@/componentes/distribucion/puntos/FormularioPuntoUso";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { opcionesFormularioPunto, subprocesoParaPunto } from "@/db/consultas/distribucion/puntos-uso";
import { exigirPermiso } from "@/lib/paginas";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Nuevo punto de uso — Administración SGC" };

export default async function PaginaNuevoPuntoUso({ searchParams }: { searchParams: Promise<{ subproceso?: string }> }) {
  await exigirPermiso("distribucion.gestionar");
  const idSub = Number((await searchParams).subproceso);
  const [opciones, sub] = await Promise.all([
    opcionesFormularioPunto(),
    Number.isInteger(idSub) && idSub > 0 ? subprocesoParaPunto(idSub) : null,
  ]);
  return (
    <div>
      <EncabezadoPagina
        titulo="Nuevo punto de uso"
        migas={[{ nombre: "Puntos de uso", href: "/admin/puntos-uso" }, { nombre: "Nuevo" }]}
      />
      <FormularioPuntoUso
        accion={crearPuntoUsoAccion}
        opciones={opciones}
        valores={{ nombre: sub?.nombre ?? "", sede: null, ubicacion: null, responsableId: null, procesoIds: sub ? [sub.procesoId] : [] }}
      />
    </div>
  );
}
