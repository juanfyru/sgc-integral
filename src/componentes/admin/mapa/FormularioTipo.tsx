"use client";

import { useActionState } from "react";
import type { EstadoAccion } from "@/app/admin/comun";

const claseCampo =
  "rounded-md border border-border bg-card px-3 py-2 text-foreground outline-none transition-colors focus:border-marca focus:ring-2 focus:ring-marca/20";

export function FormularioTipo({
  accion,
  id,
  valores,
}: {
  accion: (estado: EstadoAccion, formData: FormData) => Promise<EstadoAccion>;
  id?: number;
  valores?: { nombre: string; sigla: string; esDiligenciable: boolean };
}) {
  const [estado, enviar, pendiente] = useActionState(accion, null);
  const v = estado?.valores;
  const val = (campo: string): string | undefined => {
    const x = v?.[campo];
    return typeof x === "string" ? x : Array.isArray(x) ? x[0] : undefined;
  };

  return (
    <form action={enviar} className="flex max-w-lg flex-col gap-5">
      {id && <input type="hidden" name="id" value={id} />}
      <label className="flex flex-col gap-1 text-sm font-medium">
        Nombre
        <input
          name="nombre"
          required
          defaultValue={val("nombre") ?? valores?.nombre}
          className={claseCampo}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Sigla (2–4 letras, para los códigos: PR, FT, MN…)
        <input
          name="sigla"
          required
          defaultValue={val("sigla") ?? valores?.sigla}
          className={`${claseCampo} font-mono uppercase`}
        />
      </label>
      <label className="flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          name="esDiligenciable"
          defaultChecked={v ? val("esDiligenciable") === "on" : valores?.esDiligenciable}
        />
        Es diligenciable (formato que se llena, no solo lectura)
      </label>
      {estado && (
        <p role="alert" className="rounded-md bg-estado-critico-fondo px-3 py-2 text-sm text-estado-critico-texto">
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
