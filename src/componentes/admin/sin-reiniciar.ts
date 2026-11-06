import { startTransition, type FormEvent } from "react";

/**
 * `onSubmit` de un formulario con `useActionState`. React reinicia un `<form action>` al terminar la
 * acción, también tras un rechazo, y un `<select>` vuelve a su opción inicial aunque cambie su
 * `defaultValue`: quien se equivocó perdería lo que eligió. Enviar desde una transición no reinicia
 * nada. `action` queda para cuando aún no hay JavaScript.
 */
export function enviarSinReiniciar(enviar: (datos: FormData) => void) {
  return (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault();
    const datos = new FormData(evento.currentTarget);
    startTransition(() => enviar(datos));
  };
}
