import type { Metadata } from "next";
import { guardarEntidadAccion } from "@/app/admin/acciones-entidad";
import { CargaLogo } from "@/componentes/admin/entidad/CargaLogo";
import { FormularioEntidad } from "@/componentes/admin/entidad/FormularioEntidad";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { obtenerEntidad, obtenerMarca } from "@/db/consultas/entidad";
import { exigirPermiso } from "@/lib/paginas";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Entidad y marca — Administración SGC" };

export default async function PaginaEntidad({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await exigirPermiso("entidad.administrar");
  const [entidad, marca, sp] = await Promise.all([obtenerEntidad(), obtenerMarca(), searchParams]);
  return (
    <>
      <EncabezadoPagina
        superior="Administración"
        titulo="Entidad y marca"
        descripcion="Nombre, logo y colores que ven todas las personas."
      />
      <div className="grid gap-8 lg:grid-cols-2">
        <FormularioEntidad accion={guardarEntidadAccion} entidad={entidad} guardado={sp.guardado === "1"}>
          <CargaLogo logo={marca.logo} />
        </FormularioEntidad>
      </div>
    </>
  );
}
