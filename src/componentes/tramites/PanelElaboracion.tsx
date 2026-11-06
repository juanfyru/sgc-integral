"use client";

import Link from "next/link";
import { startTransition, useActionState, useState, type FormEvent } from "react";
import { enviarARevisionAccion, guardarControlCambiosAccion } from "@/app/acciones-tramites";
import { EliminarArchivo } from "@/componentes/admin/EliminarArchivo";
import { ZonaCarga } from "@/componentes/admin/ZonaCarga";
import { IconoFormato } from "@/componentes/documentos/IconoFormato";
import { ErrorAccion, Ocultos } from "@/componentes/tramites/AccionesSolicitud";
import { DialogoFirma } from "@/componentes/tramites/DialogoFirma";
import { ListaSoloLectura } from "@/componentes/tramites/ListaVerificacion";
import { Observaciones } from "@/componentes/tramites/Observaciones";
import { Boton } from "@/componentes/ui/Boton";
import { Campo, claseControl } from "@/componentes/ui/Campo";
import type { Observacion, RondaVerificacion } from "@/db/consultas/revision";
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
        {editable ? <EliminarArchivo direccion={`/api/tramites/${tramiteId}/archivos/${a.id}`} nombre={a.nombreOriginal} /> : null}
      </div>
    </li>
  );
}

/** Lo que se firma es lo guardado: con otro texto en pantalla, se firmaría sin darse cuenta. */
export function hayCambiosSinGuardar(escrito: string, guardado: string | null): boolean {
  return escrito.trim() !== (guardado ?? "").trim();
}

function FormularioControlCambios({
  tramite,
  guardado,
  escrito,
  alEscribir,
}: {
  tramite: TramiteParaElaborar;
  guardado: string | null;
  escrito: string;
  alEscribir: (texto: string) => void;
}) {
  const [estado, enviar, pendiente] = useActionState(guardarControlCambiosAccion, null);
  const [intentado, setIntentado] = useState(false);
  // Como en FormularioSolicitud: enviar desde una transición no reinicia el formulario.
  const alEnviar = (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault();
    const datos = new FormData(evento.currentTarget);
    setIntentado(true);
    startTransition(() => enviar(datos));
  };
  const confirmado = intentado && !pendiente && !estado && !hayCambiosSinGuardar(escrito, guardado);
  return (
    <form action={enviar} onSubmit={alEnviar} className="flex flex-col gap-2">
      <Ocultos tramite={tramite} />
      <Campo etiqueta="Control de cambios" nombre="resumenCambios" ayuda="Qué cambia en esta versión y por qué. Entre 5 y 2000 caracteres.">
        <textarea
          required
          minLength={5}
          maxLength={2000}
          rows={3}
          value={escrito}
          onChange={(evento) => alEscribir(evento.target.value)}
          className={claseControl}
        />
      </Campo>
      <ErrorAccion estado={estado} />
      <div className="flex flex-wrap items-center justify-end gap-3">
        <p role="status" className="text-sm text-estado-bien-texto">
          {confirmado ? "Control de cambios guardado" : ""}
        </p>
        <Boton type="submit" variante="secundario" pendiente={pendiente}>
          {pendiente ? "Guardando…" : "Guardar el control de cambios"}
        </Boton>
      </div>
    </form>
  );
}

export function EnvioARevision({
  tramite,
  huella,
  pideCodigo,
  sinGuardar,
}: {
  tramite: TramiteParaElaborar;
  huella: string | null;
  pideCodigo: boolean;
  sinGuardar: boolean;
}) {
  if (sinGuardar) {
    return (
      <div className="flex flex-col items-end gap-1">
        <Boton disabled aria-describedby="envio-sin-guardar">
          Enviar a revisión
        </Boton>
        <p id="envio-sin-guardar" className="text-sm text-muted-foreground">
          Guarde el control de cambios antes de enviar
        </p>
      </div>
    );
  }
  return (
    <DialogoFirma
      titulo="Firmar como «Elaboró»"
      etiquetaBoton="Enviar a revisión"
      resumen={{
        documento: [tramite.codigo, tramite.titulo].filter(Boolean).join(" "),
        version: tramite.versionNumero,
        huella,
      }}
      accion={enviarARevisionAccion}
      ocultos={{ id: String(tramite.id), etapa: tramite.etapa, ronda: String(tramite.ronda) }}
      pideCodigo={pideCodigo}
    />
  );
}

/**
 * El borrador de la versión en trámite (spec 13A §9.1). `editable` es para el elaborador en
 * elaboración, que además responde las observaciones; los demás, y él mismo después de enviar, lo ven en solo lectura.
 * `rondaAnterior` es la lista que dejó la revisión cuando el trámite vuelve a ajustes: sus notas también le hablan a quien elabora.
 */
export function PanelElaboracion({
  tramite,
  borrador,
  observaciones,
  rondaAnterior = null,
  editable,
  pideCodigo,
}: {
  tramite: TramiteParaElaborar;
  borrador: Borrador;
  observaciones: Observacion[];
  rondaAnterior?: RondaVerificacion | null;
  editable: boolean;
  pideCodigo: boolean;
}) {
  const { archivos, controlCambios, plantilla } = borrador;
  const principal = archivos.find((a) => a.rol === "principal");
  const [escrito, setEscrito] = useState(controlCambios ?? "");

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
        <FormularioControlCambios tramite={tramite} guardado={controlCambios} escrito={escrito} alEscribir={setEscrito} />
      ) : (
        <div>
          <h3 className="text-sm font-medium">Control de cambios</h3>
          <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">
            {controlCambios ?? "Todavía sin escribir."}
          </p>
        </div>
      )}

      {rondaAnterior ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">{`Lista de verificación de la ronda ${rondaAnterior.ronda}`}</h3>
          <ListaSoloLectura respuestas={rondaAnterior.respuestas} etiqueta={`Respuestas de la ronda ${rondaAnterior.ronda}`} />
        </div>
      ) : null}

      {observaciones.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">Observaciones</h3>
          <Observaciones tramite={tramite} observaciones={observaciones} puedeRevisar={false} puedeResponder={editable} />
        </div>
      ) : null}

      {editable ? (
        <div className="flex justify-end">
          <EnvioARevision
            tramite={tramite}
            huella={principal?.hashSha256 ?? null}
            pideCodigo={pideCodigo}
            sinGuardar={hayCambiosSinGuardar(escrito, controlCambios)}
          />
        </div>
      ) : null}
    </section>
  );
}
