"use client";

import { useEffect } from "react";

/**
 * Quita `respuesta=cambio` de la dirección cuando la página ya pintó el aviso de que la lista de los listos cambió (anexo §3.8,
 * Review Focus 4), para que recargar no lo repita. Va junto al aviso, se pinte o no el formulario (con la lista nueva vacía no se
 * pinta). No pinta nada.
 */
export function QuitarAvisoDeCambio() {
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      if (!url.searchParams.has("respuesta")) return;
      url.searchParams.delete("respuesta");
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    } catch {
      // Sin historial que tocar: recargar repetiría el aviso, nada más.
    }
  }, []);
  return null;
}
