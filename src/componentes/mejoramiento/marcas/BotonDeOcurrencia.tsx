"use client";

import { resolverMarcaConOcurrenciaAccion } from "@/app/acciones-mejoramiento";
import { enviarSinReiniciar } from "@/componentes/admin/sin-reiniciar";
import { useAccionDeDialogo } from "@/componentes/indicadores/admin/useAccionDeDialogo";
import { Boton } from "@/componentes/ui/Boton";

/** «Añadir como ocurrencia de HZ-…» (anexo 15B §6.2): un botón por hallazgo que sirve; el error queda junto a él. */
export function BotonDeOcurrencia({ medicionId, hallazgoId, codigo, periodo }: { medicionId: number; hallazgoId: number; codigo: string; periodo: string }) {
  const [estado, enviar, pendiente] = useAccionDeDialogo(resolverMarcaConOcurrenciaAccion, () => undefined);
  return (
    <form action={enviar} onSubmit={enviarSinReiniciar(enviar)} className="flex min-w-0 flex-col items-start gap-1">
      <input type="hidden" name="medicionId" value={medicionId} />
      <input type="hidden" name="hallazgoId" value={hallazgoId} />
      <Boton type="submit" variante="secundario" tamano="sm" pendiente={pendiente}>
        {pendiente ? "Añadiendo…" : `Añadir como ocurrencia de ${codigo}`}
        <span className="sr-only">{`: ${periodo}`}</span>
      </Boton>
      {estado && !estado.ok ? (
        <p role="alert" className="text-sm text-estado-critico-texto">
          {estado.error}
        </p>
      ) : null}
    </form>
  );
}
