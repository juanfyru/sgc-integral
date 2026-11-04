"use client";

import { useActionState } from "react";
import type { EstadoAccion } from "@/app/admin/comun";
import { SelectorIcono } from "./SelectorIcono";

const claseCampo =
  "rounded-md border border-border bg-card px-3 py-2 text-foreground outline-none transition-colors focus:border-marca focus:ring-2 focus:ring-marca/20";

const BANDAS = [
  { valor: "estrategicos", etiqueta: "Estratégicos" },
  { valor: "misionales", etiqueta: "Misionales" },
  { valor: "apoyo", etiqueta: "Apoyo" },
  { valor: "evaluacion", etiqueta: "Evaluación y mejora" },
];

export function FormularioMacroproceso({
  accion,
  id,
  valores,
}: {
  accion: (estado: EstadoAccion, formData: FormData) => Promise<EstadoAccion>;
  id?: number;
  valores?: {
    letra: string; nombre: string; banda: string;
    color: string; icono: string; slug: string;
  };
}) {
  const [estado, enviar, pendiente] = useActionState(accion, null);
  const v = estado?.valores;
  const val = (c: string): string | undefined => {
    const x = v?.[c];
    return typeof x === "string" ? x : Array.isArray(x) ? x[0] : undefined;
  };
  return (
    <form action={enviar} className="flex max-w-xl flex-col gap-5">
      {id && <input type="hidden" name="id" value={id} />}
      <div className="grid gap-4 sm:grid-cols-[6rem_1fr]">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Letra
          <input
            name="letra"
            required
            maxLength={1}
            defaultValue={val("letra") ?? valores?.letra}
            className={`${claseCampo} uppercase`}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Nombre
          <input name="nombre" required defaultValue={val("nombre") ?? valores?.nombre} className={claseCampo} />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Banda
        <select name="banda" defaultValue={val("banda") ?? valores?.banda ?? "misionales"} className={claseCampo}>
          {BANDAS.map((b) => (
            <option key={b.valor} value={b.valor}>{b.etiqueta}</option>
          ))}
        </select>
      </label>
      <div className="flex gap-6">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Color
          <input
            type="color"
            name="color"
            defaultValue={val("color") ?? valores?.color ?? "#1B4E8E"}
            className="h-10 w-20 rounded-md border"
          />
        </label>
        <div className="flex flex-col gap-1 text-sm font-medium">
          Ícono
          <SelectorIcono nombre="icono" actual={val("icono") ?? valores?.icono ?? null} requerido />
        </div>
      </div>
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
