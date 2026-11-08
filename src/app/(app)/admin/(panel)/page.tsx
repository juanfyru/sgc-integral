import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { TablaDocumentosAdmin } from "@/componentes/admin/TablaDocumentosAdmin";
import { documentosEnElSgc, estadosDeDocumento, listarDocumentosAdmin } from "@/db/consultas/admin";
import { obtenerConfigDocumental } from "@/db/consultas/config-documental";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { claseBoton } from "@/componentes/ui/Boton";
import { exigirEntradaPanel } from "@/lib/paginas";
import { puede } from "@/lib/permisos";

export const metadata: Metadata = { title: "Documentos — Administración SGC" };

export default async function PaginaDocumentosAdmin() {
  const sesion = await exigirEntradaPanel();
  // Gerencia entra al panel pero no ve el historial documental: aterriza en estadísticas.
  if (!puede(sesion, "documentos.ver_historial")) redirect("/admin/estadisticas");
  const [documentos, config] = await Promise.all([listarDocumentosAdmin(sesion), obtenerConfigDocumental()]);
  const enElSgc = documentosEnElSgc(documentos);

  return (
    <div>
      <EncabezadoPagina
        titulo="Documentos"
        descripcion={`${enElSgc} ${enElSgc === 1 ? "documento" : "documentos"} en el SGC`}
        acciones={
          puede(sesion, "documentos.administrar") && config.publicacionDirecta ? (
            <Link href="/admin/documentos/nuevo" className={claseBoton("primario")}>
              Registrar documento ya aprobado
            </Link>
          ) : undefined
        }
      />

      <TablaDocumentosAdmin
        filas={documentos.map((d) => ({
          id: d.id,
          codigo: d.codigo,
          titulo: d.titulo,
          tipoNombre: d.tipoNombre,
          procesos: d.procesos,
          estados: estadosDeDocumento(d),
        }))}
      />
    </div>
  );
}
