"use client";

import { useState } from "react";
import { cerrarDeNuevoAccion, reabrirMedicionAccion } from "@/app/acciones-indicadores";
import { CLASE_DIALOGO } from "@/componentes/indicadores/admin/DialogoRetirar";
import { useAccionDeDialogo } from "@/componentes/indicadores/admin/useAccionDeDialogo";
import { ErrorAccion } from "@/componentes/tramites/AccionesSolicitud";
import { Boton } from "@/componentes/ui/Boton";
import { Campo, claseControl } from "@/componentes/ui/Campo";
import { Dialogo } from "@/componentes/ui/Dialogo";
import { useTituloAlDesaparecer } from "@/componentes/ui/foco";
import { JUSTIFICACION_MAXIMA, JUSTIFICACION_MINIMA } from "@/lib/indicadores/cierre";

/**
 * «Reabrir» una medición cerrada (spec §8.7): pide la justificación y no la clave. Tras reabrir, la fila cambia y este
 * botón se va: el foco pasa al título de la página.
 */
export function DialogoReabrir({ medicionId, codigo, etiqueta }: { medicionId: number; codigo: string; etiqueta: string }) {
  const [abierto, setAbierto] = useState(false);
  const [hecho, setHecho] = useState(false);
  const cerrar = () => setAbierto(false);
  const [estado, enviar, pendiente] = useAccionDeDialogo(reabrirMedicionAccion, () => {
    setHecho(true);
    cerrar();
  });
  useTituloAlDesaparecer(abierto || hecho);
  const previa = estado?.valores?.justificacion;
  const titulo = `Reabrir ${codigo}, ${etiqueta.toLowerCase()}`;
  return (
    <>
      <Boton variante="secundario" tamano="sm" onClick={() => setAbierto(true)} aria-haspopup="dialog">
        Reabrir<span className="sr-only">{` ${etiqueta}`}</span>
      </Boton>
      <Dialogo abierto={abierto} alCerrar={cerrar} titulo={titulo} className={CLASE_DIALOGO}>
        {/* Solo abierto: varios diálogos en la tabla no repiten el id del campo. */}
        {abierto ? (
          <form action={enviar} className="flex flex-col gap-4 p-5">
            <input type="hidden" name="id" value={medicionId} />
            <p aria-hidden="true" className="font-semibold">
              {titulo}
            </p>
            <p className="text-sm text-muted-foreground">
              La medición se abre para que quien mide la corrija o la reporte tarde, y se le avisa. Queda marcada «Corregida», con esta
              justificación en su historial, y se cierra otra vez con el siguiente cierre del mes o con «Cerrar de nuevo». No pide clave.
            </p>
            <Campo
              etiqueta="Justificación"
              nombre="justificacion"
              id={`reabrir-${medicionId}`}
              ayuda={`Entre ${JUSTIFICACION_MINIMA} y ${JUSTIFICACION_MAXIMA} caracteres. La ve quien ve el indicador.`}
            >
              <textarea
                required
                minLength={JUSTIFICACION_MINIMA}
                maxLength={JUSTIFICACION_MAXIMA}
                rows={4}
                defaultValue={typeof previa === "string" ? previa : ""}
                className={`${claseControl} w-full`}
              />
            </Campo>
            <ErrorAccion estado={estado} />
            <div className="flex flex-wrap justify-end gap-2">
              <Boton variante="secundario" onClick={cerrar}>
                Volver
              </Boton>
              <Boton type="submit" pendiente={pendiente}>
                {pendiente ? "Reabriendo…" : "Reabrir la medición"}
              </Boton>
            </div>
          </form>
        ) : null}
      </Dialogo>
    </>
  );
}

/**
 * «Cerrar de nuevo» una medición reabierta (F14-DC31), con el último cierre y como esté, sin confirmación. Tras cerrarla,
 * la fila cambia y este botón se va: el foco pasa al título de la página.
 */
export function CerrarDeNuevo({ medicionId, etiqueta }: { medicionId: number; etiqueta: string }) {
  const [hecho, setHecho] = useState(false);
  const [estado, enviar, pendiente] = useAccionDeDialogo(cerrarDeNuevoAccion, () => setHecho(true));
  useTituloAlDesaparecer(hecho);
  return (
    <form action={enviar} className="flex flex-col items-start gap-1">
      <input type="hidden" name="id" value={medicionId} />
      <Boton type="submit" variante="secundario" tamano="sm" pendiente={pendiente}>
        {pendiente ? "Cerrando…" : "Cerrar de nuevo"}
        <span className="sr-only">{` ${etiqueta}`}</span>
      </Boton>
      {estado && !estado.ok ? (
        <p role="alert" className="text-xs text-estado-critico-texto">
          {estado.error}
        </p>
      ) : null}
    </form>
  );
}
