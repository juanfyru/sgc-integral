"use client";

import { useEffect } from "react";
import { olvidarBorradoresDelHallazgo, sinAvisoDeCambio } from "@/lib/mejoramiento/borrador-evaluacion";

/**
 * Cuida el borrador de la evaluación de un hallazgo en la pestaña (`borrador-evaluacion.ts`); no pinta nada. Una carga de la
 * página sin el aviso de cambio (también tras evaluar, en otra ronda o en una visita cualquiera) lo borra. Con el aviso, el
 * formulario ya lo tomó: aquí solo se quita `visto=cambio` de la dirección, para que recargar no repita el aviso. La página le
 * cambia la `key` con cada carga del hallazgo (estado, eventos y aviso), así una vuelta del servidor vuelve a decidir.
 */
export function BorradorDeLaEvaluacion({ hallazgoId, conAviso }: { hallazgoId: number; conAviso: boolean }) {
  useEffect(() => {
    if (!conAviso) {
      olvidarBorradoresDelHallazgo(hallazgoId);
      return;
    }
    try {
      const { pathname, search, hash } = window.location;
      window.history.replaceState(window.history.state, "", sinAvisoDeCambio(`${pathname}${search}${hash}`));
    } catch {
      // Sin historial que tocar: recargar repetiría el aviso, nada más.
    }
  }, [hallazgoId, conAviso]);
  return null;
}
