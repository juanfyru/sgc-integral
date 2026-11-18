"use client";

import { useActionState } from "react";
import { enviarSinReiniciar } from "@/componentes/admin/sin-reiniciar";
import { Boton } from "@/componentes/ui/Boton";
import { Campo, claseControl } from "@/componentes/ui/Campo";
import { ErrorDelPaso, type AccionDelPaso } from "./Partes";

/**
 * «Registrar la respuesta al ente» (spec 15 §13.4): la fecha en que se envió, de hoy hacia atrás. El oficio se sube antes, en la
 * zona de carga de la sección; el servidor exige al menos un archivo del hallazgo subido después de aprobado el plan.
 */
export function PasoResponderAlEnte({ hallazgoId, hoy, accion }: { hallazgoId: number; hoy: string; accion: AccionDelPaso }) {
  const [estado, enviar, pendiente] = useActionState(accion, null);
  return (
    <form action={enviar} onSubmit={enviarSinReiniciar(enviar)} className="flex flex-col gap-3">
      <input type="hidden" name="hallazgoId" value={hallazgoId} />
      <Campo etiqueta="Fecha en que se envió la respuesta" nombre="enviadaEn" id={`ente-${hallazgoId}-enviada`}>
        <input type="date" required max={hoy} className={claseControl} />
      </Campo>
      <ErrorDelPaso estado={estado} />
      <Boton type="submit" pendiente={pendiente} className="self-start">
        {pendiente ? "Registrando…" : "Registrar la respuesta al ente"}
      </Boton>
    </form>
  );
}
