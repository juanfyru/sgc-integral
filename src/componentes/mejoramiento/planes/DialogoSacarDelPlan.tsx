"use client";

import { useActionState, useState } from "react";
import { enviarSinReiniciar } from "@/componentes/admin/sin-reiniciar";
import { Boton } from "@/componentes/ui/Boton";
import { Campo, claseControl } from "@/componentes/ui/Campo";
import { Dialogo } from "@/componentes/ui/Dialogo";
import { AVISO_SIN_PACIENTES } from "@/lib/mejoramiento/textos";
import { ErrorDelPaso, type AccionDelPaso } from "../pasos/Partes";

/**
 * «Sacar» un hallazgo de su plan (anexo §3.4), desde la página del plan o desde la del hallazgo: pide el motivo (al menos diez
 * caracteres), que queda en el historial del plan y no en la bitácora. Del hallazgo no cambia nada: conserva su objetivo y su
 * respuesta al ente. No avisa a nadie. El servidor vuelve a comprobar el permiso y que siga en el plan.
 */
export function DialogoSacarDelPlan({
  hallazgoId,
  codigo,
  plan,
  accion,
  lugar = "plan",
}: {
  hallazgoId: number;
  codigo: string;
  /** El código del plan del que sale, para el título del diálogo. */
  plan: string;
  accion: AccionDelPaso;
  /** Distingue los `id` cuando el mismo diálogo se pinta dos veces (la tabla y las tarjetas). */
  lugar?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [estado, enviar, pendiente] = useActionState(accion, null);
  const titulo = `Sacar ${codigo} del plan ${plan}`;
  return (
    <>
      <Boton variante="secundario" tamano="sm" onClick={() => setAbierto(true)} aria-haspopup="dialog" aria-label={titulo}>
        Sacar
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
          <input type="hidden" name="hallazgoId" value={hallazgoId} />
          <p className="text-sm">
            Del hallazgo no cambia nada: conserva su estado, su objetivo y su respuesta al ente. El motivo queda en el historial del
            plan. No se avisa a nadie.
          </p>
          <Campo etiqueta="Motivo (al menos 10 caracteres)" nombre="motivo" id={`sacar-${lugar}-${hallazgoId}-motivo`} ayuda={AVISO_SIN_PACIENTES}>
            <textarea required minLength={10} maxLength={1000} rows={3} className={claseControl} />
          </Campo>
          <ErrorDelPaso estado={estado} />
          <div className="flex flex-wrap justify-end gap-2">
            <Boton variante="secundario" onClick={() => setAbierto(false)}>
              Cancelar
            </Boton>
            <Boton type="submit" pendiente={pendiente}>
              {pendiente ? "Sacando…" : "Sacar del plan"}
            </Boton>
          </div>
        </form>
      </Dialogo>
    </>
  );
}
