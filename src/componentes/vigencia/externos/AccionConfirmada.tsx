"use client";

import { useActionState } from "react";
import type { EstadoAccion } from "@/app/admin/comun";
import { enviarSinReiniciar } from "@/componentes/admin/sin-reiniciar";
import { ErrorAccion } from "@/componentes/tramites/AccionesSolicitud";
import { Boton } from "@/componentes/ui/Boton";

/**
 * Una acción que no se deshace («Descartar», «Retirar»): el botón real aparece al desplegar, junto a lo que va a
 * pasar; dos gestos deliberados, sin JavaScript para abrirla. Lo que la acción pide (el motivo) va en `children`.
 */
export function AccionConfirmada({
  accion,
  etiqueta,
  confirmacion,
  campos,
  children,
}: {
  accion: (estado: EstadoAccion, formData: FormData) => Promise<EstadoAccion>;
  etiqueta: string;
  confirmacion: string;
  campos: Record<string, string | number>;
  children?: React.ReactNode;
}) {
  const [estado, enviar, pendiente] = useActionState(accion, null);
  return (
    <details className="min-w-0 rounded-md border border-border p-2">
      <summary className="cursor-pointer rounded text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca">
        {`${etiqueta}…`}
      </summary>
      <form action={enviar} onSubmit={enviarSinReiniciar(enviar)} className="mt-2 flex min-w-0 flex-col items-start gap-2">
        {Object.entries(campos).map(([nombre, valor]) => (
          <input key={nombre} type="hidden" name={nombre} value={valor} />
        ))}
        <p className="text-sm text-muted-foreground">{confirmacion}</p>
        {children ? <div className="w-full min-w-0">{children}</div> : null}
        <Boton type="submit" variante="peligro" pendiente={pendiente}>
          {pendiente ? "Procesando…" : etiqueta}
        </Boton>
        <ErrorAccion estado={estado} />
      </form>
    </details>
  );
}
