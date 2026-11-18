"use client";

import { useActionState } from "react";
import { enviarSinReiniciar } from "@/componentes/admin/sin-reiniciar";
import { Boton } from "@/componentes/ui/Boton";
import { CamposDelActa, Cita, ErrorDelPaso, TextoDelPaso, type AccionDelPaso } from "./Partes";

/**
 * El arbitraje de un rechazo sostenido (spec §8.3): confirma el hallazgo (sigue como aceptado) o confirma el rechazo. Es
 * definitivo. Puede citar el acta del Comité.
 */
export function PasoArbitrar({
  hallazgoId,
  justificacion,
  replica,
  hoy,
  accion,
}: {
  hallazgoId: number;
  justificacion: string | null;
  replica: string | null;
  hoy: string;
  accion: AccionDelPaso;
}) {
  const [estado, enviar, pendiente] = useActionState(accion, null);
  return (
    <form action={enviar} onSubmit={enviarSinReiniciar(enviar)} className="flex flex-col gap-3">
      <input type="hidden" name="hallazgoId" value={hallazgoId} />
      <Cita rotulo="Por qué se rechazó" texto={justificacion} />
      <Cita rotulo="Réplica de quien lo registró" texto={replica} />
      <fieldset className="flex min-w-0 flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">El arbitraje confirma</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="confirma" value="hallazgo" required className="size-4" />
          El hallazgo: sigue su recorrido como aceptado
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="confirma" value="rechazo" required className="size-4" />
          El rechazo: el hallazgo queda «Rechazado»
        </label>
      </fieldset>
      <TextoDelPaso etiqueta="Nota del arbitraje (al menos 10 caracteres)" nombre="nota" id={`arbitraje-${hallazgoId}`} />
      <CamposDelActa prefijo={`arbitraje-${hallazgoId}`} hoy={hoy} />
      <p className="text-sm text-muted-foreground">El arbitraje es definitivo: un hallazgo confirmado no se vuelve a rechazar.</p>
      <ErrorDelPaso estado={estado} />
      <Boton type="submit" pendiente={pendiente} className="self-start">
        {pendiente ? "Registrando…" : "Registrar el arbitraje"}
      </Boton>
    </form>
  );
}
