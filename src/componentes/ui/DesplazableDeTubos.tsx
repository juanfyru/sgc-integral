"use client";

import { useEffect, useRef } from "react";

/**
 * Lleva la columna `data-inicio` a la vista (Tarea 19, D-2): si la gráfica se desplaza y esa columna (la del último
 * periodo con valor, marcada `data-columna`) queda cortada a la izquierda, el contenedor se corre hasta que su borde
 * derecho coincida con el del contenedor. Si ya se ve entera, no se mueve (y siguen a la vista las etiquetas de la meta y
 * del límite, a la derecha). Funciona con `direction: rtl` y `ltr`: sumar a `scrollLeft` corre el contenido igual en los
 * dos.
 */
export function llevarALaColumnaInicial(contenedor: HTMLElement | null): void {
  if (!contenedor) return;
  const inicio = contenedor.dataset.inicio;
  if (inicio === undefined || contenedor.scrollWidth <= contenedor.clientWidth) return;
  const columna = contenedor.querySelector(`[data-columna="${inicio}"]`);
  if (!columna) return;
  const caja = contenedor.getBoundingClientRect();
  const zona = columna.getBoundingClientRect();
  if (zona.left >= caja.left - 0.5) return;
  contenedor.scrollLeft += zona.right - caja.right;
}

/**
 * El contenedor que se desplaza de una gráfica de tubos (la principal y la de cada variable). El servidor lo pinta con su
 * columna inicial (`inicio`, de `columnaInicial`); al montarse, el navegador la deja a la vista. Sin JavaScript, arranca
 * en lo más reciente (`direction: rtl`), como antes.
 */
export function DesplazableDeTubos({
  inicio,
  className,
  children,
  tabIndex,
  role,
  "aria-label": etiqueta,
}: {
  inicio: number | null;
  className: string;
  children: React.ReactNode;
  tabIndex?: number;
  role?: string;
  "aria-label"?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => llevarALaColumnaInicial(ref.current), [inicio]);
  return (
    <div ref={ref} className={className} data-inicio={inicio ?? undefined} tabIndex={tabIndex} role={role} aria-label={etiqueta}>
      {children}
    </div>
  );
}
