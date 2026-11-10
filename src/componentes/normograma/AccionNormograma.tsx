"use client";

import { useActionState } from "react";
import type { EstadoAccion } from "@/app/admin/comun";
import { enviarSinReiniciar } from "@/componentes/admin/sin-reiniciar";
import { ErrorAccion } from "@/componentes/tramites/AccionesSolicitud";
import { Boton, type VarianteBoton } from "@/componentes/ui/Boton";

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";

type Accion = (estado: EstadoAccion, formData: FormData) => Promise<EstadoAccion>;
/** `hecho`: la acción terminó sin error (las del normograma no navegan: la página se vuelve a pintar). */
type Estado = EstadoAccion | { ok: true };

/**
 * Una acción del normograma en su propio formulario: los campos ocultos en `campos` y lo que pide (una nota, un
 * motivo, un requisito) en `children`. Con `desplegable`, el formulario aparece al desplegar ese texto (dos gestos
 * deliberados, sin JavaScript para abrirlo); si no, va en línea. El error se dice junto al botón y el éxito también.
 */
export function AccionNormograma({
  accion,
  boton,
  campos,
  desplegable,
  explicacion,
  variante = "primario",
  tamano = "md",
  children,
}: {
  accion: Accion;
  boton: string;
  campos: Record<string, string | number>;
  desplegable?: string;
  explicacion?: string;
  variante?: VarianteBoton;
  tamano?: "sm" | "md";
  children?: React.ReactNode;
}) {
  const [estado, enviar, pendiente] = useActionState<Estado, FormData>(async (previo, datos) => {
    const r = await accion(previo && "error" in previo ? previo : null, datos);
    return r ?? { ok: true };
  }, null);

  const formulario = (
    <form action={enviar} onSubmit={enviarSinReiniciar(enviar)} className="flex min-w-0 flex-col items-start gap-2">
      {Object.entries(campos).map(([nombre, valor]) => (
        <input key={nombre} type="hidden" name={nombre} value={valor} />
      ))}
      {explicacion ? <p className="text-sm text-muted-foreground">{explicacion}</p> : null}
      {children ? <div className="flex w-full min-w-0 flex-col gap-3">{children}</div> : null}
      <Boton type="submit" variante={variante} tamano={tamano} pendiente={pendiente}>
        {pendiente ? "Procesando…" : boton}
      </Boton>
      {estado && "error" in estado ? <ErrorAccion estado={estado} /> : null}
      {estado && "ok" in estado && estado.ok ? (
        <p role="status" className="text-sm text-estado-bien-texto">
          Listo.
        </p>
      ) : null}
    </form>
  );

  if (!desplegable) return formulario;
  return (
    <details className="min-w-0 rounded-md border border-border p-2">
      <summary className={`cursor-pointer rounded text-sm font-medium ${FOCO}`}>{desplegable}</summary>
      <div className="mt-2">{formulario}</div>
    </details>
  );
}
