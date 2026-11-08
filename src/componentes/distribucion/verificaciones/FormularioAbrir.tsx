"use client";

import { useActionState } from "react";
import { abrirVerificacionAccion } from "@/app/acciones-distribucion";
import type { EstadoAccion } from "@/app/admin/comun";
import { enviarSinReiniciar } from "@/componentes/admin/sin-reiniciar";
import { ErrorAccion } from "@/componentes/tramites/AccionesSolicitud";
import { Boton } from "@/componentes/ui/Boton";

/** Abrir una verificación escribe: se hace con un envío (POST), nunca al abrir la página. */
export function FormularioAbrir({ puntoId, punto }: { puntoId: number; punto: string }) {
  const [estado, enviar, pendiente] = useActionState<EstadoAccion, FormData>(abrirVerificacionAccion, null);
  return (
    <form action={enviar} onSubmit={enviarSinReiniciar(enviar)} className="flex flex-col items-start gap-3">
      <input type="hidden" name="puntoId" value={puntoId} />
      <ErrorAccion estado={estado} />
      <Boton type="submit" pendiente={pendiente}>
        {pendiente ? "Abriendo…" : `Verificar ${punto}`}
      </Boton>
    </form>
  );
}
