"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { GRUPO_BARRA_SUPERIOR, cerrarConEscape, cerrarSiPulsaFuera, grupoBarraSuperior } from "./logica-desplegable";

/**
 * <details> de la barra superior (campana y menú de usuario). Sin JavaScript abre y cierra como
 * siempre. Con él: se cierra al navegar (la barra vive en el layout y persiste), con Escape (el foco
 * vuelve al resumen) y al pulsar fuera, y abrir uno cierra el otro. El `name` común da la misma
 * exclusión sin JavaScript en los navegadores que la implementan.
 */
export function Desplegable({
  resumen,
  etiquetaResumen,
  claseResumen,
  children,
}: {
  resumen: React.ReactNode;
  etiquetaResumen?: string;
  claseResumen: string;
  children: React.ReactNode;
}) {
  const detalles = useRef<HTMLDetailsElement>(null);
  const resumenRef = useRef<HTMLElement>(null);
  const [abierto, setAbierto] = useState(false);
  const ruta = usePathname();

  useEffect(() => {
    if (detalles.current) detalles.current.open = false;
  }, [ruta]);

  useEffect(() => {
    const el = detalles.current;
    return el ? grupoBarraSuperior.registrar(el) : undefined;
  }, []);

  useEffect(() => {
    const el = detalles.current;
    if (!abierto || !el) return;
    const alPulsar = (e: PointerEvent) => {
      cerrarSiPulsaFuera(el, e.target instanceof Node ? e.target : null);
    };
    const alTeclear = (e: KeyboardEvent) => {
      if (cerrarConEscape(el, e.key, document.activeElement, document.body)) resumenRef.current?.focus();
    };
    document.addEventListener("pointerdown", alPulsar);
    document.addEventListener("keydown", alTeclear);
    return () => {
      document.removeEventListener("pointerdown", alPulsar);
      document.removeEventListener("keydown", alTeclear);
    };
  }, [abierto]);

  return (
    <details
      ref={detalles}
      name={GRUPO_BARRA_SUPERIOR}
      className="relative shrink-0"
      onToggle={(e) => {
        const el = e.currentTarget;
        setAbierto(el.open);
        if (el.open) grupoBarraSuperior.alAbrir(el);
      }}
    >
      <summary ref={resumenRef} aria-label={etiquetaResumen} className={claseResumen}>
        {resumen}
      </summary>
      {children}
    </details>
  );
}
