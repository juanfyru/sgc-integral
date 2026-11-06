"use client";

import { useActionState } from "react";
import type { EstadoAccion } from "@/app/admin/acciones";
import { enviarSinReiniciar } from "./sin-reiniciar";

type Valores = {
  fechaElaboracion: string | null; fechaRevision: string | null;
  fechaAprobacion: string | null; elaboro: string | null;
  reviso: string | null; aprobo: string | null; resumenCambios: string | null;
};

const claseCampo = "rounded-md border border-border bg-card px-3 py-1.5 text-sm";

export function FormularioVersionCliente({
  versionId, valores, accion,
}: {
  versionId: number;
  valores: Valores;
  accion: (estado: EstadoAccion, formData: FormData) => Promise<EstadoAccion>;
}) {
  const [estado, enviar, pendiente] = useActionState(accion, null);
  return (
    <form action={enviar} onSubmit={enviarSinReiniciar(enviar)} className="mt-3 grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="versionId" value={versionId} />
      <label className="flex flex-col gap-1 text-sm">Elaboró
        <input name="elaboro" defaultValue={valores.elaboro ?? ""} className={claseCampo} />
      </label>
      <label className="flex flex-col gap-1 text-sm">Fecha de elaboración
        <input name="fechaElaboracion" type="date" defaultValue={valores.fechaElaboracion ?? ""} className={claseCampo} />
      </label>
      <label className="flex flex-col gap-1 text-sm">Revisó
        <input name="reviso" defaultValue={valores.reviso ?? ""} className={claseCampo} />
      </label>
      <label className="flex flex-col gap-1 text-sm">Fecha de revisión
        <input name="fechaRevision" type="date" defaultValue={valores.fechaRevision ?? ""} className={claseCampo} />
      </label>
      <label className="flex flex-col gap-1 text-sm">Aprobó (exigido para publicar)
        <input name="aprobo" defaultValue={valores.aprobo ?? ""} className={claseCampo} />
      </label>
      <label className="flex flex-col gap-1 text-sm">Fecha de aprobación (exigida para publicar)
        <input name="fechaAprobacion" type="date" defaultValue={valores.fechaAprobacion ?? ""} className={claseCampo} />
      </label>
      <label className="flex flex-col gap-1 text-sm sm:col-span-2">Resumen de cambios
        <textarea name="resumenCambios" rows={2} defaultValue={valores.resumenCambios ?? ""} className={claseCampo} />
      </label>
      {estado && <p role="alert" className="text-sm text-estado-critico-texto sm:col-span-2">{estado.error}</p>}
      <button type="submit" disabled={pendiente}
        className="justify-self-start rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted disabled:opacity-60 sm:col-span-2">
        {pendiente ? "Guardando…" : "Guardar control de versión"}
      </button>
    </form>
  );
}
