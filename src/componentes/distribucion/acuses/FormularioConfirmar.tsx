"use client";

import { useActionState } from "react";
import { confirmarLecturaAccion } from "@/app/acciones-distribucion";
import { enviarSinReiniciar } from "@/componentes/admin/sin-reiniciar";
import { ErrorAccion } from "@/componentes/tramites/AccionesSolicitud";
import { Boton } from "@/componentes/ui/Boton";

export function FormularioConfirmar({ acuseId, version, abierto }: { acuseId: number; version: number; abierto: boolean }) {
  const [estado, enviar, pendiente] = useActionState(confirmarLecturaAccion, null);
  return (
    <form action={enviar} onSubmit={enviarSinReiniciar(enviar)} className="flex flex-col gap-3">
      <input type="hidden" name="id" value={acuseId} />
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="confirmo" disabled={!abierto} className="mt-0.5 size-4" />
        <span>{`Confirmo que leí y entendí la versión ${version}`}</span>
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <Boton type="submit" variante="primario" disabled={!abierto} pendiente={pendiente}>
          {pendiente ? "Confirmando…" : "Confirmar lectura"}
        </Boton>
        {abierto ? null : (
          <p className="text-sm text-muted-foreground">Abra el documento para habilitar la confirmación</p>
        )}
      </div>
      <ErrorAccion estado={estado} />
    </form>
  );
}
