import type { Metadata } from "next";
import { crearDocumentoAccion } from "@/app/admin/acciones";
import { FormularioDocumento } from "@/componentes/admin/FormularioDocumento";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { listarMapaParaFormulario, listarTiposActivos } from "@/db/consultas/admin";
import { exigirPermiso } from "@/lib/paginas";

export const metadata: Metadata = { title: "Nuevo documento — Administración SGC" };

export default async function PaginaNuevoDocumento() {
  await exigirPermiso("documentos.administrar");
  const [tipos, procesos] = await Promise.all([
    listarTiposActivos(),
    listarMapaParaFormulario(),
  ]);
  return (
    <div>
      <EncabezadoPagina
        titulo="Nuevo documento"
        descripcion="Se crea con su versión 1 en borrador: nada será visible al público hasta que la publique."
      />
      <FormularioDocumento
        accion={crearDocumentoAccion}
        tipos={tipos}
        procesos={procesos}
        codigoEditable
      />
    </div>
  );
}
