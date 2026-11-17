"use client";

import { useActionState } from "react";
import { enviarSinReiniciar } from "@/componentes/admin/sin-reiniciar";
import { Boton } from "@/componentes/ui/Boton";
import { Desplegable, ErrorDelPaso, TextoDelPaso, type AccionDelPaso } from "./Partes";

/**
 * Aceptar o rechazar el hallazgo (spec §8.3). Rechazar, con su justificación, solo lo ofrece a un líder del proceso y en un
 * origen interno: el Admin SGC que actúa por un proceso sin líder solo acepta.
 */
export function PasoAceptar({
  hallazgoId,
  puedeRechazar,
  aceptar,
  rechazar,
}: {
  hallazgoId: number;
  puedeRechazar: boolean;
  aceptar: AccionDelPaso;
  rechazar: AccionDelPaso;
}) {
  const [estadoA, enviarA, pendienteA] = useActionState(aceptar, null);
  const [estadoR, enviarR, pendienteR] = useActionState(rechazar, null);
  return (
    <div className="flex flex-col gap-3">
      <form action={enviarA} onSubmit={enviarSinReiniciar(enviarA)} className="flex flex-col items-start gap-2">
        <input type="hidden" name="hallazgoId" value={hallazgoId} />
        <Boton type="submit" pendiente={pendienteA}>
          {pendienteA ? "Aceptando…" : "Aceptar el hallazgo"}
        </Boton>
        <ErrorDelPaso estado={estadoA} />
      </form>
      {puedeRechazar ? (
        <Desplegable titulo="Rechazarlo">
          <form action={enviarR} onSubmit={enviarSinReiniciar(enviarR)} className="flex flex-col gap-3">
            <input type="hidden" name="hallazgoId" value={hallazgoId} />
            <p className="text-sm">Quien lo registró decidirá si lo retira o lo sostiene; si lo sostiene, se arbitra.</p>
            <TextoDelPaso etiqueta="Por qué lo rechaza (al menos 10 caracteres)" nombre="justificacion" id={`rechazo-${hallazgoId}`} />
            <ErrorDelPaso estado={estadoR} />
            <Boton type="submit" variante="peligro" pendiente={pendienteR} className="self-start">
              {pendienteR ? "Rechazando…" : "Rechazar el hallazgo"}
            </Boton>
          </form>
        </Desplegable>
      ) : null}
    </div>
  );
}
