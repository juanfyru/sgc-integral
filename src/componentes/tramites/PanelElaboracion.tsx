"use client";

import Link from "next/link";
import { startTransition, useActionState, type FormEvent } from "react";
import { enviarARevisionAccion, guardarControlCambiosAccion } from "@/app/acciones-tramites";
import { EliminarArchivo } from "@/componentes/admin/EliminarArchivo";
import { ZonaCarga } from "@/componentes/admin/ZonaCarga";
import { IconoFormato } from "@/componentes/documentos/IconoFormato";
import { ErrorAccion, Ocultos } from "@/componentes/tramites/AccionesSolicitud";
import { DialogoFirma } from "@/componentes/tramites/DialogoFirma";
import { Boton } from "@/componentes/ui/Boton";
import { Campo, claseControl } from "@/componentes/ui/Campo";
import type { ArchivoDeBorrador, Borrador } from "@/db/consultas/tramites-archivos";
import { huellaAbreviada, type Etapa } from "@/lib/tramites/tipos";

export type TramiteParaElaborar = {
  id: number;
  etapa: Etapa;
  ronda: number;
  codigo: string | null;
  titulo: string;
  versionNumero: number | null;
};

const ETIQUETA_ROL: Record<ArchivoDeBorrador["rol"], string> = {
  principal: "Principal",
  editable: "Editable",
  anexo: "Anexo",
};

function FilaArchivo({ tramiteId, archivo: a, editable }: { tramiteId: number; archivo: ArchivoDeBorrador; editable: boolean }) {
  return (
    <li className="flex flex-col gap-1 border-b border-border pb-2 last:border-b-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
      <div className="min-w-0">
        <a
          href={`/tramites/${tramiteId}/archivos/${a.id}/${encodeURIComponent(a.nombreOriginal)}`}
          target="_blank"
          rel="noopener"
          className="break-words text-sm font-medium hover:underline"
        >
          {a.nombreOriginal}
        </a>
        <p className="text-xs text-muted-foreground">
          {`${ETIQUETA_ROL[a.rol]} · huella `}
          <span className="font-mono">{huellaAbreviada(a.hashSha256)}</span>
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <IconoFormato mime={a.mime} tamanoBytes={a.tamanoBytes} />
        {editable ? <EliminarArchivo direccion={`/api/tramites/${tramiteId}/archivos/${a.id}`} /> : null}
      </div>
    </li>
  );
}

function FormularioControlCambios({ tramite, texto }: { tramite: TramiteParaElaborar; texto: string | null }) {
  const [estado, enviar, pendiente] = useActionState(guardarControlCambiosAccion, null);
  const enviado = estado?.valores?.resumenCambios;
  // Como en FormularioSolicitud: enviar desde una transición no borra lo escrito tras un rechazo.
  const alEnviar = (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault();
    const datos = new FormData(evento.currentTarget);
    startTransition(() => enviar(datos));
  };
  return (
    <form action={enviar} onSubmit={alEnviar} className="flex flex-col gap-2">
      <Ocultos tramite={tramite} />
      <Campo etiqueta="Control de cambios" nombre="resumenCambios" ayuda="Qué cambia en esta versión y por qué. Entre 5 y 2000 caracteres.">
        <textarea
          required
          minLength={5}
          maxLength={2000}
          rows={3}
          defaultValue={typeof enviado === "string" ? enviado : (texto ?? "")}
          className={claseControl}
        />
      </Campo>
      <ErrorAccion estado={estado} />
      <div className="flex justify-end">
        <Boton type="submit" variante="secundario" pendiente={pendiente}>
          {pendiente ? "Guardando…" : "Guardar el control de cambios"}
        </Boton>
      </div>
    </form>
  );
}

/**
 * El borrador de la versión en trámite (spec 13A §9.1). `editable` es para el elaborador en
 * elaboración; los demás, y él mismo después de enviar, lo ven en solo lectura.
 */
export function PanelElaboracion({
  tramite,
  borrador,
  editable,
  pideCodigo,
}: {
  tramite: TramiteParaElaborar;
  borrador: Borrador;
  editable: boolean;
  pideCodigo: boolean;
}) {
  const { archivos, controlCambios, plantilla, observaciones } = borrador;
  const principal = archivos.find((a) => a.rol === "principal");

  return (
    <section
      aria-labelledby="titulo-borrador"
      data-marca="EN TRÁMITE"
      className="marca-estado flex min-w-0 flex-col gap-4 rounded-xl border border-border bg-card p-4 shadow-xs"
    >
      <h2 id="titulo-borrador" className="min-h-12 pr-16 text-sm font-semibold">
        {tramite.versionNumero === null ? "Borrador" : `Borrador de la versión ${tramite.versionNumero}`}
      </h2>

      {plantilla ? (
        <p className="text-sm">
          {"Plantilla vigente: "}
          <Link href={`/documentos/${plantilla.codigo}`} className="font-medium underline-offset-2 hover:underline">
            {`${plantilla.codigo}, versión ${plantilla.version}`}
          </Link>
        </p>
      ) : null}

      {archivos.length > 0 ? (
        <ul className="flex list-none flex-col gap-2">
          {archivos.map((a) => (
            <FilaArchivo key={a.id} tramiteId={tramite.id} archivo={a} editable={editable} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Todavía no hay archivos.</p>
      )}
      {editable ? <ZonaCarga direccion={`/api/tramites/${tramite.id}/archivos`} /> : null}

      {editable ? (
        <FormularioControlCambios tramite={tramite} texto={controlCambios} />
      ) : (
        <div>
          <h3 className="text-sm font-medium">Control de cambios</h3>
          <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">
            {controlCambios ?? "Todavía sin escribir."}
          </p>
        </div>
      )}

      {observaciones.length > 0 ? (
        <div>
          <h3 className="mb-1 text-sm font-medium">Observaciones abiertas</h3>
          <ol className="flex list-none flex-col gap-2">
            {observaciones.map((o) => (
              <li key={o.numero} className="text-sm">
                <span className="whitespace-pre-wrap break-words">{`${o.numero}. ${o.texto}`}</span>
                <span className="block whitespace-pre-wrap break-words text-xs text-muted-foreground">
                  {o.respuesta ? `Respuesta: ${o.respuesta}` : "Sin respuesta"}
                </span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {editable ? (
        <div className="flex justify-end">
          <DialogoFirma
            titulo="Firmar como «Elaboró»"
            etiquetaBoton="Enviar a revisión"
            resumen={{
              documento: [tramite.codigo, tramite.titulo].filter(Boolean).join(" "),
              version: tramite.versionNumero,
              huella: principal?.hashSha256 ?? null,
            }}
            accion={enviarARevisionAccion}
            ocultos={{ id: String(tramite.id), etapa: tramite.etapa, ronda: String(tramite.ronda) }}
            pideCodigo={pideCodigo}
          />
        </div>
      ) : null}
    </section>
  );
}
