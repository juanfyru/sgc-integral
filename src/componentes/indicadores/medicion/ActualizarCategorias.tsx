"use client";

import { useActionState, useId } from "react";
import { actualizarCategoriasDeMedicion } from "@/app/acciones-indicadores";
import type { EstadoConAviso } from "@/app/admin/comun";
import { Boton } from "@/componentes/ui/Boton";

/**
 * «Actualizar categorías» (anexo 14C, §5.3), de quien administra, en una medición desagregada abierta sin reportar: añade a su
 * lista las categorías que hoy están activas y no estaban; nada sale de ella. Va en la tabla del año (junto a «Volver a
 * calcular») y en la pantalla de reportar, que lo explica (`conExplicacion`; en la tabla, la explicación queda solo para los
 * lectores de pantalla, por `aria-describedby`). El botón dice el periodo (`etiqueta`) a quien no lo ve en la fila. No navega:
 * la pantalla se repinta con la lista nueva y el aviso dice cuántas añadió.
 */
export function ActualizarCategorias({ medicionId, etiqueta, conExplicacion = false }: { medicionId: number; etiqueta: string; conExplicacion?: boolean }) {
  const [estado, enviar, pendiente] = useActionState(actualizarCategoriasDeMedicion, null as EstadoConAviso);
  const explicacion = useId();
  return (
    <form action={enviar} className={`flex flex-col items-start gap-1 ${conExplicacion ? "rounded-md border border-border px-3 py-2" : ""}`}>
      <input type="hidden" name="id" value={medicionId} />
      <p id={explicacion} className={conExplicacion ? "text-sm text-muted-foreground" : "sr-only"}>
        Añade a la lista las categorías que hoy están activas y no están en ella; ninguna sale. Una que no operó en el periodo se
        marca «No aplica».
      </p>
      <Boton
        type="submit"
        variante="secundario"
        tamano={conExplicacion ? "md" : "sm"}
        pendiente={pendiente}
        aria-describedby={explicacion}
        className="whitespace-nowrap"
      >
        Actualizar categorías
        <span className="sr-only">{` · ${etiqueta}`}</span>
      </Boton>
      {estado && !estado.ok ? (
        <p role="alert" className="text-xs text-estado-critico-texto">
          {estado.error}
        </p>
      ) : null}
      {estado?.ok ? (
        <p role="status" className="text-xs text-estado-bien-texto">
          {estado.aviso}
        </p>
      ) : null}
    </form>
  );
}
