import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  anularAccion,
  crearVersionAccion,
  editarVersionAccion,
  publicarAccion,
} from "@/app/admin/acciones";
import { EliminarArchivo } from "@/componentes/admin/EliminarArchivo";
import { FormAccion } from "@/componentes/admin/FormAccion";
import { FormularioVersionCliente } from "@/componentes/admin/FormularioVersionCliente";
import { ZonaCarga } from "@/componentes/admin/ZonaCarga";
import { claseBoton } from "@/componentes/ui/Boton";
import { InsigniaEstadoDocumento } from "@/componentes/ui/Insignia";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { obtenerDocumentoAdmin, type VersionAdmin } from "@/db/consultas/admin";
import { exigirPermiso } from "@/lib/paginas";
import { puede } from "@/lib/permisos";

export const metadata: Metadata = { title: "Documento — Administración SGC" };

function tamanoLegible(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function SeccionVersion({
  version,
  vigenteExiste,
  puedeAdministrar,
}: {
  version: VersionAdmin;
  vigenteExiste: boolean;
  puedeAdministrar: boolean;
}) {
  const fueraDeCirculacion = version.estado === "obsoleto" || version.estado === "anulado";
  return (
    <section
      className={`rounded-lg border p-4 ${fueraDeCirculacion ? "marca-estado" : ""}`}
      data-marca={fueraDeCirculacion ? version.estado.toUpperCase() : undefined}
      aria-label={`Versión ${version.numero}, ${version.estado}`}
    >
      <header className="mb-3 flex items-center gap-3">
        <h3 className="font-display text-lg font-semibold">Versión {version.numero}</h3>
        <InsigniaEstadoDocumento estado={version.estado} />
      </header>

      <ul className="mb-3 flex flex-col gap-1 text-sm">
        {version.archivos.map((a) => (
          <li key={a.id} className="flex flex-wrap items-center gap-2">
            <a href={`/admin/api/archivos/${a.id}`} target="_blank" className="font-medium hover:underline">
              {a.nombreOriginal}
            </a>
            <span className="text-muted-foreground">
              {a.rol} · {a.mime} · {tamanoLegible(a.tamanoBytes)}
            </span>
            {puedeAdministrar && version.estado === "borrador" && <EliminarArchivo direccion={`/admin/api/archivos/${a.id}`} />}
          </li>
        ))}
        {version.archivos.length === 0 && (
          <li className="text-muted-foreground">Sin archivos todavía.</li>
        )}
      </ul>

      {puedeAdministrar && version.estado === "borrador" && (
        <div className="flex flex-col gap-4">
          <ZonaCarga direccion={`/admin/api/archivos?version=${version.id}`} />

          <details className="rounded-md border p-3" open={!version.aprobo}>
            <summary className="cursor-pointer text-sm font-medium">
              Control de la versión (elaboró / revisó / aprobó)
            </summary>
            <FormularioVersionCliente
              versionId={version.id}
              valores={version}
              accion={editarVersionAccion}
            />
          </details>

          <FormAccion
            accion={publicarAccion}
            etiqueta={`Publicar versión ${version.numero}`}
            confirmacion={
              vigenteExiste
                ? "La versión vigente actual pasará a OBSOLETO en el mismo instante. Los funcionarios verán esta versión de inmediato."
                : "El documento quedará visible para todo el hospital."
            }
            campos={{ versionId: version.id }}
          />
        </div>
      )}
      {version.resumenCambios && (
        <p className="mt-2 text-sm text-muted-foreground">Cambios: {version.resumenCambios}</p>
      )}
    </section>
  );
}

export default async function PaginaDocumentoAdmin({
  params,
}: {
  params: Promise<{ codigo: string }>;
}) {
  const sesion = await exigirPermiso("documentos.ver_historial");
  const puedeAdministrar = puede(sesion, "documentos.administrar");
  const { codigo } = await params;
  const documento = await obtenerDocumentoAdmin(decodeURIComponent(codigo), sesion);
  if (!documento) notFound();

  const vigente = documento.versiones.find((v) => v.estado === "vigente");
  const borrador = documento.versiones.find((v) => v.estado === "borrador");

  return (
    <div className="flex flex-col gap-6">
      <EncabezadoPagina
        codigo={documento.codigo}
        titulo={documento.titulo}
        descripcion={`${documento.tipoNombre} · Aplica en: ${documento.asociaciones
          .map((a) => (a.esPrincipal ? `${a.nombre} (propietario)` : a.nombre))
          .join(" · ")}`}
        acciones={
          puedeAdministrar ? (
            <Link href={`/admin/documentos/${documento.codigo}/editar`} className={claseBoton("secundario")}>
              Editar metadatos
            </Link>
          ) : undefined
        }
      />

      <div className="flex flex-wrap gap-3">
        {puedeAdministrar && !borrador && (
          <FormAccion
            accion={crearVersionAccion}
            etiqueta="Nueva versión (borrador)"
            campos={{ documentoId: documento.id }}
          />
        )}
        {puedeAdministrar && vigente && (
          <FormAccion
            accion={anularAccion}
            etiqueta="Anular documento"
            tono="peligro"
            confirmacion="El documento saldrá de circulación SIN versión de reemplazo. Dejará de ser visible para los funcionarios. La versión queda retenida como ANULADO."
            campos={{ documentoId: documento.id }}
          />
        )}
        {vigente && (
          <Link
            href={`/documentos/${documento.codigo}`}
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
          >
            Ver ficha pública
          </Link>
        )}
      </div>

      <div className="flex flex-col gap-4">
        {documento.versiones.map((v) => (
          <SeccionVersion
            key={v.id}
            version={v}
            vigenteExiste={Boolean(vigente)}
            puedeAdministrar={puedeAdministrar}
          />
        ))}
      </div>
    </div>
  );
}
