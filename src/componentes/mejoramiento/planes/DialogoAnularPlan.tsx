"use client";

import { useActionState, useState } from "react";
import { enviarSinReiniciar } from "@/componentes/admin/sin-reiniciar";
import { Boton } from "@/componentes/ui/Boton";
import { Campo, claseControl } from "@/componentes/ui/Campo";
import { Dialogo } from "@/componentes/ui/Dialogo";
import { AVISO_SIN_PACIENTES } from "@/lib/mejoramiento/textos";
import { ErrorDelPaso, type AccionDelPaso } from "../pasos/Partes";

/**
 * «Anular» un plan sin hallazgos (anexo §3.2, F15B-DC5): pide el motivo (al menos diez caracteres), que queda en su historial. El
 * plan conserva su código y su historial; ya no recibe hallazgos, no se edita ni admite archivos. El servidor lo rechaza si en ese
 * momento tiene algún hallazgo.
 */
export function DialogoAnularPlan({ planId, codigo, accion }: { planId: number; codigo: string; accion: AccionDelPaso }) {
  const [abierto, setAbierto] = useState(false);
  const [estado, enviar, pendiente] = useActionState(accion, null);
  const titulo = `Anular el plan ${codigo}`;
  return (
    <>
      <Boton variante="peligro" onClick={() => setAbierto(true)} aria-haspopup="dialog">
        Anular
      </Boton>
      <Dialogo
        abierto={abierto}
        alCerrar={() => setAbierto(false)}
        titulo={titulo}
        className="m-auto w-full max-w-lg rounded-lg border border-border bg-card p-0 text-foreground shadow-xl backdrop:bg-black/40"
      >
        <form action={enviar} onSubmit={enviarSinReiniciar(enviar)} className="flex max-h-[90vh] flex-col gap-4 overflow-y-auto p-5">
          <p aria-hidden="true" className="font-semibold">
            {titulo}
          </p>
          <input type="hidden" name="planId" value={planId} />
          <p className="text-sm">
            El plan queda «Anulado», con su código y su historial: ya no recibe hallazgos, no se edita y no admite archivos. Un plan no
            se borra nunca. No se puede deshacer.
          </p>
          <Campo etiqueta="Motivo (al menos 10 caracteres)" nombre="motivo" id={`anular-plan-${planId}-motivo`} ayuda={AVISO_SIN_PACIENTES}>
            <textarea required minLength={10} maxLength={1000} rows={3} className={claseControl} />
          </Campo>
          <ErrorDelPaso estado={estado} />
          <div className="flex flex-wrap justify-end gap-2">
            <Boton variante="secundario" onClick={() => setAbierto(false)}>
              Cancelar
            </Boton>
            <Boton type="submit" variante="peligro" pendiente={pendiente}>
              {pendiente ? "Anulando…" : "Anular el plan"}
            </Boton>
          </div>
        </form>
      </Dialogo>
    </>
  );
}
