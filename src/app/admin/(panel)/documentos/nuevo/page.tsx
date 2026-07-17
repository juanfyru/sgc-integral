import type { Metadata } from "next";
import { crearDocumentoAccion } from "@/app/admin/acciones";
import { FormularioDocumento } from "@/componentes/admin/FormularioDocumento";
import { listarMapaParaFormulario, listarTiposActivos } from "@/db/consultas/admin";

export const metadata: Metadata = { title: "Nuevo documento — Administración SGC" };

export default async function PaginaNuevoDocumento() {
  const [tipos, procesos] = await Promise.all([
    listarTiposActivos(),
    listarMapaParaFormulario(),
  ]);
  return (
    <main>
      <h1 className="mb-2 font-display text-2xl font-semibold">Nuevo documento</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Se crea con su versión 1 en borrador: nada será visible al público
        hasta que la publique.
      </p>
      <FormularioDocumento
        accion={crearDocumentoAccion}
        tipos={tipos}
        procesos={procesos}
        codigoEditable
      />
    </main>
  );
}
