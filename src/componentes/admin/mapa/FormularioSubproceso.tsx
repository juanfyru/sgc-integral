"use client";

import { useActionState } from "react";
import type { EstadoAccion } from "@/app/admin/comun";

const claseCampo =
  "rounded-md border border-border bg-card px-3 py-2 text-foreground outline-none transition-colors focus:border-marca focus:ring-2 focus:ring-marca/20";

export function FormularioSubproceso({
  accion,
  procesoId,
  id,
  valores,
}: {
  accion: (estado: EstadoAccion, formData: FormData) => Promise<EstadoAccion>;
  procesoId: number;
  id?: number;
  valores?: { nombre: string; slug: string; sigla: string | null };
}) {
  const [estado, enviar, pendiente] = useActionState(accion, null);
  const v = estado?.valores;
  const val = (c: string): string | undefined => {
    const x = v?.[c];
    return typeof x === "string" ? x : Array.isArray(x) ? x[0] : undefined;
  };
  return (
    <form action={enviar} className="flex max-w-lg flex-col gap-5">
      <input type="hidden" name="procesoId" value={procesoId} />
      {id && <input type="hidden" name="id" value={id} />}
      <label className="flex flex-col gap-1 text-sm font-medium">
        Nombre
        <input name="nombre" required defaultValue={val("nombre") ?? valores?.nombre} className={claseCampo} />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Sigla (opcional)
        <input
          name="sigla"
          maxLength={4}
          defaultValue={val("sigla") ?? valores?.sigla ?? ""}
          aria-describedby="ayuda-sigla-subproceso"
          className={`${claseCampo} font-mono uppercase`}
        />
        <span id="ayuda-sigla-subproceso" className="text-xs font-normal text-muted-foreground">
          De 2 a 4 letras; da el código de sus indicadores (CNT-ID-001)
        </span>
      </label>
      <details>
        <summary className="cursor-pointer text-sm text-muted-foreground">Opciones avanzadas</summary>
        <label className="mt-2 flex flex-col gap-1 text-sm font-medium">
          Slug (URL) — cambiarlo rompe enlaces existentes
          <input
            name="slug"
            defaultValue={val("slug") ?? valores?.slug}
            placeholder="se genera del nombre"
            className={`${claseCampo} font-mono`}
          />
        </label>
      </details>
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
