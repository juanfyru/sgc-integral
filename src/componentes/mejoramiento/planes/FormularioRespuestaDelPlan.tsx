"use client";

import { useActionState } from "react";
import { enviarSinReiniciar } from "@/componentes/admin/sin-reiniciar";
import { Boton } from "@/componentes/ui/Boton";
import { Campo, claseControl } from "@/componentes/ui/Campo";
import { ErrorDelPaso, type AccionDelPaso } from "../pasos/Partes";

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";

/**
 * «Registrar la respuesta» desde el plan (anexo §3.8): el oficio, uno de los archivos del plan que no es ya el oficio de otra
 * respuesta (con uno solo, ya elegido), y la fecha en que se envió, entre el día de la aprobación más reciente de los listos
 * (`desde`) y hoy. Envía la lista de hallazgos que mostró como listos (`vistos`): si al guardar no es la misma, no se registra
 * nada y la página vuelve con la lista nueva y el aviso (lo pinta `RespuestaAlEnte`). Sin ningún archivo que pueda serlo, el
 * formulario no se pinta: dice que falta y enlaza «Archivos del plan». El servidor vuelve a comprobarlo todo.
 */
export function FormularioRespuestaDelPlan({
  planId,
  vistos,
  oficios,
  desde,
  hoy,
  anclaDeArchivos,
  accion,
}: {
  planId: number;
  vistos: number[];
  oficios: Array<{ id: number; nombre: string }>;
  desde: string | null;
  hoy: string;
  anclaDeArchivos: string;
  accion: AccionDelPaso;
}) {
  const [estado, enviar, pendiente] = useActionState(accion, null);
  if (oficios.length === 0) {
    return (
      <p className="text-sm">
        Adjunte el oficio de respuesta:{" "}
        <a href={`#${anclaDeArchivos}`} className={`rounded-sm text-marca underline underline-offset-2 ${FOCO}`}>
          súbalo en «Archivos del plan»
        </a>
        .
      </p>
    );
  }
  const unico = oficios.length === 1;
  return (
    <form action={enviar} onSubmit={enviarSinReiniciar(enviar)} className="flex flex-col gap-3">
      <input type="hidden" name="planId" value={planId} />
      {vistos.map((id) => (
        <input key={id} type="hidden" name="vistos" value={id} />
      ))}
      <fieldset className="flex min-w-0 flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">El oficio de respuesta</legend>
        {oficios.map((a) => (
          <label key={a.id} className="flex min-w-0 items-center gap-2 text-sm">
            <input type="radio" name="oficioId" value={a.id} required defaultChecked={unico} className="size-4 shrink-0" />
            <span className="min-w-0 break-words">{a.nombre}</span>
          </label>
        ))}
      </fieldset>
      <Campo etiqueta="Fecha en que se envió la respuesta" nombre="enviadaEn" id={`plan-${planId}-enviada`}>
        <input type="date" required min={desde ?? undefined} max={hoy} className={claseControl} />
      </Campo>
      <ErrorDelPaso estado={estado} />
      <Boton type="submit" pendiente={pendiente} className="self-start">
        {pendiente ? "Registrando…" : "Registrar la respuesta"}
      </Boton>
    </form>
  );
}
