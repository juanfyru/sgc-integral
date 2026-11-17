"use client";

import { useActionState } from "react";
import { enviarSinReiniciar } from "@/componentes/admin/sin-reiniciar";
import { Boton } from "@/componentes/ui/Boton";
import { Cita, Desplegable, ErrorDelPaso, TextoDelPaso, type AccionDelPaso } from "./Partes";

/**
 * Tras el rechazo (spec §8.3): quien lo registró, o el Admin SGC en su lugar, lo retira (queda «Rechazado») o lo sostiene
 * con su réplica (pasa a arbitraje).
 */
export function PasoTrasRechazo({
  hallazgoId,
  justificacion,
  enSuLugar,
  retirar,
  sostener,
}: {
  hallazgoId: number;
  /** La justificación del rechazo, del evento. */
  justificacion: string | null;
  /** Quien mira no lo registró: lo hace como Admin SGC, en lugar de quien lo registró. */
  enSuLugar: boolean;
  retirar: AccionDelPaso;
  sostener: AccionDelPaso;
}) {
  const [estadoR, enviarR, pendienteR] = useActionState(retirar, null);
  const [estadoS, enviarS, pendienteS] = useActionState(sostener, null);
  return (
    <div className="flex flex-col gap-3">
      <Cita rotulo="Por qué se rechazó" texto={justificacion} />
      {enSuLugar ? <p className="text-sm text-muted-foreground">Lo hace en lugar de quien lo registró.</p> : null}
      <form action={enviarS} onSubmit={enviarSinReiniciar(enviarS)} className="flex flex-col gap-3">
        <input type="hidden" name="hallazgoId" value={hallazgoId} />
        <TextoDelPaso etiqueta="Su réplica para sostenerlo (al menos 10 caracteres)" nombre="replica" id={`replica-${hallazgoId}`} />
        <ErrorDelPaso estado={estadoS} />
        <Boton type="submit" pendiente={pendienteS} className="self-start">
          {pendienteS ? "Enviando…" : "Sostener el hallazgo"}
        </Boton>
      </form>
      <Desplegable titulo="Retirarlo">
        <form action={enviarR} onSubmit={enviarSinReiniciar(enviarR)} className="flex flex-col gap-3">
          <input type="hidden" name="hallazgoId" value={hallazgoId} />
          <p className="text-sm">El hallazgo queda «Rechazado», con las dos razones a la vista en su historial. No se puede deshacer.</p>
          <ErrorDelPaso estado={estadoR} />
          <Boton type="submit" variante="peligro" pendiente={pendienteR} className="self-start">
            {pendienteR ? "Retirando…" : "Retirar el hallazgo"}
          </Boton>
        </form>
      </Desplegable>
    </div>
  );
}
