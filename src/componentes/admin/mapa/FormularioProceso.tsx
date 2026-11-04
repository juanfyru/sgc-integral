"use client";

import { useActionState } from "react";
import type { EstadoAccion } from "@/app/admin/comun";
import { SelectorIcono } from "./SelectorIcono";

const claseCampo =
  "rounded-md border border-border bg-card px-3 py-2 text-foreground outline-none transition-colors focus:border-marca focus:ring-2 focus:ring-marca/20";

export function FormularioProceso({
  accion,
  macroprocesoId,
  id,
  valores,
}: {
  accion: (estado: EstadoAccion, formData: FormData) => Promise<EstadoAccion>;
  macroprocesoId: number;
  id?: number;
  valores?: { nombre: string; sigla: string; icono: string; descripcion: string | null; slug: string };
}) {
  const [estado, enviar, pendiente] = useActionState(accion, null);
  const v = estado?.valores;
  const val = (c: string): string | undefined => {
    const x = v?.[c];
    return typeof x === "string" ? x : Array.isArray(x) ? x[0] : undefined;
  };
  return (
    <form action={enviar} className="flex max-w-xl flex-col gap-5">
      <input type="hidden" name="macroprocesoId" value={macroprocesoId} />
      {id && <input type="hidden" name="id" value={id} />}
      <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Nombre
          <input name="nombre" required defaultValue={val("nombre") ?? valores?.nombre} className={claseCampo} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Sigla (2–4 letras)
          <input
            name="sigla"
            required
            defaultValue={val("sigla") ?? valores?.sigla}
            className={`${claseCampo} font-mono uppercase`}
          />
        </label>
      </div>
      <div className="flex flex-col gap-1 text-sm font-medium">
        Ícono
        <SelectorIcono nombre="icono" actual={val("icono") ?? valores?.icono ?? null} requerido />
      </div>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Descripción (opcional)
        <textarea
          name="descripcion"
          rows={2}
          defaultValue={val("descripcion") ?? valores?.descripcion ?? ""}
          className={claseCampo}
        />
      </label>
      <p className="text-xs text-muted-foreground">
        Cambiar la sigla no reescribe los códigos ya asignados a documentos existentes.
      </p>
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
