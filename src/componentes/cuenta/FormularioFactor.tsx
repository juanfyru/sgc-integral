"use client";

import { useActionState, useState } from "react";
import { verificarFactor, type EstadoAccion } from "@/app/acciones-cuenta";

const CLASE_CAMPO =
  "rounded-xl border border-border bg-card px-3 py-2 text-base text-foreground shadow-xs outline-none transition-colors focus:border-azul focus:ring-2 focus:ring-azul/20";

export function FormularioFactor({ volver = "/" }: { volver?: string }) {
  const [estado, accion, pendiente] = useActionState<EstadoAccion, FormData>(
    verificarFactor,
    null,
  );
  const [recuperacion, setRecuperacion] = useState(false);
  return (
    <form action={accion} className="flex w-full max-w-sm flex-col gap-4">
      <input type="hidden" name="volver" value={volver} />
      <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
        {recuperacion ? "Código de recuperación" : "Código de 6 dígitos"}
        <input
          key={recuperacion ? "recuperacion" : "totp"}
          name="codigo"
          autoComplete="one-time-code"
          inputMode={recuperacion ? "text" : "numeric"}
          maxLength={recuperacion ? 11 : 6}
          pattern={recuperacion ? undefined : "[0-9]{6}"}
          required
          autoFocus
          className={`${CLASE_CAMPO} tracking-widest`}
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
        {pendiente ? "Verificando…" : "Verificar"}
      </button>
      <button
        type="button"
        onClick={() => setRecuperacion((v) => !v)}
        className="text-sm text-azul underline underline-offset-2 focus-visible:ring-2 focus-visible:ring-azul/40"
      >
        {recuperacion ? "Usar el código de la aplicación" : "Usar un código de recuperación"}
      </button>
    </form>
  );
}
