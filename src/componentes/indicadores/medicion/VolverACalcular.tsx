"use client";

import { useActionState } from "react";
import { volverACalcularAccion } from "@/app/acciones-indicadores";
import type { EstadoConAviso } from "@/app/admin/comun";
import { Boton } from "@/componentes/ui/Boton";

/**
 * «Volver a calcular» la foto de un cálculo de flujo (anexo 14B, §5.4), de quien administra y sin confirmación: toma otra
 * vez el cálculo del periodo y, si cambió, queda en el historial. Junto al botón dice si los datos cambiaron.
 */
export function VolverACalcular({ medicionId, etiqueta }: { medicionId: number; etiqueta: string }) {
  const [estado, enviar, pendiente] = useActionState(volverACalcularAccion, null as EstadoConAviso);
  return (
    <form action={enviar} className="flex flex-col items-start gap-1">
      <input type="hidden" name="id" value={medicionId} />
      <Boton type="submit" variante="secundario" tamano="sm" pendiente={pendiente} className="whitespace-nowrap">
        {pendiente ? "Calculando…" : "Volver a calcular"}
        <span className="sr-only">{` ${etiqueta.toLowerCase()}`}</span>
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
