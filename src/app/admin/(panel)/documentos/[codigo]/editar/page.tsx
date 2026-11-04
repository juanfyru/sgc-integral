import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { editarDocumentoAccion } from "@/app/admin/acciones";
import { FormularioDocumento } from "@/componentes/admin/FormularioDocumento";
import {
  listarMapaParaFormulario,
  listarTiposActivos,
  obtenerDocumentoAdmin,
} from "@/db/consultas/admin";
import { exigirPermiso } from "@/lib/paginas";

export const metadata: Metadata = { title: "Editar documento — Administración SGC" };

export default async function PaginaEditarDocumento({
  params,
}: {
  params: Promise<{ codigo: string }>;
}) {
  await exigirPermiso("documentos.administrar");
  const { codigo } = await params;
  const [documento, tipos, procesos] = await Promise.all([
    obtenerDocumentoAdmin(decodeURIComponent(codigo)),
    listarTiposActivos(),
    listarMapaParaFormulario(),
  ]);
  if (!documento) notFound();

  return (
    <main>
      <h1 className="mb-6 font-display text-2xl font-semibold">
        Editar {documento.codigo}
      </h1>
      <FormularioDocumento
        accion={editarDocumentoAccion}
        tipos={tipos}
        procesos={procesos}
        documentoId={documento.id}
        codigoEditable={!documento.publicado}
        valores={{
          codigo: documento.codigo,
          titulo: documento.titulo,
          tipoId: documento.tipoId,
          descripcion: documento.descripcion,
          palabrasClave: documento.palabrasClave,
          asociaciones: documento.asociaciones,
        }}
      />
    </main>
  );
}
