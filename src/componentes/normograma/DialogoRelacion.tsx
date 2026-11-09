"use client";

import { useActionState, useState } from "react";
import { registrarRelacionAccion } from "@/app/acciones-normograma";
import type { EstadoAccion } from "@/app/admin/comun";
import { enviarSinReiniciar } from "@/componentes/admin/sin-reiniciar";
import { ErrorAccion } from "@/componentes/tramites/AccionesSolicitud";
import { Boton } from "@/componentes/ui/Boton";
import { Campo, claseControl } from "@/componentes/ui/Campo";
import { Dialogo } from "@/componentes/ui/Dialogo";
import { ESTADO_TRAS_RELACION, ETIQUETA_ESTADO_NORMA, ETIQUETA_RELACION, TIPOS_RELACION, type TipoRelacion } from "@/lib/normograma/tipos";

const CONTROL = `${claseControl} w-full min-w-0 max-w-full`;

type Props = {
  normaId: number;
  nombre: string;
  /** Las normas que pueden ser la afectada: ni esta, ni una derogada o retirada. */
  normas: { id: number; nombre: string; titulo: string }[];
};

const EFECTO: Record<TipoRelacion, string> = {
  modifica: "La afectada pasa a modificada (si estaba vigente) y se abre la revisión del impacto en sus documentos y procesos.",
  deroga: "La afectada pasa a derogada y se abre la revisión del impacto en sus documentos y procesos.",
  reglamenta: "No cambia el estado de ninguna de las dos.",
};

/** Vive solo mientras el diálogo está abierto; al guardar sin error lo cierra (la ficha se vuelve a pintar). */
export function FormularioRelacion({ normaId, nombre, normas, alCerrar }: Props & { alCerrar: () => void }) {
  const [resultado, enviar, pendiente] = useActionState(async (previo: EstadoAccion, datos: FormData) => {
    const r = await registrarRelacionAccion(previo, datos);
    if (r === null) alCerrar();
    return r;
  }, null);
  const [tipo, setTipo] = useState<TipoRelacion>("deroga");
  const estado = ESTADO_TRAS_RELACION[tipo];

  return (
    <form action={enviar} onSubmit={enviarSinReiniciar(enviar)} className="flex flex-col gap-4 p-5">
      <input type="hidden" name="normaId" value={normaId} />
      <p aria-hidden="true" className="font-semibold">
        {`Registrar una relación de ${nombre}`}
      </p>
      <Campo etiqueta="Relación" nombre="tipo" ayuda={`Lo que ${nombre} hace con la norma afectada.`}>
        <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoRelacion)} className={CONTROL}>
          {TIPOS_RELACION.map((t) => (
            <option key={t} value={t}>
              {ETIQUETA_RELACION[t]}
            </option>
          ))}
        </select>
      </Campo>
      <Campo etiqueta="Norma afectada" nombre="afectadaId">
        <select required defaultValue="" className={CONTROL}>
          <option value="" disabled>
            Elija la norma
          </option>
          {normas.map((n) => (
            <option key={n.id} value={n.id}>
              {`${n.nombre} · ${n.titulo}`}
            </option>
          ))}
        </select>
      </Campo>
      <p className="text-sm text-muted-foreground">{EFECTO[tipo]}</p>
      <Campo etiqueta="Detalle (opcional)" nombre="detalle" ayuda="Por ejemplo, «deroga los artículos 5 a 9». Hasta 500 caracteres.">
        <input maxLength={500} className={CONTROL} />
      </Campo>
      {estado ? (
        <Campo
          etiqueta={`Fecha en que pasa a ${ETIQUETA_ESTADO_NORMA[estado].toLowerCase()} (opcional)`}
          nombre="fecha"
          ayuda={`Sin fecha, la de expedición de ${nombre}, o la de hoy si no la tiene.`}
        >
          <input type="date" className={CONTROL} />
        </Campo>
      ) : null}
      <ErrorAccion estado={resultado} />
      <div className="flex flex-wrap justify-end gap-2">
        <Boton variante="secundario" onClick={alCerrar}>
          Cancelar
        </Boton>
        <Boton type="submit" pendiente={pendiente}>
          {pendiente ? "Registrando…" : "Registrar la relación"}
        </Boton>
      </div>
    </form>
  );
}

/** «Registrar relación» de la ficha (spec 13C §10.2), para quien administra: «modifica a», «deroga a», «reglamenta a». */
export function DialogoRelacion(props: Props) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <Boton variante="secundario" onClick={() => setAbierto(true)} aria-haspopup="dialog" disabled={props.normas.length === 0}>
        Registrar relación
      </Boton>
      <Dialogo
        abierto={abierto}
        alCerrar={() => setAbierto(false)}
        titulo={`Registrar una relación de ${props.nombre}`}
        className="m-auto w-full max-w-lg rounded-lg border border-border bg-card p-0 text-foreground shadow-xl backdrop:bg-black/40"
      >
        {abierto ? <FormularioRelacion {...props} alCerrar={() => setAbierto(false)} /> : null}
      </Dialogo>
    </>
  );
}
