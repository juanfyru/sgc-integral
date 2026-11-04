"use client";

import { useActionState } from "react";
import type { EstadoAccion } from "@/app/admin/comun";
import { SelectorIcono } from "./SelectorIcono";

const claseCampo =
  "rounded-md border border-border bg-card px-3 py-2 text-foreground outline-none transition-colors focus:border-marca focus:ring-2 focus:ring-marca/20";

const TIPOS = [
  { valor: "entrada", etiqueta: "Entrada" },
  { valor: "salida", etiqueta: "Salida" },
  { valor: "convencion", etiqueta: "Convención" },
];

export function FormularioPeriferico({
  accion,
  id,
  valores,
}: {
  accion: (estado: EstadoAccion, formData: FormData) => Promise<EstadoAccion>;
  id?: number;
  valores?: { tipo: string; texto: string; icono: string | null };
}) {
  const [estado, enviar, pendiente] = useActionState(accion, null);
  const v = estado?.valores;
  const val = (c: string): string | undefined => {
    const x = v?.[c];
    return typeof x === "string" ? x : Array.isArray(x) ? x[0] : undefined;
  };
  return (
    <form action={enviar} className="flex max-w-lg flex-col gap-5">
      {id && <input type="hidden" name="id" value={id} />}
      <label className="flex flex-col gap-1 text-sm font-medium">
        Tipo
        <select
          name="tipo"
          defaultValue={val("tipo") ?? valores?.tipo ?? "entrada"}
          className={claseCampo}
        >
          {TIPOS.map((t) => (
            <option key={t.valor} value={t.valor}>{t.etiqueta}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Texto
        <input name="texto" required defaultValue={val("texto") ?? valores?.texto} className={claseCampo} />
      </label>
      <div className="flex flex-col gap-1 text-sm font-medium">
        Ícono
        <SelectorIcono nombre="icono" actual={val("icono") ?? valores?.icono ?? null} />
      </div>
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
