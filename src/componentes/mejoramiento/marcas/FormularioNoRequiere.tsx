"use client";

import { resolverMarcaNoRequiereAccion } from "@/app/acciones-mejoramiento";
import { enviarSinReiniciar } from "@/componentes/admin/sin-reiniciar";
import { useAccionDeDialogo } from "@/componentes/indicadores/admin/useAccionDeDialogo";
import { Boton } from "@/componentes/ui/Boton";
import { Campo, claseControl } from "@/componentes/ui/Campo";
import { AVISO_SIN_PACIENTES } from "@/lib/mejoramiento/textos";

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";

/**
 * «No requiere acción de mejora» (anexo 15B §6.2), solo para el Admin SGC: se despliega y pide la justificación (al menos 10
 * caracteres), que queda en la fila de la marca y se ve en la página del indicador. Resuelta, la página se vuelve a pintar.
 */
export function FormularioNoRequiere({ medicionId, periodo }: { medicionId: number; periodo: string }) {
  const [estado, enviar, pendiente] = useAccionDeDialogo(resolverMarcaNoRequiereAccion, () => undefined);
  const previa = estado?.valores?.justificacion;
  const id = `marca-${medicionId}-justificacion`;
  return (
    <details className="min-w-0 max-w-xl rounded-md border border-border bg-card p-2">
      <summary className={`cursor-pointer rounded text-sm font-medium ${FOCO}`}>
        No requiere acción de mejora
        <span className="sr-only">{`: ${periodo}`}</span>
      </summary>
      <form action={enviar} onSubmit={enviarSinReiniciar(enviar)} className="mt-2 flex min-w-0 flex-col items-start gap-2">
        <input type="hidden" name="medicionId" value={medicionId} />
        <div className="w-full min-w-0">
          <Campo
            etiqueta="Justificación"
            nombre="justificacion"
            id={id}
            ayuda={`Al menos 10 caracteres. La decisión es definitiva y la leen quienes ven el indicador. ${AVISO_SIN_PACIENTES}`}
            error={estado && !estado.ok ? estado.error : undefined}
          >
            <textarea required minLength={10} maxLength={1000} rows={3} defaultValue={typeof previa === "string" ? previa : ""} className={`${claseControl} w-full min-w-0 max-w-full`} />
          </Campo>
        </div>
        <Boton type="submit" variante="secundario" tamano="sm" pendiente={pendiente}>
          {pendiente ? "Guardando…" : "Guardar la decisión"}
        </Boton>
      </form>
    </details>
  );
}
