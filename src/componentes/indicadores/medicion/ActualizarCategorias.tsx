"use client";

import { useActionState, useEffect, useId, useRef } from "react";
import { actualizarCategoriasDelDatoCompartido, actualizarCategoriasDeMedicion } from "@/app/acciones-indicadores";
import type { EstadoConAviso } from "@/app/admin/comun";
import { Boton } from "@/componentes/ui/Boton";
import { enfocarCuandoSePueda } from "@/componentes/ui/foco";

type Accion = (previo: EstadoConAviso, datos: FormData) => Promise<EstadoConAviso>;

const DE_LA_MEDICION =
  "Añade a la lista las categorías que hoy están activas y no están en ella; ninguna sale. Una que no operó en el periodo se marca «No aplica».";
const DEL_DATO = "Añade a la lista de este periodo las categorías que hoy están activas y no están en ella; ninguna sale.";

/**
 * El formulario de «Actualizar categorías», el mismo para una medición y para un periodo de un dato: el botón dice el periodo
 * (`etiqueta`) a quien no lo ve en la fila; con `conExplicacion` la explicación va a la vista y, sin ella, solo para los
 * lectores de pantalla (`aria-describedby`). No navega: la pantalla se repinta con la lista nueva y el aviso dice cuántas
 * añadió. Mientras espera, el botón se deshabilita y el foco caería en <body>: al terminar vuelve a él, o al aviso si el botón
 * ya no está (como «Subir» y «Bajar» de las dimensiones).
 */
function Formulario({ id, etiqueta, accion, explica, conExplicacion }: { id: number; etiqueta: string; accion: Accion; explica: string; conExplicacion: boolean }) {
  const [estado, enviar, pendiente] = useActionState(accion, null as EstadoConAviso);
  const explicacion = useId();
  const boton = useId();
  const aviso = useId();
  const pulsado = useRef(false);
  useEffect(() => {
    if (pendiente || !pulsado.current) return;
    pulsado.current = false;
    enfocarCuandoSePueda(boton, aviso);
  }, [pendiente, boton, aviso]);
  return (
    <form action={enviar} className={`flex flex-col items-start gap-1 ${conExplicacion ? "rounded-md border border-border px-3 py-2" : ""}`}>
      <input type="hidden" name="id" value={id} />
      <p id={explicacion} className={conExplicacion ? "text-sm text-muted-foreground" : "sr-only"}>
        {explica}
      </p>
      <Boton
        id={boton}
        type="submit"
        variante="secundario"
        tamano={conExplicacion ? "md" : "sm"}
        pendiente={pendiente}
        aria-describedby={explicacion}
        onClick={() => {
          pulsado.current = true;
        }}
        className="whitespace-nowrap"
      >
        Actualizar categorías
        <span className="sr-only">{` · ${etiqueta.toLowerCase()}`}</span>
      </Boton>
      {estado && !estado.ok ? (
        <p id={aviso} tabIndex={-1} role="alert" className="text-xs text-estado-critico-texto">
          {estado.error}
        </p>
      ) : null}
      {estado?.ok ? (
        <p id={aviso} tabIndex={-1} role="status" className="text-xs text-estado-bien-texto">
          {estado.aviso}
        </p>
      ) : null}
    </form>
  );
}

/**
 * «Actualizar categorías» (anexo 14C, §5.3), de quien administra, en una medición desagregada abierta sin reportar: añade a su
 * lista las categorías que hoy están activas y no estaban; nada sale de ella. Va en la tabla del año (junto a «Volver a
 * calcular») y en la pantalla de reportar, que lo explica (`conExplicacion`; en la tabla, la explicación queda solo para los
 * lectores de pantalla).
 */
export function ActualizarCategorias({ medicionId, etiqueta, conExplicacion = false }: { medicionId: number; etiqueta: string; conExplicacion?: boolean }) {
  return <Formulario id={medicionId} etiqueta={etiqueta} accion={actualizarCategoriasDeMedicion} explica={DE_LA_MEDICION} conExplicacion={conExplicacion} />;
}

/**
 * Lo mismo para un periodo pendiente de un dato compartido con dimensión (anexo 14C, §5.7), en su fila de la página del dato:
 * la salida del periodo que nació sin categorías y de la sede que se registró tarde. En un dato no hay «No aplica»: la
 * categoría que no operó se reporta en cero.
 */
export function ActualizarCategoriasDelDato({ periodoId, etiqueta }: { periodoId: number; etiqueta: string }) {
  return <Formulario id={periodoId} etiqueta={etiqueta} accion={actualizarCategoriasDelDatoCompartido} explica={DEL_DATO} conExplicacion={false} />;
}
