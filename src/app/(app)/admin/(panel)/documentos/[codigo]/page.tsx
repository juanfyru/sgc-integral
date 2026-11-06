import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  crearVersionAccion,
  descartarBorradorAccion,
  deshacerCargaAccion,
  editarVersionAccion,
  publicarAccion,
} from "@/app/admin/acciones";
import { EliminarArchivo } from "@/componentes/admin/EliminarArchivo";
import { FormAccion } from "@/componentes/admin/FormAccion";
import { FormularioVersionCliente } from "@/componentes/admin/FormularioVersionCliente";
import { ZonaCarga } from "@/componentes/admin/ZonaCarga";
import { EnlaceActa } from "@/componentes/tramites/EnlaceActa";
import { claseBoton } from "@/componentes/ui/Boton";
import { Campo, claseControl } from "@/componentes/ui/Campo";
import { InsigniaEstadoDocumento } from "@/componentes/ui/Insignia";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { avisoDePublicar, caminoDirecto, obtenerDocumentoAdmin, type VersionAdmin } from "@/db/consultas/admin";
import { obtenerConfigDocumental } from "@/db/consultas/config-documental";
import { puedePedirSobreDocumento } from "@/db/consultas/tramites";
import { exigirPermiso } from "@/lib/paginas";
import { puede } from "@/lib/permisos";
import { APROBACION_DE_VERSION, NUMERO_MAXIMO_DE_VERSION } from "@/lib/tramites/tipos";

export const metadata: Metadata = { title: "Documento — Administración SGC" };

function tamanoLegible(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** El número que propone para registrar de nuevo: el de la carga deshecha, si no choca con lo publicado. */
function numeroParaRegistrar(versiones: VersionAdmin[]): number {
  const numeros = (descartadas: boolean) =>
    versiones.filter((v) => (v.estado === "descartado") === descartadas).map((v) => v.numero);
  return Math.max(Math.max(0, ...numeros(false)) + 1, ...numeros(true));
}

function SeccionVersion({
  version,
  documentoId,
  nivelAcceso,
  puedeAdministrar,
  registrable,
  deshacible,
}: {
  version: VersionAdmin;
  documentoId: number;
  nivelAcceso: "general" | "restringido";
  puedeAdministrar: boolean;
  /** El camino directo puede dar de alta este documento (spec 13A §13.1). */
  registrable: boolean;
  /** El camino directo puede deshacer la versión vigente de este documento (spec 13A §13.2). */
  deshacible: boolean;
}) {
  const fueraDeCirculacion = version.estado === "obsoleto" || version.estado === "anulado";
  const borrador = version.estado === "borrador";
  // El borrador de un trámite se trabaja desde el trámite (spec 13A §9.1).
  const tramite = borrador ? version.tramite : null;
  const descartable = puedeAdministrar && borrador && !tramite;
  // El borrador que ya no se puede publicar por este camino solo se descarta (spec 13A §13.3).
  const editable = descartable && registrable;
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

      {version.origenAprobacion && (
        <p className="mb-2 text-sm text-muted-foreground">{APROBACION_DE_VERSION[version.origenAprobacion]}</p>
      )}

      <ul className="mb-3 flex flex-col gap-1 text-sm">
        {version.archivos.map((a) => (
          <li key={a.id} className="flex flex-wrap items-center gap-2">
            <a href={`/admin/api/archivos/${a.id}`} target="_blank" className="font-medium hover:underline">
              {a.nombreOriginal}
            </a>
            <span className="text-muted-foreground">
              {a.rol} · {a.mime} · {tamanoLegible(a.tamanoBytes)}
            </span>
            {editable && <EliminarArchivo direccion={`/admin/api/archivos/${a.id}`} />}
          </li>
        ))}
        {version.archivos.length === 0 && (
          <li className="text-muted-foreground">Sin archivos todavía.</li>
        )}
      </ul>

      {version.cierres.length > 0 && (
        <ul className="mb-2 flex list-none flex-wrap gap-x-4 gap-y-1 text-sm">
          {version.cierres.map((c) => (
            <li key={c.id} className="flex flex-wrap gap-x-4 gap-y-1">
              <EnlaceActa tramiteId={c.id} clase={c.etapa === "eliminado" ? "eliminacion" : "aprobacion"} />
              <Link href={`/tramites/${c.id}`} className="underline underline-offset-2">
                {c.etapa === "eliminado" ? "Trámite de eliminación" : "Trámite de aprobación"}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {puedeAdministrar && tramite && (
        <p className="text-sm text-muted-foreground">
          {"Esta versión está en un trámite: "}
          <Link href={`/tramites/${tramite.id}`} className="font-medium underline-offset-2 hover:underline">
            {tramite.numero}
          </Link>
        </p>
      )}

      {editable && (
        <div className="mb-4 flex flex-col gap-4">
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
            confirmacion={avisoDePublicar(nivelAcceso)}
            campos={{ versionId: version.id }}
          />
        </div>
      )}

      {descartable && (
        <FormAccion
          accion={descartarBorradorAccion}
          etiqueta="Descartar borrador"
          tono="peligro"
          confirmacion="El borrador pasa a descartado: conserva sus archivos y deja libre su número."
          campos={{ versionId: version.id }}
        />
      )}

      {deshacible && version.estado === "vigente" && (
        <FormAccion
          accion={deshacerCargaAccion}
          etiqueta="Deshacer carga"
          tono="peligro"
          confirmacion="La versión deja de estar vigente y pasa a descartada: conserva sus archivos y deja libre su número. El documento conserva su código, listo para registrarlo de nuevo."
          campos={{ documentoId }}
        >
          <Campo etiqueta="Motivo" nombre="motivo" ayuda="Entre 5 y 1000 caracteres.">
            <textarea required minLength={5} maxLength={1000} rows={2} className={`${claseControl} w-full`} />
          </Campo>
        </FormAccion>
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
  const [documento, config] = await Promise.all([
    obtenerDocumentoAdmin(decodeURIComponent(codigo), sesion),
    obtenerConfigDocumental(),
  ]);
  if (!documento) notFound();

  const { situacion } = documento;
  const vigente = documento.versiones.find((v) => v.estado === "vigente");
  const borrador = documento.versiones.find((v) => v.estado === "borrador");
  const puedePedirCambio = vigente ? await puedePedirSobreDocumento(sesion, documento.id) : false;
  const { registrable, deshacible } = caminoDirecto(situacion, config.publicacionDirecta);

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
              Editar datos
            </Link>
          ) : undefined
        }
      />

      <div className="flex flex-wrap items-start gap-3">
        {puedeAdministrar && registrable && !borrador && (
          <FormAccion accion={crearVersionAccion} etiqueta="Nueva versión (borrador)" campos={{ documentoId: documento.id }}>
            <Campo etiqueta="Versión con la que entra" nombre="numero">
              <input
                type="number"
                required
                min={1}
                max={NUMERO_MAXIMO_DE_VERSION}
                step={1}
                defaultValue={numeroParaRegistrar(documento.versiones)}
                className={`${claseControl} w-32`}
              />
            </Campo>
          </FormAccion>
        )}
        {puedePedirCambio && (
          <Link href={`/tramites/nueva?documento=${encodeURIComponent(documento.codigo)}`} className={claseBoton("secundario")}>
            Solicitar cambio
          </Link>
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
            documentoId={documento.id}
            nivelAcceso={documento.nivelAcceso}
            puedeAdministrar={puedeAdministrar}
            registrable={registrable}
            deshacible={puedeAdministrar && deshacible}
          />
        ))}
      </div>
    </div>
  );
}
