"use client";

import { useActionState } from "react";
import { enviarSinReiniciar } from "@/componentes/admin/sin-reiniciar";
import { Boton } from "@/componentes/ui/Boton";
import { CamposDelActa, ErrorDelPaso, TextoDelPaso, type AccionDelPaso } from "./Partes";

/**
 * Decidir si la no conformidad requiere acción correctiva (spec §8.5): «sí» pasa a «Por formular»; «no», a «Por validar».
 * Con justificación y, si se quiere, el acta del Comité.
 */
export function PasoDecidir({ hallazgoId, hoy, accion }: { hallazgoId: number; hoy: string; accion: AccionDelPaso }) {
  const [estado, enviar, pendiente] = useActionState(accion, null);
  return (
    <form action={enviar} onSubmit={enviarSinReiniciar(enviar)} className="flex flex-col gap-3">
      <input type="hidden" name="hallazgoId" value={hallazgoId} />
      <fieldset className="flex min-w-0 flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">¿Requiere acción correctiva?</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="requiere" value="si" required className="size-4" />
          Sí: se formula la causa raíz y el plan
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="requiere" value="no" required className="size-4" />
          No: otra persona valida la corrección y se cierra
        </label>
      </fieldset>
      <TextoDelPaso etiqueta="Justificación (al menos 10 caracteres)" nombre="justificacion" id={`decision-${hallazgoId}`} />
      <CamposDelActa prefijo={`decision-${hallazgoId}`} hoy={hoy} />
      <ErrorDelPaso estado={estado} />
      <Boton type="submit" pendiente={pendiente} className="self-start">
        {pendiente ? "Registrando…" : "Registrar la decisión"}
      </Boton>
    </form>
  );
}
