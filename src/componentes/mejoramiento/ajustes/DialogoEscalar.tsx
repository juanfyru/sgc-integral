"use client";

import { useActionState, useState } from "react";
import { enviarSinReiniciar } from "@/componentes/admin/sin-reiniciar";
import { Boton } from "@/componentes/ui/Boton";
import { Dialogo } from "@/componentes/ui/Dialogo";
import { CamposDelActa, ErrorDelPaso, TextoDelPaso, type AccionDelPaso } from "../pasos/Partes";

const CLASE_DIALOGO = "m-auto w-full max-w-lg rounded-lg border border-border bg-card p-0 text-foreground shadow-xl backdrop:bg-black/40";

/**
 * «Escalar a Gerencia» una actividad vencida (spec 15 §10.7), para el Admin SGC: con una nota. Avisa a Gerencia y la actividad
 * muestra «Escalada a Gerencia el …»; no cambia ningún estado. El servidor vuelve a comprobar que siga vencida.
 */
export function DialogoEscalar({ actividadId, etiqueta, accion }: { actividadId: number; etiqueta: string; accion: AccionDelPaso }) {
  const [abierto, setAbierto] = useState(false);
  const [estado, enviar, pendiente] = useActionState(accion, null);
  const titulo = `Escalar a Gerencia la actividad ${etiqueta}`;
  return (
    <>
      <Boton variante="secundario" tamano="sm" onClick={() => setAbierto(true)} aria-haspopup="dialog" aria-label={titulo}>
        Escalar a Gerencia
      </Boton>
      <Dialogo abierto={abierto} alCerrar={() => setAbierto(false)} titulo={titulo} className={CLASE_DIALOGO}>
        <form action={enviar} onSubmit={enviarSinReiniciar(enviar)} className="flex max-h-[90vh] flex-col gap-4 overflow-y-auto p-5">
          <p aria-hidden="true" className="font-semibold">
            {titulo}
          </p>
          <input type="hidden" name="actividadId" value={actividadId} />
          <p className="text-sm">Gerencia recibe un aviso y puede responder con una nota y el acta del Comité. No cambia ningún estado.</p>
          <TextoDelPaso etiqueta="Nota (al menos 10 caracteres)" nombre="nota" id={`escalar-${actividadId}-nota`} />
          <ErrorDelPaso estado={estado} />
          <div className="flex flex-wrap justify-end gap-2">
            <Boton variante="secundario" onClick={() => setAbierto(false)}>
              Cancelar
            </Boton>
            <Boton type="submit" pendiente={pendiente}>
              {pendiente ? "Escalando…" : "Escalar a Gerencia"}
            </Boton>
          </div>
        </form>
      </Dialogo>
    </>
  );
}

/** Gerencia responde una escalada (spec 15 §10.7): una nota y, si quiere, el acta del Comité. No cambia ningún estado. */
export function DialogoResponderEscalada({
  actividadId,
  etiqueta,
  hoy,
  accion,
}: {
  actividadId: number;
  etiqueta: string;
  hoy: string;
  accion: AccionDelPaso;
}) {
  const [abierto, setAbierto] = useState(false);
  const [estado, enviar, pendiente] = useActionState(accion, null);
  const titulo = `Responder la escalada de la actividad ${etiqueta}`;
  return (
    <>
      <Boton variante="secundario" tamano="sm" onClick={() => setAbierto(true)} aria-haspopup="dialog" aria-label={titulo}>
        Responder la escalada
      </Boton>
      <Dialogo abierto={abierto} alCerrar={() => setAbierto(false)} titulo={titulo} className={CLASE_DIALOGO}>
        <form action={enviar} onSubmit={enviarSinReiniciar(enviar)} className="flex max-h-[90vh] flex-col gap-4 overflow-y-auto p-5">
          <p aria-hidden="true" className="font-semibold">
            {titulo}
          </p>
          <input type="hidden" name="actividadId" value={actividadId} />
          <TextoDelPaso etiqueta="Respuesta (al menos 10 caracteres)" nombre="nota" id={`responder-${actividadId}-nota`} />
          <CamposDelActa prefijo={`responder-${actividadId}`} hoy={hoy} />
          <ErrorDelPaso estado={estado} />
          <div className="flex flex-wrap justify-end gap-2">
            <Boton variante="secundario" onClick={() => setAbierto(false)}>
              Cancelar
            </Boton>
            <Boton type="submit" pendiente={pendiente}>
              {pendiente ? "Respondiendo…" : "Responder"}
            </Boton>
          </div>
        </form>
      </Dialogo>
    </>
  );
}
