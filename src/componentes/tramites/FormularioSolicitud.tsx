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
  type TipoSolicitud,
} from "@/lib/tramites/tipos";

type Props = DatosParaSolicitar & { documentoInicialId?: number };

export function FormularioSolicitud({ procesos, tipos, documentos, documentoInicialId }: Props) {
  const [estado, enviar, pendiente] = useActionState(crearSolicitudAccion, null);
  const [tipo, setTipo] = useState<TipoSolicitud>(documentoInicialId ? "modificar" : "crear");
  const [procesoId, setProcesoId] = useState(procesos.length === 1 ? String(procesos[0].id) : "");
  const subprocesos = procesos.find((p) => String(p.id) === procesoId)?.subprocesos ?? [];

  // React reinicia un <form action> al terminar la acción, y los controles controlados quedan
  // distintos de su estado: el reenvío mandaría otro tipo de trámite. Enviar desde una transición
  // no reinicia nada. `action` queda para cuando aún no hay JavaScript, y solo entonces hacen
  // falta los valores por defecto con lo enviado.
  const alEnviar = (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault();
    const datos = new FormData(evento.currentTarget);
    startTransition(() => enviar(datos));
  };
  const enviado = (campo: string): string | undefined => {
    const v = estado?.valores?.[campo];
    return typeof v === "string" ? v : undefined;
  };

  return (
    <form action={enviar} onSubmit={alEnviar} className="flex max-w-2xl flex-col gap-5">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Qué pide</legend>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {TIPOS_SOLICITUD.map((t) => (
            <label key={t} className="inline-flex items-center gap-2 text-sm">
              <input type="radio" name="tipo" value={t} checked={tipo === t} onChange={() => setTipo(t)} />
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
          <select required defaultValue={enviado("documentoId") ?? documentoInicialId ?? ""} className={`${claseControl} max-w-full`}>
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
        <select required defaultValue={enviado("motivo") ?? ""} className={claseControl}>
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
          defaultValue={enviado("justificacion")}
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
