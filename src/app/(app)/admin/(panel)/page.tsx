import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { listarDocumentosAdmin, type FilaDocumentoAdmin } from "@/db/consultas/admin";
import { obtenerConfigDocumental } from "@/db/consultas/config-documental";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { claseBoton } from "@/componentes/ui/Boton";
import { InsigniaEstadoDocumento } from "@/componentes/ui/Insignia";
import { TablaDatos, celda, type ColumnaTabla } from "@/componentes/ui/TablaDatos";
import { exigirEntradaPanel } from "@/lib/paginas";
import { puede } from "@/lib/permisos";

export const metadata: Metadata = { title: "Documentos — Administración SGC" };

const COLUMNAS: readonly ColumnaTabla[] = [
  { clave: "codigo", etiqueta: "Código" },
  { clave: "titulo", etiqueta: "Título" },
  { clave: "tipo", etiqueta: "Tipo" },
  { clave: "estado", etiqueta: "Estado" },
];

/** Sin versión vigente ni borrador, el estado del documento es el de lo que queda de él. */
const estadoSinVersionActiva = (d: FilaDocumentoAdmin) => (d.anulado ? "anulado" : d.descartado ? "descartado" : "obsoleto");

export default async function PaginaDocumentosAdmin() {
  const sesion = await exigirEntradaPanel();
  // Gerencia entra al panel pero no ve el historial documental: aterriza en estadísticas.
  if (!puede(sesion, "documentos.ver_historial")) redirect("/admin/estadisticas");
  const [documentos, config] = await Promise.all([listarDocumentosAdmin(sesion), obtenerConfigDocumental()]);
  // Uno con todas sus versiones descartadas se lista para poder revisarlo, pero no es un documento del SGC.
  const enElSgc = documentos.filter((d) => !d.descartado).length;

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

      <TablaDatos titulo="Documentos del SGC" columnas={COLUMNAS} filas={documentos.length} vacio="Sin documentos">
        {documentos.map((d) => (
          <tr key={d.id} className="hover:bg-muted/50">
            <td className={`${celda} font-mono`}>
              <Link href={`/admin/documentos/${d.codigo}`} className="hover:underline">
                {d.codigo}
              </Link>
            </td>
            <td className={celda}>{d.titulo}</td>
            <td className={celda}>{d.tipoNombre}</td>
            <td className={celda}>
              <span className="flex flex-wrap gap-1">
                {d.versionVigente !== null && <InsigniaEstadoDocumento estado="vigente" />}
                {d.versionBorrador !== null && <InsigniaEstadoDocumento estado="borrador" />}
                {d.versionVigente === null && d.versionBorrador === null && (
                  <InsigniaEstadoDocumento estado={estadoSinVersionActiva(d)} />
                )}
              </span>
            </td>
          </tr>
        ))}
      </TablaDatos>
    </div>
  );
}
