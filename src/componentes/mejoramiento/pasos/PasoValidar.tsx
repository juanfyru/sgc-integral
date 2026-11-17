"use client";

import { useActionState } from "react";
import { enviarSinReiniciar } from "@/componentes/admin/sin-reiniciar";
import { Boton } from "@/componentes/ui/Boton";
import { CamposDelActa, Desplegable, ErrorDelPaso, TextoDelPaso, type AccionDelPaso } from "./Partes";

/**
 * «Por validar la corrección» o, si no hubo corrección, «Por validar el cierre sin acción» (spec §8.5): quien puede validar
 * la valida (el hallazgo se cierra) o la devuelve con una nota (vuelve a «Por corregir»). El Admin SGC o Gerencia pueden,
 * además, exigir la acción correctiva (pasa a «Por formular»).
 */
export function PasoValidar({
  hallazgoId,
  sinAccion,
  puedeValidar,
  puedeExigir,
  hoy,
  validar,
  devolver,
  exigir,
}: {
  hallazgoId: number;
  /** No hubo corrección: se validan las dos justificaciones. */
  sinAccion: boolean;
  puedeValidar: boolean;
  puedeExigir: boolean;
  hoy: string;
  validar: AccionDelPaso;
  devolver: AccionDelPaso;
  exigir: AccionDelPaso;
}) {
  const [estadoV, enviarV, pendienteV] = useActionState(validar, null);
  const [estadoD, enviarD, pendienteD] = useActionState(devolver, null);
  const [estadoE, enviarE, pendienteE] = useActionState(exigir, null);
  return (
    <div className="flex flex-col gap-3">
      {puedeValidar ? (
        <>
          <form action={enviarV} onSubmit={enviarSinReiniciar(enviarV)} className="flex flex-col items-start gap-2">
            <input type="hidden" name="hallazgoId" value={hallazgoId} />
            <p className="text-sm">
              {sinAccion
                ? "Valida las dos justificaciones: la de no requerir corrección y la de no requerir acción correctiva. El hallazgo queda «Cerrado sin acción»."
                : "Valida la corrección y su evidencia. El hallazgo queda «Cerrado con corrección»."}
            </p>
            <Boton type="submit" pendiente={pendienteV}>
              {pendienteV ? "Validando…" : sinAccion ? "Validar el cierre sin acción" : "Validar la corrección"}
            </Boton>
            <ErrorDelPaso estado={estadoV} />
          </form>
          <Desplegable titulo="Devolverla">
            <form action={enviarD} onSubmit={enviarSinReiniciar(enviarD)} className="flex flex-col gap-3">
              <input type="hidden" name="hallazgoId" value={hallazgoId} />
              <p className="text-sm">Vuelve a «Por corregir»: el líder registra la corrección otra vez y se decide de nuevo.</p>
              <TextoDelPaso etiqueta="Nota para quien la registró (al menos 10 caracteres)" nombre="nota" id={`devolver-${hallazgoId}`} />
              <ErrorDelPaso estado={estadoD} />
              <Boton type="submit" variante="secundario" pendiente={pendienteD} className="self-start">
                {pendienteD ? "Devolviendo…" : "Devolver la corrección"}
              </Boton>
            </form>
          </Desplegable>
        </>
      ) : null}
      {puedeExigir ? (
        <Desplegable titulo="Exigir la acción correctiva">
          <form action={enviarE} onSubmit={enviarSinReiniciar(enviarE)} className="flex flex-col gap-3">
            <input type="hidden" name="hallazgoId" value={hallazgoId} />
            <input type="hidden" name="requiere" value="si" />
            <p className="text-sm">Cambia el «no» por «sí»: pasa a «Por formular» y el plazo para formular se cuenta desde hoy.</p>
            <TextoDelPaso etiqueta="Justificación (al menos 10 caracteres)" nombre="justificacion" id={`exigir-${hallazgoId}`} />
            <CamposDelActa prefijo={`exigir-${hallazgoId}`} hoy={hoy} />
            <ErrorDelPaso estado={estadoE} />
            <Boton type="submit" variante="secundario" pendiente={pendienteE} className="self-start">
              {pendienteE ? "Registrando…" : "Exigir la acción correctiva"}
            </Boton>
          </form>
        </Desplegable>
      ) : null}
    </div>
  );
}
