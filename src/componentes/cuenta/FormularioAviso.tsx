"use client";

import { useActionState } from "react";
import { aceptarAvisoAccion, type EstadoAccion } from "@/app/acciones-cuenta";

export function FormularioAviso({ volver = "/" }: { volver?: string }) {
  const [estado, enviar, pendiente] = useActionState<EstadoAccion, FormData>(
    aceptarAvisoAccion,
    null,
  );
  return (
    <form action={enviar} className="flex w-full flex-col gap-4">
      <input type="hidden" name="volver" value={volver} />
      <label className="flex items-start gap-2 text-sm text-foreground">
        <input type="checkbox" name="acepto" value="si" required className="mt-0.5 size-4" />
        He leído el aviso y autorizo el tratamiento de mis datos de cuenta.
      </label>
      {estado && (
        <p role="alert" className="text-sm text-destructive">
          {estado.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pendiente}
        className="rounded-xl bg-azul px-4 py-2 font-medium text-white transition-colors hover:bg-azul-profundo focus-visible:ring-2 focus-visible:ring-azul/40 disabled:opacity-60"
      >
        {pendiente ? "Guardando…" : "Aceptar y continuar"}
      </button>
    </form>
  );
}
