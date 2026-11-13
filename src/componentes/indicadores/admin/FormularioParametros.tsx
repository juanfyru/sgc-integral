"use client";

import { useActionState } from "react";
import { guardarParametrosAccion } from "@/app/admin/acciones-indicadores";
import { enviarSinReiniciar } from "@/componentes/admin/sin-reiniciar";
import { Boton } from "@/componentes/ui/Boton";
import { Campo, claseControl } from "@/componentes/ui/Campo";
import type { ParametrosIndicadores } from "@/db/consultas/indicadores/maestros";

const CONTROL = `${claseControl} w-full min-w-0 max-w-full`;

const CAMPOS: ReadonlyArray<{
  campo: keyof ParametrosIndicadores; etiqueta: string; ayuda: string; minimo: number; maximo: number;
}> = [
  { campo: "avisoPrevioDias", etiqueta: "Días de aviso previo", ayuda: "Antes de que venza el plazo de reportar, de 0 a 30.", minimo: 0, maximo: 30 },
  { campo: "plazoReporteDias", etiqueta: "Plazo para reportar (días)", ayuda: "Por omisión en una ficha nueva, de 0 a 90.", minimo: 0, maximo: 90 },
  { campo: "incumplimientoPeriodos", etiqueta: "Periodos seguidos de incumplimiento", ayuda: "Para pedir un plan de acción, de 2 a 12.", minimo: 2, maximo: 12 },
  { campo: "variacionConfirmarPct", etiqueta: "Variación que se debe confirmar (%)", ayuda: "Un resultado que cambia más que esto pide confirmación, de 5 a 500.", minimo: 5, maximo: 500 },
];

/** Los parámetros de la configuración de indicadores (spec 14 §12.6). */
export function FormularioParametros({ parametros }: { parametros: ParametrosIndicadores }) {
  const [estado, enviar, pendiente] = useActionState(guardarParametrosAccion, null);
  const v = estado?.valores;
  return (
    <section aria-labelledby="titulo-parametros" className="flex min-w-0 flex-col gap-4 rounded-xl border border-border bg-card p-4">
      <div>
        <h2 id="titulo-parametros" className="text-base font-semibold">
          Parámetros
        </h2>
        <p className="text-sm text-muted-foreground">Valores de toda la instalación; cada ficha puede ajustar los que lo permiten.</p>
      </div>
      <form action={enviar} onSubmit={enviarSinReiniciar(enviar)} className="flex max-w-xl flex-col gap-3">
        {CAMPOS.map((c) => (
          <Campo key={c.campo} etiqueta={c.etiqueta} nombre={c.campo} id={`param-${c.campo}`} ayuda={c.ayuda}>
            <input
              type="number"
              required
              min={c.minimo}
              max={c.maximo}
              step={1}
              defaultValue={typeof v?.[c.campo] === "string" ? (v[c.campo] as string) : parametros[c.campo]}
              className={CONTROL}
            />
          </Campo>
        ))}
        {estado ? (
          <p role="alert" className="text-sm text-estado-critico-texto">
            {estado.error}
          </p>
        ) : null}
        <Boton type="submit" pendiente={pendiente} className="self-start">
          {pendiente ? "Guardando…" : "Guardar los parámetros"}
        </Boton>
      </form>
    </section>
  );
}
