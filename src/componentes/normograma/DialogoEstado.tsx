"use client";

import { useActionState, useState } from "react";
import { cambiarEstadoNormaAccion } from "@/app/acciones-normograma";
import type { EstadoAccion } from "@/app/admin/comun";
import { enviarSinReiniciar } from "@/componentes/admin/sin-reiniciar";
import { ErrorAccion } from "@/componentes/tramites/AccionesSolicitud";
import { Boton } from "@/componentes/ui/Boton";
import { Campo, claseControl } from "@/componentes/ui/Campo";
import { Dialogo } from "@/componentes/ui/Dialogo";
import { ESTADOS_A_MANO, ESTADOS_CON_IMPACTO, ETIQUETA_ESTADO_NORMA, type EstadoNorma } from "@/lib/normograma/tipos";

const CONTROL = `${claseControl} w-full min-w-0 max-w-full`;

type Props = {
  normaId: number;
  nombre: string;
  estado: EstadoNorma;
  /** Hoy, `yyyy-mm-dd` en la zona de la instalación: la fecha propuesta. */
  hoy: string;
};

/**
 * Vive solo mientras el diálogo está abierto; al guardar sin error lo cierra (la ficha se vuelve a pintar). No ofrece
 * «Retirada»: retirar va por «Retirar…», que pide el motivo (spec 13C §10.7).
 */
export function FormularioEstado({ normaId, nombre, estado, hoy, alCerrar }: Props & { alCerrar: () => void }) {
  const [resultado, enviar, pendiente] = useActionState(async (previo: EstadoAccion, datos: FormData) => {
    const r = await cambiarEstadoNormaAccion(previo, datos);
    if (r === null) alCerrar();
    return r;
  }, null);
  const opciones = ESTADOS_A_MANO.filter((e) => e !== estado);
  const [elegido, setElegido] = useState<EstadoNorma>(opciones[0]);

  return (
    <form action={enviar} onSubmit={enviarSinReiniciar(enviar)} className="flex flex-col gap-4 p-5">
      <input type="hidden" name="normaId" value={normaId} />
      <p aria-hidden="true" className="font-semibold">
        {`Cambiar el estado de ${nombre}`}
      </p>
      <p className="text-sm text-muted-foreground">{`Hoy está ${ETIQUETA_ESTADO_NORMA[estado].toLowerCase()}. El cambio queda en su historial, con la fecha, quién y la nota.`}</p>
      <Campo etiqueta="Estado nuevo" nombre="estado">
        <select value={elegido} onChange={(e) => setElegido(e.target.value as EstadoNorma)} className={CONTROL}>
          {opciones.map((e) => (
            <option key={e} value={e}>
              {ETIQUETA_ESTADO_NORMA[e]}
            </option>
          ))}
        </select>
      </Campo>
      {ESTADOS_CON_IMPACTO.includes(elegido) ? (
        <p className="rounded-md bg-estado-atencion-fondo px-3 py-2 text-sm text-estado-atencion-texto">
          Abre la revisión del impacto en cada documento enlazado y en cada proceso asociado, con su tarea y su aviso.
        </p>
      ) : null}
      <Campo etiqueta="Fecha del estado" nombre="fecha">
        <input type="date" required defaultValue={hoy} className={CONTROL} />
      </Campo>
      <Campo etiqueta="Nota (opcional)" nombre="nota" ayuda="Hasta 1000 caracteres.">
        <textarea maxLength={1000} rows={3} className={CONTROL} />
      </Campo>
      <ErrorAccion estado={resultado} />
      <div className="flex flex-wrap justify-end gap-2">
        <Boton variante="secundario" onClick={alCerrar}>
          Cancelar
        </Boton>
        <Boton type="submit" pendiente={pendiente}>
          {pendiente ? "Guardando…" : "Cambiar el estado"}
        </Boton>
      </div>
    </form>
  );
}

/** «Cambiar estado» de la ficha (spec 13C §10.2), para quien administra. */
export function DialogoEstado(props: Props) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <Boton variante="secundario" onClick={() => setAbierto(true)} aria-haspopup="dialog">
        Cambiar estado
      </Boton>
      <Dialogo
        abierto={abierto}
        alCerrar={() => setAbierto(false)}
        titulo={`Cambiar el estado de ${props.nombre}`}
        className="m-auto w-full max-w-md rounded-lg border border-border bg-card p-0 text-foreground shadow-xl backdrop:bg-black/40"
      >
        {abierto ? <FormularioEstado {...props} alCerrar={() => setAbierto(false)} /> : null}
      </Dialogo>
    </>
  );
}
