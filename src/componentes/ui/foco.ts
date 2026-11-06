import { useEffect, useRef } from "react";

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
