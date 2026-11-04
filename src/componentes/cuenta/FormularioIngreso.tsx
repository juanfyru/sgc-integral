"use client";

import { useActionState } from "react";
import { ingresar, type EstadoAccion } from "@/app/acciones-cuenta";

export function FormularioIngreso({ volver = "/" }: { volver?: string }) {
  const [estado, accion, pendiente] = useActionState<EstadoAccion, FormData>(
    ingresar,
    null,
  );
  return (
    <form action={accion} className="flex w-full max-w-sm flex-col gap-4">
      <input type="hidden" name="volver" value={volver} />
      <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
        Usuario
        <input
          name="usuario"
          autoComplete="username"
          required
          className="rounded-xl border border-border bg-card px-3 py-2 text-base text-foreground shadow-xs outline-none transition-colors focus:border-azul focus:ring-2 focus:ring-azul/20"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
        Clave
        <input
          name="clave"
          type="password"
          autoComplete="current-password"
          required
          className="rounded-xl border border-border bg-card px-3 py-2 text-base text-foreground shadow-xs outline-none transition-colors focus:border-azul focus:ring-2 focus:ring-azul/20"
        />
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
        {pendiente ? "Verificando…" : "Ingresar"}
      </button>
    </form>
  );
}
