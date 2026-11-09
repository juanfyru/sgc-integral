"use client";

import { useActionState, useState } from "react";
import { fijarFechaAccion } from "@/app/acciones-vigencia";
import { enviarSinReiniciar } from "@/componentes/admin/sin-reiniciar";
import { Boton } from "@/componentes/ui/Boton";
import { Campo, claseControl } from "@/componentes/ui/Campo";
import { Dialogo } from "@/componentes/ui/Dialogo";

type Props = {
  /** Los documentos a los que se fija la fecha: uno desde la ficha, los filtrados desde el semáforo. */
  documentoIds: number[];
  etiqueta: string;
  /** De mañana al menor de los plazos de esos documentos, en `yyyy-mm-dd`. */
  minima: string;
  maxima: string;
  /** «8 nov 2027», para decirlo en la ayuda. */
  maximaTexto: string;
  variante?: "primario" | "secundario";
};

/** Vive solo mientras el diálogo está abierto: al cerrarlo no quedan ni lo escrito ni el aviso. */
export function FormularioFijarFecha({ documentoIds, etiqueta, minima, maxima, maximaTexto, alCerrar }: Props & { alCerrar: () => void }) {
  const [estado, enviar, pendiente] = useActionState(fijarFechaAccion, null);
  const hecho = estado?.ok === true;
  return (
    <form action={enviar} onSubmit={enviarSinReiniciar(enviar)} className="flex flex-col gap-4 p-5">
      {documentoIds.map((id) => (
        <input key={id} type="hidden" name="documentoIds" value={id} />
      ))}
      {/* El título para lectores de pantalla ya lo pone Dialogo. */}
      <p aria-hidden="true" className="font-semibold">
        {etiqueta}
      </p>
      <p className="text-sm text-muted-foreground">
        La fecha queda como «fijada a mano», con su nota y quién la fijó; nunca se muestra como una ratificación.
        Ratificar o publicar una versión nueva la borra.
      </p>
      <Campo etiqueta="Próxima revisión" nombre="fecha" ayuda={`De mañana al ${maximaTexto}.`}>
        <input type="date" required min={minima} max={maxima} className={claseControl} />
      </Campo>
      <Campo etiqueta="Nota" nombre="nota" ayuda="Por qué se fija esta fecha; entre 5 y 500 caracteres.">
        <textarea required minLength={5} maxLength={500} rows={3} className={`${claseControl} w-full`} />
      </Campo>
      {estado && !estado.ok ? (
        <p role="alert" className="text-sm text-estado-critico-texto">
          {estado.error}
        </p>
      ) : null}
      {hecho ? (
        <p role="status" className="text-sm text-estado-bien-texto">
          {estado.aviso}
        </p>
      ) : null}
      <div className="flex flex-wrap justify-end gap-2">
        <Boton variante="secundario" onClick={alCerrar}>
          {hecho ? "Cerrar" : "Cancelar"}
        </Boton>
        {hecho ? null : (
          <Boton type="submit" pendiente={pendiente}>
            {pendiente ? "Fijando…" : "Fijar la fecha"}
          </Boton>
        )}
      </div>
    </form>
  );
}

/** «Fijar próxima revisión» (spec 13C §7.4), para el Admin SGC. */
export function DialogoFijarFecha(props: Props) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <Boton variante={props.variante ?? "secundario"} onClick={() => setAbierto(true)} aria-haspopup="dialog">
        {props.etiqueta}
      </Boton>
      <Dialogo
        abierto={abierto}
        alCerrar={() => setAbierto(false)}
        titulo={props.etiqueta}
        className="m-auto w-full max-w-md rounded-lg border border-border bg-card p-0 text-foreground shadow-xl backdrop:bg-black/40"
      >
        {abierto ? <FormularioFijarFecha {...props} alCerrar={() => setAbierto(false)} /> : null}
      </Dialogo>
    </>
  );
}
