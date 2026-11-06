import { ClipboardList } from "lucide-react";
import type { Metadata } from "next";
import { crearDocumentoAccion } from "@/app/admin/acciones";
import { FormularioDocumento } from "@/componentes/admin/FormularioDocumento";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { EstadoVacio } from "@/componentes/ui/EstadoVacio";
import {
  documentosRelacionables,
  listarDocumentosAdmin,
  listarMapaParaFormulario,
  listarTiposActivos,
} from "@/db/consultas/admin";
import { obtenerConfigDocumental } from "@/db/consultas/config-documental";
import { exigirPermiso } from "@/lib/paginas";

export const metadata: Metadata = { title: "Registrar documento ya aprobado — Administración SGC" };

export default async function PaginaNuevoDocumento() {
  const sesion = await exigirPermiso("documentos.administrar");
  const config = await obtenerConfigDocumental();
  if (!config.publicacionDirecta) {
    return (
      <div>
        <EncabezadoPagina titulo="Registrar documento ya aprobado" />
        <EstadoVacio
          icono={ClipboardList}
          titulo="La carga de documentos ya aprobados está cerrada"
          texto="Los documentos nuevos se piden por trámite: la solicitud pasa por el visto bueno, la elaboración, la revisión y la aprobación."
          accion={{ href: "/tramites/nueva", etiqueta: "Nueva solicitud" }}
        />
      </div>
    );
  }
  const [tipos, procesos, documentos] = await Promise.all([
    listarTiposActivos(),
    listarMapaParaFormulario(),
    listarDocumentosAdmin(sesion),
  ]);
  return (
    <div>
      <EncabezadoPagina
        titulo="Registrar documento ya aprobado"
        descripcion="Para los documentos aprobados fuera de la plataforma. Entra en borrador, con su número real de versión: nadie lo verá hasta que lo publique."
      />
      <FormularioDocumento
        accion={crearDocumentoAccion}
        tipos={tipos}
        procesos={procesos}
        documentos={documentosRelacionables(documentos)}
        formatoCodigo={config.formatoCodigo}
      />
    </div>
  );
}
