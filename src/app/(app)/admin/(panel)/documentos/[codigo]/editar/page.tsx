import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { editarCatalogoAccion, editarControlAccion } from "@/app/admin/acciones";
import { FormularioCatalogo, FormularioControl } from "@/componentes/admin/FormularioDocumento";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import {
  documentosRelacionables,
  edicionDeControl,
  listarDocumentosAdmin,
  listarMapaParaFormulario,
  listarTiposActivos,
  obtenerDocumentoAdmin,
} from "@/db/consultas/admin";
import { obtenerConfigDocumental } from "@/db/consultas/config-documental";
import { exigirPermiso } from "@/lib/paginas";

export const metadata: Metadata = { title: "Editar documento — Administración SGC" };

const claseSeccion = "flex flex-col gap-4 rounded-xl border border-border bg-card p-4 shadow-xs";

export default async function PaginaEditarDocumento({
  params,
}: {
  params: Promise<{ codigo: string }>;
}) {
  const sesion = await exigirPermiso("documentos.administrar");
  const { codigo } = await params;
  const [documento, tipos, procesos, documentos, config] = await Promise.all([
    obtenerDocumentoAdmin(decodeURIComponent(codigo), sesion),
    listarTiposActivos(),
    listarMapaParaFormulario(),
    listarDocumentosAdmin(sesion),
    obtenerConfigDocumental(),
  ]);
  if (!documento) notFound();

  const { situacion } = documento;
  const propietario = documento.asociaciones.find((a) => a.esPrincipal);
  const razonDelPropietario = situacion.publicado
    ? "No cambia: es parte del código."
    : situacion.tramiteAbierto
      ? "Se corrige desde el trámite."
      : null;

  return (
    <div className="flex flex-col gap-6">
      <EncabezadoPagina codigo={documento.codigo} titulo="Editar documento" descripcion={documento.titulo} />

      <section aria-labelledby="titulo-control" className={claseSeccion}>
        <div>
          <h2 id="titulo-control" className="font-display text-lg font-semibold">Datos de control</h2>
          <p className="text-sm text-muted-foreground">Identifican al documento.</p>
        </div>
        <FormularioControl
          accion={editarControlAccion}
          tipos={tipos}
          documentoId={documento.id}
          valores={{
            codigo: documento.codigo,
            titulo: documento.titulo,
            tipoId: documento.tipoId,
            tipoNombre: documento.tipoNombre,
          }}
          edicion={edicionDeControl(situacion, config.publicacionDirecta)}
        />
      </section>

      <section aria-labelledby="titulo-catalogo" className={claseSeccion}>
        <div>
          <h2 id="titulo-catalogo" className="font-display text-lg font-semibold">Datos de catálogo</h2>
          <p className="text-sm text-muted-foreground">
            No son parte del contenido aprobado: se editan en cualquier momento y cada cambio queda en la bitácora. Un cambio de
            nivel de acceso rige de inmediato.
          </p>
        </div>
        <FormularioCatalogo
          accion={editarCatalogoAccion}
          procesos={procesos}
          documentos={documentosRelacionables(documentos, documento)}
          documentoId={documento.id}
          codigo={documento.codigo}
          valores={{
            descripcion: documento.descripcion,
            palabrasClave: documento.palabrasClave,
            nivelAcceso: documento.nivelAcceso,
            asociaciones: documento.asociaciones,
            relacionados: documento.relacionados,
          }}
          propietarioFijo={propietario && razonDelPropietario ? { nombre: propietario.nombre, razon: razonDelPropietario } : undefined}
        />
      </section>
    </div>
  );
}
