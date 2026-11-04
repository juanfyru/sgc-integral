"use client";

import { useActionState } from "react";
import type { EstadoAccion } from "@/app/admin/acciones";

type Props = {
  accion: (estado: EstadoAccion, formData: FormData) => Promise<EstadoAccion>;
  etiqueta: string;
  confirmacion?: string;
  campos: Record<string, string | number>;
  tono?: "primario" | "peligro";
};

/**
 * Formulario genérico de mutación. La confirmación usa <details> nativo:
 * el botón real solo aparece al desplegar — dos gestos deliberados, sin JS.
 */
export function FormAccion({ accion, etiqueta, confirmacion, campos, tono = "primario" }: Props) {
  const [estado, enviar, pendiente] = useActionState(accion, null);
  const claseBoton =
    tono === "peligro"
      ? "rounded-md border border-estado-critico/40 bg-estado-critico-fondo px-3 py-1.5 text-sm font-medium text-estado-critico-texto hover:border-estado-critico disabled:opacity-60"
      : "rounded-md bg-azul px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-azul-profundo disabled:opacity-60";

  const formulario = (
    <form action={enviar} className="flex flex-col items-start gap-2">
      {Object.entries(campos).map(([nombre, valor]) => (
        <input key={nombre} type="hidden" name={nombre} value={valor} />
      ))}
      <button type="submit" disabled={pendiente} className={claseBoton}>
        {pendiente ? "Procesando…" : etiqueta}
      </button>
      {estado && (
        <p role="alert" className="text-sm text-estado-critico-texto">{estado.error}</p>
      )}
    </form>
  );

  if (!confirmacion) return formulario;
  return (
    <details className="rounded-md border p-2">
      <summary className="cursor-pointer text-sm font-medium">{etiqueta}…</summary>
      <div className="mt-2 flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">{confirmacion}</p>
        {formulario}
      </div>
    </details>
  );
}
