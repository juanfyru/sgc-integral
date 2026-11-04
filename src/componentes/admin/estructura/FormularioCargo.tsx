"use client";

import { useActionState } from "react";
import type { EstadoAccion } from "@/app/admin/comun";

const claseCampo =
  "rounded-md border border-border bg-card px-3 py-2 text-foreground outline-none transition-colors focus:border-azul focus:ring-2 focus:ring-azul/20";

export function FormularioCargo({
  accion,
  id,
  valores,
  areas,
  cargos,
}: {
  accion: (estado: EstadoAccion, formData: FormData) => Promise<EstadoAccion>;
  id?: number;
  valores?: { nombre: string; areaId: number; superiorId: number | null };
  areas: Array<{ id: number; nombre: string }>;
  // Candidatos a superior; el propio cargo ya viene excluido.
  cargos: Array<{ id: number; nombre: string; areaNombre: string }>;
}) {
  const [estado, enviar, pendiente] = useActionState(accion, null);
  const enviado = (campo: string): string | undefined => {
    const x = estado?.valores?.[campo];
    return typeof x === "string" ? x : undefined;
  };
  const nombre = enviado("nombre") ?? valores?.nombre;
  const areaId = enviado("areaId") ?? (valores ? String(valores.areaId) : undefined);
  const superiorId = enviado("superiorId") ?? (valores?.superiorId ? String(valores.superiorId) : "");

  return (
    <form action={enviar} className="flex max-w-lg flex-col gap-5">
      {id && <input type="hidden" name="id" value={id} />}
      <label className="flex flex-col gap-1 text-sm font-medium">
        Nombre del cargo
        <input name="nombre" required defaultValue={nombre} className={claseCampo} />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Área
        <select name="areaId" required defaultValue={areaId} className={claseCampo}>
          <option value="">Seleccione…</option>
          {areas.map((a) => (
            <option key={a.id} value={a.id}>{a.nombre}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Cargo superior (opcional)
        <select name="superiorId" defaultValue={superiorId} className={claseCampo}>
          <option value="">Sin superior</option>
          {cargos.map((c) => (
            <option key={c.id} value={c.id}>{c.nombre} — {c.areaNombre}</option>
          ))}
        </select>
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
