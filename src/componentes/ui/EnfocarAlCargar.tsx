"use client";

import { useEffect } from "react";

/**
 * Lleva el foco, al montarse, al elemento `id` (enfocable con `tabIndex={-1}`): la página a la que vuelve una acción lo
 * pinta cuando la dirección lo pide, para que quien usa el teclado o un lector de pantalla llegue a lo que falta (el
 * análisis obligatorio tras reportar; Tarea 19, D-12). Sin JavaScript no hace nada: el ancla `#id` de la dirección lleva
 * la página hasta ahí.
 */
export function EnfocarAlCargar({ id }: { id: string }) {
  useEffect(() => {
    document.getElementById(id)?.focus();
  }, [id]);
  return <span hidden data-enfocar={id} />;
}
