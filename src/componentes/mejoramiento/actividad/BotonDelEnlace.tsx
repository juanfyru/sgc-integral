"use client";

import { useActionState } from "react";
import { enviarSinReiniciar } from "@/componentes/admin/sin-reiniciar";
import { Boton, type VarianteBoton } from "@/componentes/ui/Boton";
import { ErrorDelPaso, type AccionDelPaso } from "../pasos/Partes";

/**
 * Un botón que envía una acción con sus campos ocultos y dice su rechazo debajo (Fase 15B, anexo §9.3): «Enlazar» un trámite desde el
 * selector y «Quitar el enlace» en la actividad. `etiqueta` dice qué hace a quien usa un lector de pantalla cuando el botón no basta.
 */
export function BotonDelEnlace({
  ocultos,
  texto,
  enviando,
  etiqueta,
  accion,
  variante = "secundario",
}: {
  ocultos: Record<string, string | number>;
  texto: string;
  enviando: string;
  etiqueta?: string;
  accion: AccionDelPaso;
  variante?: VarianteBoton;
}) {
  const [estado, enviar, pendiente] = useActionState(accion, null);
  return (
    <form action={enviar} onSubmit={enviarSinReiniciar(enviar)} className="flex min-w-0 flex-col items-start gap-1">
      {Object.entries(ocultos).map(([nombre, valor]) => (
        <input key={nombre} type="hidden" name={nombre} value={valor} />
      ))}
      <Boton type="submit" variante={variante} tamano="sm" pendiente={pendiente} aria-label={etiqueta}>
        {pendiente ? enviando : texto}
      </Boton>
      <ErrorDelPaso estado={estado} />
    </form>
  );
}
