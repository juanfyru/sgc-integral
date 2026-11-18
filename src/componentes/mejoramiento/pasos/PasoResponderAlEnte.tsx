"use client";

import { useActionState } from "react";
import { enviarSinReiniciar } from "@/componentes/admin/sin-reiniciar";
import { Boton } from "@/componentes/ui/Boton";
import { Campo, claseControl } from "@/componentes/ui/Campo";
import { ErrorDelPaso, type AccionDelPaso } from "./Partes";

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";

/**
 * «Registrar la respuesta al ente» (spec 15 §13.4): el oficio, uno de los archivos del hallazgo subidos después de aprobar el plan
 * (`candidatos`; con uno solo, ya elegido), y la fecha en que se envió, entre el día de la aprobación (`desde`) y hoy. Sin ningún
 * archivo que pueda serlo, el formulario no se pinta: dice que falta y enlaza la zona de carga (`#oficio-ente`). El servidor lo
 * vuelve a comprobar todo.
 */
export function PasoResponderAlEnte({
  hallazgoId,
  hoy,
  desde,
  candidatos,
  accion,
}: {
  hallazgoId: number;
  hoy: string;
  /** El día en que se aprobó el plan de la ronda en vigor: la respuesta no se envió antes. */
  desde: string;
  candidatos: Array<{ id: number; nombre: string }>;
  accion: AccionDelPaso;
}) {
  const [estado, enviar, pendiente] = useActionState(accion, null);
  if (candidatos.length === 0) {
    return (
      <p className="text-sm">
        Adjunte el oficio de respuesta:{" "}
        <a href="#oficio-ente" className={`rounded-sm text-marca underline underline-offset-2 ${FOCO}`}>
          súbalo en la zona de carga
        </a>
        .
      </p>
    );
  }
  const unico = candidatos.length === 1;
  return (
    <form action={enviar} onSubmit={enviarSinReiniciar(enviar)} className="flex flex-col gap-3">
      <input type="hidden" name="hallazgoId" value={hallazgoId} />
      <fieldset className="flex min-w-0 flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">El oficio de respuesta</legend>
        {candidatos.map((a) => (
          <label key={a.id} className="flex min-w-0 items-center gap-2 text-sm">
            <input type="radio" name="oficioId" value={a.id} required defaultChecked={unico} className="size-4 shrink-0" />
            <span className="min-w-0 break-words">{a.nombre}</span>
          </label>
        ))}
      </fieldset>
      <Campo etiqueta="Fecha en que se envió la respuesta" nombre="enviadaEn" id={`ente-${hallazgoId}-enviada`}>
        <input type="date" required min={desde} max={hoy} className={claseControl} />
      </Campo>
      <ErrorDelPaso estado={estado} />
      <Boton type="submit" pendiente={pendiente} className="self-start">
        {pendiente ? "Registrando…" : "Registrar la respuesta al ente"}
      </Boton>
    </form>
  );
}
