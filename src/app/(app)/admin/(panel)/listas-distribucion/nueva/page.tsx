import type { Metadata } from "next";
import { crearListaAccion } from "@/app/admin/acciones-listas";
import { FormularioLista } from "@/componentes/distribucion/listas/FormularioLista";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { opcionesFormularioLista } from "@/db/consultas/distribucion/listas";
import { exigirPermiso } from "@/lib/paginas";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Nueva lista de distribución — Administración SGC" };

export default async function PaginaNuevaLista() {
  await exigirPermiso("distribucion.gestionar");
  const opciones = await opcionesFormularioLista();
  return (
    <div>
      <EncabezadoPagina
        titulo="Nueva lista de distribución"
        migas={[{ nombre: "Listas de distribución", href: "/admin/listas-distribucion" }, { nombre: "Nueva" }]}
      />
      <FormularioLista accion={crearListaAccion} opciones={opciones} valores={{ nombre: "", descripcion: null, miembros: [] }} />
    </div>
  );
}
