"use client";

import { useActionState } from "react";
import type { EstadoAccion } from "@/app/admin/comun";

const claseCampo =
  "rounded-md border border-border bg-card px-3 py-2 text-foreground outline-none transition-colors focus:border-azul focus:ring-2 focus:ring-azul/20";

export function FormularioArea({
  accion,
  id,
  nombre,
}: {
  accion: (estado: EstadoAccion, formData: FormData) => Promise<EstadoAccion>;
  id?: number;
  nombre?: string;
}) {
  const [estado, enviar, pendiente] = useActionState(accion, null);
  const enviado = estado?.valores?.nombre;
  const valor = typeof enviado === "string" ? enviado : nombre;

  return (
    <form action={enviar} className="flex max-w-lg flex-col gap-5">
      {id && <input type="hidden" name="id" value={id} />}
      <label className="flex flex-col gap-1 text-sm font-medium">
        Nombre del área
        <input name="nombre" required defaultValue={valor} className={claseCampo} />
      </label>
      {estado && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
          {estado.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pendiente}
        className="self-start rounded-md bg-azul px-5 py-2 font-medium text-white hover:bg-azul-profundo disabled:opacity-60"
      >
        {pendiente ? "Guardando…" : "Guardar"}
      </button>
    </form>
  );
}
