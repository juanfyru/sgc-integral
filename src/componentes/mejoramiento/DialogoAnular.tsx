"use client";

import { useActionState, useState } from "react";
import type { EstadoAccion } from "@/app/admin/comun";
import { enviarSinReiniciar } from "@/componentes/admin/sin-reiniciar";
import { Boton } from "@/componentes/ui/Boton";
import { Campo, claseControl } from "@/componentes/ui/Campo";
import { Dialogo } from "@/componentes/ui/Dialogo";
import { AVISO_SIN_PACIENTES } from "@/lib/mejoramiento/textos";

type Props = {
  hallazgoId: number;
  codigo: string;
  accion: (estado: EstadoAccion, formData: FormData) => Promise<EstadoAccion>;
};

/**
 * «Anular» un hallazgo (spec 15 §7.6): un registro hecho por error, un duplicado o uno que el ente retiró. Pide la
 * justificación y dice lo que arrastra: queda «Anulado» con su código y su historia, sus actividades sin terminar pasan a
 * canceladas y se avisa a quienes participaban.
 */
export function DialogoAnular({ hallazgoId, codigo, accion }: Props) {
  const [abierto, setAbierto] = useState(false);
  const [estado, enviar, pendiente] = useActionState(accion, null);
  const v = estado?.valores;
  return (
    <>
      <Boton variante="peligro" onClick={() => setAbierto(true)} aria-haspopup="dialog">
        Anular
      </Boton>
      <Dialogo
        abierto={abierto}
        alCerrar={() => setAbierto(false)}
        titulo={`Anular ${codigo}`}
        className="m-auto w-full max-w-lg rounded-lg border border-border bg-card p-0 text-foreground shadow-xl backdrop:bg-black/40"
      >
        <form action={enviar} onSubmit={enviarSinReiniciar(enviar)} className="flex max-h-[90vh] flex-col gap-4 overflow-y-auto p-5">
          <p aria-hidden="true" className="font-semibold">{`Anular ${codigo}`}</p>
          <input type="hidden" name="hallazgoId" value={hallazgoId} />
          <p className="text-sm">
            El hallazgo queda «Anulado», con su código y su historia, y no cuenta en ningún cálculo. Sus actividades sin terminar
            pasan a canceladas y se avisa a los líderes, a los responsables de esas actividades y a Gerencia si había aprobado el
            plan. No se puede deshacer.
          </p>
          {estado?.ok === false ? (
            <p role="alert" className="rounded-md border border-estado-critico/40 bg-estado-critico-fondo px-3 py-2 text-sm text-estado-critico-texto">
              {estado.error}
            </p>
          ) : null}
          <Campo etiqueta="Justificación (al menos 10 caracteres)" nombre="justificacion" id="anular-justificacion" ayuda={AVISO_SIN_PACIENTES}>
            <textarea
              required
              minLength={10}
              maxLength={1000}
              rows={3}
              defaultValue={typeof v?.justificacion === "string" ? v.justificacion : ""}
              className={claseControl}
            />
          </Campo>
          <div className="flex flex-wrap justify-end gap-2">
            <Boton variante="secundario" onClick={() => setAbierto(false)}>
              Cancelar
            </Boton>
            <Boton type="submit" variante="peligro" pendiente={pendiente}>
              Anular el hallazgo
            </Boton>
          </div>
        </form>
      </Dialogo>
    </>
  );
}
