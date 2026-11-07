import type { Metadata } from "next";
import { ListaAcusesPropios } from "@/componentes/distribucion/acuses/ListaAcusesPropios";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { acusesPropios } from "@/db/consultas/distribucion/acuses";
import { exigirSesion } from "@/lib/paginas";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Mis lecturas" };

export default async function PaginaMisAcuses() {
  const sesion = await exigirSesion();
  const acuses = await acusesPropios(sesion.usuarioId);
  return (
    <div className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Mis lecturas" descripcion="Los documentos que debe leer y los que ya confirmó" />
      <ListaAcusesPropios acuses={acuses} ahora={new Date()} />
    </div>
  );
}
