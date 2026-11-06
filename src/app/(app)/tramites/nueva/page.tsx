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
  const pedido = datos.documentos.find((d) => d.codigo === codigo);
  const elegido = pedido?.conTramite ? undefined : pedido;
  const sinProcesos = datos.procesos.length === 0 && datos.documentos.length === 0;

  return (
    <div className="flex flex-col gap-6">
      <EncabezadoPagina
        migas={[{ nombre: "Trámites", href: "/tramites" }, { nombre: "Nueva solicitud" }]}
        titulo="Nueva solicitud"
        descripcion="Pida crear, modificar o eliminar un documento del sistema"
      />
      {pedido?.conTramite ? (
        <p role="note" className="rounded-md border border-estado-atencion bg-estado-atencion-fondo px-4 py-3 text-sm text-estado-atencion-texto">
          {`${pedido.codigo} ya tiene un trámite abierto: no admite otra solicitud hasta que ese se cierre.`}
        </p>
      ) : null}
      {/* El mismo aviso si no existe, si no se ve o si es de otro proceso: la dirección no revela cuál de las tres es. */}
      {codigo && !pedido ? (
        <p role="note" className="rounded-md border border-estado-atencion bg-estado-atencion-fondo px-4 py-3 text-sm text-estado-atencion-texto">
          No puede pedir un cambio sobre ese documento: solo sobre los documentos vigentes de sus procesos.
        </p>
      ) : null}
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
