import type { FormEvent } from "react";

/**
 * El `onSubmit` de un formulario que pide confirmar antes de enviarse (aprobar la cancelación de una actividad, que no se
 * deshace). Cualquier envío sin la marca de confirmación (un Enter en un campo, un envío del navegador) no llega a la acción:
 * se impide y se abre el diálogo. La marca la pone el botón de confirmar del diálogo justo antes de enviar (`confirmado` la lee) y
 * se gasta en ese envío (`gastar`). Sin DOM, para probarlo con objetos simples.
 */
export function envioConConfirmacion(x: {
  pide: boolean;
  confirmado: () => boolean;
  gastar: () => void;
  abrir: () => void;
  enviar: (evento: FormEvent<HTMLFormElement>) => void;
}): (evento: FormEvent<HTMLFormElement>) => void {
  return (evento) => {
    if (x.pide && !x.confirmado()) {
      evento.preventDefault();
      x.abrir();
      return;
    }
    x.gastar();
    x.enviar(evento);
  };
}
