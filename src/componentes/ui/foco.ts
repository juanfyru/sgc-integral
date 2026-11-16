import { useEffect, useRef } from "react";

/**
 * Lleva el foco al botón `id` en cuanto exista y esté habilitado: el de una acción sigue deshabilitado mientras termina, el
 * navegador no enfoca un botón deshabilitado y el foco caería en <body>. Lo intenta unos cuantos cuadros; si el botón no
 * llega a estar, lo recibe `respaldo` (un aviso con `tabIndex={-1}`), si existe.
 */
export function enfocarCuandoSePueda(id: string, respaldo?: string, intentos = 10) {
  const boton = document.getElementById(id);
  if (boton instanceof HTMLButtonElement && !boton.disabled) {
    boton.focus();
    return;
  }
  if (intentos > 0) {
    requestAnimationFrame(() => enfocarCuandoSePueda(id, respaldo, intentos - 1));
    return;
  }
  if (respaldo) document.getElementById(respaldo)?.focus();
}

/** El control que tenía el foco se fue de la pantalla: para que no caiga en <body>, lo recibe el título. */
export function enfocarTitulo() {
  if (document.activeElement && document.activeElement !== document.body) return;
  document.querySelector<HTMLElement>('h1[tabindex="-1"]')?.focus();
}

/**
 * Si el componente desaparece con `activo` verdadero, se lleva el foco de quien lo usaba. Corre después
 * de quitar el componente de la página: mientras un diálogo modal siga abierto, el título está inerte.
 */
export function useTituloAlDesaparecer(activo: boolean) {
  const alDesaparecer = useRef(false);
  useEffect(() => {
    alDesaparecer.current = activo;
  }, [activo]);
  useEffect(
    () => () => {
      if (alDesaparecer.current) enfocarTitulo();
    },
    [],
  );
}
