"use client";

import Link from "next/link";
import { startTransition, useActionState, useState, type FormEvent } from "react";
import { crearSolicitudAccion } from "@/app/acciones-tramites";
import { Boton, claseBoton } from "@/componentes/ui/Boton";
import { Campo, claseControl } from "@/componentes/ui/Campo";
import type { DatosParaSolicitar } from "@/db/consultas/tramites";
import {
  ETIQUETA_MOTIVO,
  ETIQUETA_TIPO_SOLICITUD,
  MOTIVOS,
  TIPOS_SOLICITUD,
  type Motivo,
  type TipoSolicitud,
} from "@/lib/tramites/tipos";

/** La revisión anual abierta de la que nace la solicitud: sobre un documento, su decisión en la campaña. */
type RevisionDeOrigen = { id: number; anio: number };

/** El impacto normativo que la solicitud atiende: del documento inicial o, `deProceso`, del proceso inicial al crear. */
type ImpactoDeOrigen = { id: number; norma: string; proceso: string; deProceso: boolean };

/**
 * Los valores iniciales llegan de la dirección (`/tramites/nueva?documento=…&tipo=…&motivo=…`), ya validados por la
 * página; la revisión anual y el impacto de los que nace la solicitud viajan como campos ocultos mientras la solicitud
 * siga siendo la que los trajo (`ocultosDeSolicitud`).
 */
type Props = DatosParaSolicitar & {
  documentoInicialId?: number;
  tipoInicial?: TipoSolicitud;
  motivoInicial?: Motivo;
  procesoInicialId?: number;
  revisionAnual?: RevisionDeOrigen;
  impacto?: ImpactoDeOrigen;
};

/**
 * Qué viaja oculto con lo que la persona tiene elegido: la revisión, con un documento (modificar o eliminar: es su
 * decisión en la campaña); el impacto de un documento, mientras el documento es el inicial, y el de un proceso, mientras
 * se crea en el proceso inicial. Si no, el envío quedaría enlazado a algo que no atiende o condenado a fallar.
 */
export function ocultosDeSolicitud(
  actual: { tipo: TipoSolicitud; documentoId: string; procesoId: string },
  inicial: { documentoInicialId?: number; procesoInicialId?: number; revisionAnual?: RevisionDeOrigen; impacto?: ImpactoDeOrigen },
): { revisionAnualId: number | null; impactoId: number | null } {
  const conDocumento = actual.tipo !== "crear" && actual.documentoId !== "";
  const { impacto } = inicial;
  const impactoVigente = impacto
    ? impacto.deProceso
      ? actual.tipo === "crear" && inicial.procesoInicialId !== undefined && actual.procesoId === String(inicial.procesoInicialId)
      : conDocumento && inicial.documentoInicialId !== undefined && actual.documentoId === String(inicial.documentoInicialId)
    : false;
  return {
    revisionAnualId: inicial.revisionAnual && conDocumento ? inicial.revisionAnual.id : null,
    impactoId: impacto && impactoVigente ? impacto.id : null,
  };
}

/** La justificación con que llega una solicitud de la revisión anual (spec 13C §9.3); una creación no la lleva. */
export function fraseDeRevision(anio: number, tipo: TipoSolicitud): string {
  if (tipo === "crear") return "";
  return `Decisión de la revisión anual ${anio}: el documento debe ${tipo === "eliminar" ? "eliminarse" : "actualizarse"}.`;
}

/** Al cambiar el tipo, la frase prellenada que nadie tocó sigue al tipo nuevo; lo que la persona escribió se respeta. */
export function justificacionTrasCambio(actual: string, anio: number | undefined, de: TipoSolicitud, a: TipoSolicitud): string {
  if (anio === undefined) return actual;
  return actual === fraseDeRevision(anio, de) ? fraseDeRevision(anio, a) : actual;
}

const NOTA = "rounded-md border border-border bg-muted px-4 py-3 text-sm";

export function FormularioSolicitud({
  procesos,
  tipos,
  documentos,
  documentoInicialId,
  tipoInicial,
  motivoInicial,
  procesoInicialId,
  revisionAnual,
  impacto,
}: Props) {
  const [estado, enviar, pendiente] = useActionState(crearSolicitudAccion, null);
  const enviado = (campo: string): string | undefined => {
    const v = estado?.valores?.[campo];
    return typeof v === "string" ? v : undefined;
  };
  const tipoDeInicio = tipoInicial ?? (documentoInicialId ? "modificar" : "crear");
  const [tipo, setTipo] = useState<TipoSolicitud>(tipoDeInicio);
  const [procesoId, setProcesoId] = useState(
    procesoInicialId !== undefined ? String(procesoInicialId) : procesos.length === 1 ? String(procesos[0].id) : "",
  );
  // Sin JavaScript, el formulario vuelve con lo enviado (`enviado`); con él, el estado ya lo conserva.
  const [documentoId, setDocumentoId] = useState(enviado("documentoId") ?? (documentoInicialId !== undefined ? String(documentoInicialId) : ""));
  const [justificacion, setJustificacion] = useState(
    enviado("justificacion") ?? (revisionAnual ? fraseDeRevision(revisionAnual.anio, tipoDeInicio) : ""),
  );
  const subprocesos = procesos.find((p) => String(p.id) === procesoId)?.subprocesos ?? [];
  const ocultos = ocultosDeSolicitud({ tipo, documentoId, procesoId }, { documentoInicialId, procesoInicialId, revisionAnual, impacto });
  const cambiarTipo = (nuevo: TipoSolicitud) => {
    setJustificacion((actual) => justificacionTrasCambio(actual, revisionAnual?.anio, tipo, nuevo));
    setTipo(nuevo);
  };

  // React reinicia un <form action> al terminar la acción, y los controles controlados quedan
  // distintos de su estado: el reenvío mandaría otro tipo de trámite. Enviar desde una transición
  // no reinicia nada. `action` queda para cuando aún no hay JavaScript, y solo entonces hacen
  // falta los valores por defecto con lo enviado.
  const alEnviar = (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault();
    const datos = new FormData(evento.currentTarget);
    startTransition(() => enviar(datos));
  };

  return (
    <form action={enviar} onSubmit={alEnviar} className="flex max-w-2xl flex-col gap-5">
      {ocultos.revisionAnualId !== null && revisionAnual ? (
        <>
          <input type="hidden" name="revisionAnualId" value={ocultos.revisionAnualId} />
          <p role="note" className={NOTA}>
            {`Esta solicitud nace de la revisión anual ${revisionAnual.anio}: al enviarla queda como la decisión del documento en la revisión.`}
          </p>
        </>
      ) : null}
      {ocultos.impactoId !== null && impacto ? (
        <>
          <input type="hidden" name="impactoId" value={ocultos.impactoId} />
          <p role="note" className={NOTA}>
            {`Esta solicitud atiende el cambio de ${impacto.norma} en ${impacto.proceso}: al enviarla, el impacto queda resuelto.`}
          </p>
        </>
      ) : null}
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Qué pide</legend>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {TIPOS_SOLICITUD.map((t) => (
            <label key={t} className="inline-flex items-center gap-2 text-sm">
              <input type="radio" name="tipo" value={t} checked={tipo === t} onChange={() => cambiarTipo(t)} />
              {ETIQUETA_TIPO_SOLICITUD[t]}
            </label>
          ))}
        </div>
      </fieldset>

      {tipo === "crear" ? (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Campo etiqueta="Proceso" nombre="procesoId">
              <select required value={procesoId} onChange={(e) => setProcesoId(e.target.value)} className={claseControl}>
                <option value="">Elija el proceso</option>
                {procesos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {`${p.nombre} (${p.sigla})`}
                  </option>
                ))}
              </select>
            </Campo>
            {subprocesos.length > 0 ? (
              <Campo etiqueta="Subproceso" nombre="subprocesoId" ayuda="Opcional.">
                <select defaultValue={enviado("subprocesoId") ?? ""} className={claseControl}>
                  <option value="">El proceso completo</option>
                  {subprocesos.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nombre}
                    </option>
                  ))}
                </select>
              </Campo>
            ) : null}
          </div>
          <Campo etiqueta="Tipo de documento" nombre="tipoDocumentoId">
            <select required defaultValue={enviado("tipoDocumentoId") ?? ""} className={claseControl}>
              <option value="">Elija el tipo</option>
              {tipos.map((t) => (
                <option key={t.id} value={t.id}>
                  {`${t.nombre} (${t.sigla})`}
                </option>
              ))}
            </select>
          </Campo>
          <Campo etiqueta="Título propuesto" nombre="tituloPropuesto">
            <input required minLength={3} maxLength={200} defaultValue={enviado("tituloPropuesto")} className={claseControl} />
          </Campo>
        </>
      ) : (
        <Campo etiqueta="Documento" nombre="documentoId" ayuda="Solo documentos con versión vigente.">
          <select required value={documentoId} onChange={(e) => setDocumentoId(e.target.value)} className={`${claseControl} max-w-full`}>
            <option value="">Elija el documento</option>
            {documentos.map((d) => (
              <option key={d.id} value={d.id} disabled={d.conTramite}>
                {`${d.codigo} — ${d.titulo}${d.conTramite ? " (trámite abierto)" : ""}`}
              </option>
            ))}
          </select>
        </Campo>
      )}

      <Campo etiqueta="Motivo" nombre="motivo">
        <select required defaultValue={enviado("motivo") ?? motivoInicial ?? ""} className={claseControl}>
          <option value="">Elija el motivo</option>
          {MOTIVOS.map((m) => (
            <option key={m} value={m}>
              {ETIQUETA_MOTIVO[m]}
            </option>
          ))}
        </select>
      </Campo>
      <Campo etiqueta="Justificación" nombre="justificacion" ayuda="Entre 10 y 2000 caracteres.">
        <textarea
          required
          minLength={10}
          maxLength={2000}
          rows={5}
          value={justificacion}
          onChange={(e) => setJustificacion(e.target.value)}
          className={claseControl}
        />
      </Campo>

      {estado ? (
        <p role="alert" className="text-sm text-estado-critico-texto">
          {estado.error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Boton type="submit" pendiente={pendiente}>
          {pendiente ? "Enviando…" : "Enviar solicitud"}
        </Boton>
        <Link href="/tramites" className={claseBoton("secundario")}>
          Cancelar
        </Link>
      </div>
    </form>
  );
}
