"use client";

import { useState } from "react";
import { resolverImpactoNoAfectaAccion } from "@/app/acciones-indicadores";
import { enviarSinReiniciar } from "@/componentes/admin/sin-reiniciar";
import { useAccionDeDialogo } from "@/componentes/indicadores/admin/useAccionDeDialogo";
import { Boton } from "@/componentes/ui/Boton";
import { Campo, claseControl } from "@/componentes/ui/Campo";
import { useTituloAlDesaparecer } from "@/componentes/ui/foco";

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";
const CONTROL = `${claseControl} w-full min-w-0 max-w-full`;

/**
 * «No afecta» de una revisión por cambio de norma (anexo 14B, §9): se despliega (dos gestos deliberados) y pide la nota, de
 * 5 a 500 caracteres; el error queda junto a la nota y asociado a ella. Resuelta, la página se vuelve a pintar sin la
 * revisión y el foco, que se iba con ella, pasa al título de la página (como «Registrar el envío»), aunque queden otras.
 */
export function FormularioNoAfecta({ impactoId, norma }: { impactoId: number; norma: string }) {
  const [hecho, setHecho] = useState(false);
  const [estado, enviar, pendiente] = useAccionDeDialogo(resolverImpactoNoAfectaAccion, () => setHecho(true));
  useTituloAlDesaparecer(hecho);
  const previa = estado?.valores?.nota;
  return (
    <details className="min-w-0 max-w-xl rounded-md border border-border bg-card p-2">
      <summary className={`cursor-pointer rounded text-sm font-medium ${FOCO}`}>
        No afecta
        <span className="sr-only">{`: el cambio de ${norma}`}</span>
      </summary>
      <form action={enviar} onSubmit={enviarSinReiniciar(enviar)} className="mt-2 flex min-w-0 flex-col items-start gap-2">
        <input type="hidden" name="impactoId" value={impactoId} />
        <div className="w-full min-w-0">
          <Campo
            etiqueta="Por qué no afecta"
            nombre="nota"
            id={`impacto-indicador-${impactoId}-nota`}
            ayuda="Al menos 5 caracteres. Queda en la historia del indicador."
            error={estado && !estado.ok ? estado.error : undefined}
          >
            <textarea required minLength={5} maxLength={500} rows={2} defaultValue={typeof previa === "string" ? previa : ""} className={CONTROL} />
          </Campo>
        </div>
        <Boton type="submit" variante="secundario" tamano="sm" pendiente={pendiente}>
          {pendiente ? "Registrando…" : "Registrar que no afecta"}
        </Boton>
      </form>
    </details>
  );
}
