"use client";

import { useEffect, useRef } from "react";
import { desplazamientoInicial } from "./geometria-tubos";

/**
 * Deja la gráfica, al montarse, donde dice `desplazamientoInicial` (Tarea 19, D-2; residuos finales, punto 2): la columna
 * `data-inicio` (la del último periodo con valor) entera a la vista y el borde izquierdo de lo visible en el de una
 * columna (`data-columna`), para que ningún valor se lea partido. Si para eso hace falta pasar de lo más reciente, añade a
 * la derecha un relleno de menos de una columna. Mide el lienzo (`.tubo-lienzo`, a 1:1 cuando se desplaza) y sus columnas
 * en la pantalla. Funciona con `direction: rtl` y `ltr`: sumar a `scrollLeft` corre el contenido igual en los dos. Si la
 * gráfica cabe, no hace nada.
 */
export function llevarALaColumnaInicial(contenedor: HTMLElement | null): void {
  if (!contenedor) return;
  contenedor.style.paddingRight = "";
  if (contenedor.scrollWidth <= contenedor.clientWidth) return;
  const lienzo = contenedor.querySelector(".tubo-lienzo");
  const columnas = contenedor.querySelectorAll("[data-columna]");
  if (!lienzo || columnas.length === 0) return;
  const medida = lienzo.getBoundingClientRect();
  const primera = columnas[0].getBoundingClientRect();
  const inicio = contenedor.dataset.inicio;
  const { desde, relleno } = desplazamientoInicial({
    visible: contenedor.clientWidth,
    lienzo: medida.width,
    izq: primera.left - medida.left,
    paso: primera.width,
    periodos: columnas.length,
    columna: inicio === undefined ? null : Number(inicio),
  });
  if (relleno > 0) contenedor.style.paddingRight = `${Math.ceil(relleno)}px`;
  // Lo que se ve ahora, medido después del relleno: desde el borde izquierdo del lienzo hasta el de lo visible.
  const visto = contenedor.getBoundingClientRect().left + contenedor.clientLeft - lienzo.getBoundingClientRect().left;
  contenedor.scrollLeft += desde - visto;
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
