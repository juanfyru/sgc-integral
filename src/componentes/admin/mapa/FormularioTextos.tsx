"use client";

import { useActionState } from "react";
import type { EstadoAccion } from "@/app/admin/comun";

const claseCampo =
  "rounded-md border border-border bg-card px-3 py-2 text-foreground outline-none transition-colors focus:border-azul focus:ring-2 focus:ring-azul/20";

export function FormularioTextos({
  accion,
  campos,
  valores,
}: {
  accion: (estado: EstadoAccion, formData: FormData) => Promise<EstadoAccion>;
  campos: ReadonlyArray<{ clave: string; etiqueta: string; textarea?: boolean }>;
  valores: Record<string, string>;
}) {
  const [estado, enviar, pendiente] = useActionState(accion, null);
  const v = estado?.valores;
  const val = (c: string) => {
    const x = v?.[c];
    return (typeof x === "string" ? x : undefined) ?? valores[c] ?? "";
  };
  return (
    <form action={enviar} className="flex max-w-2xl flex-col gap-5">
      {campos.map((c) => (
        <label key={c.clave} className="flex flex-col gap-1 text-sm font-medium">
          {c.etiqueta}
          {c.textarea ? (
            <textarea name={c.clave} rows={2} defaultValue={val(c.clave)} className={claseCampo} />
          ) : (
            <input
              name={c.clave}
              defaultValue={val(c.clave)}
              className={`${claseCampo} ${c.clave === "patron_codigo" ? "font-mono" : ""}`}
            />
          )}
        </label>
      ))}
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
