"use client";

import { marcarNotificacionesLeidasAccion } from "@/app/acciones-cuenta";

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";

/** Formulario de «Marcar todas»: vuelve a la página actual (con su query string); sin JavaScript, a la portada. */
export function MarcarTodasLeidas() {
  return (
    <form
      action={marcarNotificacionesLeidasAccion}
      onSubmit={(e) => {
        const volver = e.currentTarget.elements.namedItem("volver");
        if (volver instanceof HTMLInputElement) volver.value = location.pathname + location.search;
      }}
      className="mt-1 border-t border-linea-suave pt-2"
    >
      <input type="hidden" name="volver" defaultValue="" />
      <button
        type="submit"
        className={`w-full rounded-md px-2 py-1.5 text-left text-sm text-marca hover:bg-muted ${FOCO}`}
      >
        Marcar todas como leídas
      </button>
    </form>
  );
}
