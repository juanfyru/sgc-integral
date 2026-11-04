"use client";

import { useActionState } from "react";
import { cambiarClaveAccion, type EstadoAccion } from "@/app/acciones-cuenta";

const CLASE_CAMPO =
  "rounded-xl border border-border bg-card px-3 py-2 text-base text-foreground shadow-xs outline-none transition-colors focus:border-azul focus:ring-2 focus:ring-azul/20";

export function FormularioCambioClave() {
  const [estado, enviar, pendiente] = useActionState<EstadoAccion, FormData>(cambiarClaveAccion, null);
  return (
    <form action={enviar} className="flex w-full flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
        Clave actual
        <input type="password" name="claveActual" autoComplete="current-password" maxLength={128} required className={CLASE_CAMPO} />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
        Clave nueva
        <input type="password" name="claveNueva" autoComplete="new-password" minLength={12} maxLength={128} required className={CLASE_CAMPO} />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
        Confirme la clave nueva
        <input type="password" name="confirmacion" autoComplete="new-password" minLength={12} maxLength={128} required className={CLASE_CAMPO} />
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
        {pendiente ? "Guardando…" : "Cambiar clave"}
      </button>
    </form>
  );
}
