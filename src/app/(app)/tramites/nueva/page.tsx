import type { Metadata } from "next";
import { ClipboardList } from "lucide-react";
import { FormularioSolicitud } from "@/componentes/tramites/FormularioSolicitud";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { EstadoVacio } from "@/componentes/ui/EstadoVacio";
import { datosParaSolicitar } from "@/db/consultas/tramites";
import { exigirPermiso } from "@/lib/paginas";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Nueva solicitud" };

export default async function PaginaNuevaSolicitud({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sesion = await exigirPermiso("tramites.solicitar");
  const { documento } = await searchParams;
  const datos = await datosParaSolicitar(sesion);
  const codigo = typeof documento === "string" ? documento.trim().toUpperCase() : "";
  const elegido = datos.documentos.find((d) => d.codigo === codigo && !d.conTramite);
  const sinProcesos = datos.procesos.length === 0 && datos.documentos.length === 0;

  return (
    <div className="flex flex-col gap-6">
      <EncabezadoPagina
        migas={[{ nombre: "Trámites", href: "/tramites" }, { nombre: "Nueva solicitud" }]}
        titulo="Nueva solicitud"
        descripcion="Pida crear, modificar o eliminar un documento del sistema"
      />
      {sinProcesos ? (
        <EstadoVacio
          icono={ClipboardList}
          titulo="No tiene procesos asignados"
          texto="Para pedir un cambio debe liderar al menos un proceso activo. Pídalo al Administrador del SGC."
        />
      ) : (
        <FormularioSolicitud {...datos} documentoInicialId={elegido?.id} />
      )}
    </div>
  );
}
