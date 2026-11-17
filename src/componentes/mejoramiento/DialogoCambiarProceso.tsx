"use client";

import { useActionState, useState } from "react";
import type { EstadoAccion } from "@/app/admin/comun";
import { enviarSinReiniciar } from "@/componentes/admin/sin-reiniciar";
import { Boton } from "@/componentes/ui/Boton";
import { Campo, claseControl } from "@/componentes/ui/Campo";
import { Dialogo } from "@/componentes/ui/Dialogo";

type Props = {
  hallazgoId: number;
  codigo: string;
  procesoActualId: number;
  procesos: ReadonlyArray<{ id: number; nombre: string }>;
  accion: (estado: EstadoAccion, formData: FormData) => Promise<EstadoAccion>;
};

/**
 * «Cambiar proceso» (spec 15 §7.6): solo mientras el hallazgo está «Por aceptar». Avisa a los líderes del proceso nuevo y
 * quita el subproceso y el enlace de reincidencia, que eran del proceso anterior.
 */
export function DialogoCambiarProceso({ hallazgoId, codigo, procesoActualId, procesos, accion }: Props) {
  const [abierto, setAbierto] = useState(false);
  const [estado, enviar, pendiente] = useActionState(accion, null);
  const v = estado?.valores;
  const texto = (c: string) => (typeof v?.[c] === "string" ? (v[c] as string) : "");
  return (
    <>
      <Boton variante="secundario" onClick={() => setAbierto(true)} aria-haspopup="dialog">
        Cambiar proceso
      </Boton>
      <Dialogo
        abierto={abierto}
        alCerrar={() => setAbierto(false)}
        titulo={`Cambiar el proceso de ${codigo}`}
        className="m-auto w-full max-w-lg rounded-lg border border-border bg-card p-0 text-foreground shadow-xl backdrop:bg-black/40"
      >
        <form action={enviar} onSubmit={enviarSinReiniciar(enviar)} className="flex max-h-[90vh] flex-col gap-4 overflow-y-auto p-5">
          <p aria-hidden="true" className="font-semibold">{`Cambiar el proceso de ${codigo}`}</p>
          <input type="hidden" name="hallazgoId" value={hallazgoId} />
          <p className="text-sm">
            Los líderes del proceso nuevo reciben el aviso de aceptarlo o rechazarlo. El subproceso y el enlace de reincidencia,
            que eran del proceso anterior, se quitan y quedan en el historial.
          </p>
          {estado?.ok === false ? (
            <p role="alert" className="rounded-md border border-estado-critico/40 bg-estado-critico-fondo px-3 py-2 text-sm text-estado-critico-texto">
              {estado.error}
            </p>
          ) : null}
          <Campo etiqueta="Proceso nuevo" nombre="procesoId" id="cambiar-proceso-proceso">
            <select required defaultValue={texto("procesoId")} className={claseControl}>
              <option value="">Elija el proceso</option>
              {procesos
                .filter((p) => p.id !== procesoActualId)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
            </select>
          </Campo>
          <Campo etiqueta="Justificación (al menos 10 caracteres)" nombre="justificacion" id="cambiar-proceso-justificacion">
            <textarea required minLength={10} maxLength={1000} rows={3} defaultValue={texto("justificacion")} className={claseControl} />
          </Campo>
          <div className="flex flex-wrap justify-end gap-2">
            <Boton variante="secundario" onClick={() => setAbierto(false)}>
              Cancelar
            </Boton>
            <Boton type="submit" variante="primario" pendiente={pendiente}>
              Cambiar el proceso
            </Boton>
          </div>
        </form>
      </Dialogo>
    </>
  );
}
