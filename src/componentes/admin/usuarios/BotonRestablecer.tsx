"use client";

import { useActionState } from "react";
import type { EstadoRestablecer } from "@/app/admin/acciones-usuarios";
import { ClaveTemporal } from "@/componentes/admin/usuarios/ClaveTemporal";

type Props = {
  accion: (estado: EstadoRestablecer, formData: FormData) => Promise<EstadoRestablecer>;
  id: number;
  usuario: string;
};

export function BotonRestablecer({ accion, id, usuario }: Props) {
  const [estado, enviar, pendiente] = useActionState(accion, null);

  if (estado?.ok) return <ClaveTemporal clave={estado.claveTemporal} usuario={usuario} />;

  return (
    <details className="rounded-md border p-2">
      <summary className="cursor-pointer text-sm font-medium">Restablecer clave…</summary>
      <div className="mt-2 flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">
          Se generará una clave temporal nueva, se cerrarán todas las sesiones de la persona y se
          levantará cualquier bloqueo. Deberá cambiarla al ingresar.
        </p>
        <form action={enviar} className="flex flex-col items-start gap-2">
          <input type="hidden" name="id" value={id} />
          <button
            type="submit"
            disabled={pendiente}
            className="rounded-md border border-estado-critico/40 bg-estado-critico-fondo px-3 py-1.5 text-sm font-medium text-estado-critico-texto hover:border-estado-critico disabled:opacity-60"
          >
            {pendiente ? "Procesando…" : "Restablecer clave"}
          </button>
          {estado && !estado.ok && (
            <p role="alert" className="text-sm text-estado-critico-texto">{estado.error}</p>
          )}
        </form>
      </div>
    </details>
  );
}
