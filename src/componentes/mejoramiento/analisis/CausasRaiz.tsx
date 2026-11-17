"use client";

import { useActionState, useState } from "react";
import { enviarSinReiniciar } from "@/componentes/admin/sin-reiniciar";
import { Boton } from "@/componentes/ui/Boton";
import { claseControl } from "@/componentes/ui/Campo";
import { AVISO_SIN_PACIENTES } from "@/lib/mejoramiento/textos";
import { ErrorDeAnalisis, useGuardado, type AccionDeAnalisis } from "./Partes";

type Causa = { id: number | null; texto: string; sinAccionPorque: string };

/**
 * Las causas raíz de la ronda (spec 15 §9.2): una lista de la ronda, no un campo de cada análisis; cada causa, en una frase.
 * Las acciones correctivas del plan dicen cuál atacan, y una causa sin acción exige su justificación al enviar el plan.
 * Las que ya tienen id lo conservan al guardar: sus acciones no pierden la causa.
 */
export function CausasRaiz({
  hallazgoId,
  causas,
  guardar,
}: {
  hallazgoId: number;
  causas: ReadonlyArray<{ id: number; texto: string; sinAccionPorque: string | null }>;
  guardar: AccionDeAnalisis;
}) {
  const [lista, setLista] = useState<Causa[]>(() =>
    causas.length > 0
      ? causas.map((c) => ({ id: c.id, texto: c.texto, sinAccionPorque: c.sinAccionPorque ?? "" }))
      : [],
  );
  const [estado, enviar, pendiente] = useActionState(guardar, null);
  const guardado = useGuardado(estado, pendiente);
  const cambiar = (i: number, cambio: Partial<Causa>) => setLista((l) => l.map((c, j) => (j === i ? { ...c, ...cambio } : c)));
  const contenido = JSON.stringify(
    lista
      .filter((c) => c.texto.trim() !== "")
      .map((c) => ({ ...(c.id ? { id: c.id } : {}), texto: c.texto, sinAccionPorque: c.sinAccionPorque })),
  );

  return (
    <form action={enviar} onSubmit={enviarSinReiniciar(enviar)} aria-labelledby="causas-titulo" className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
      <h3 id="causas-titulo" className="font-display text-base font-semibold">
        Causas raíz
      </h3>
      <input type="hidden" name="hallazgoId" value={hallazgoId} />
      <input type="hidden" name="causas" value={contenido} />
      <p id="causas-aviso" className="text-xs text-muted-foreground">
        Una frase por causa. {AVISO_SIN_PACIENTES}
      </p>
      {lista.length === 0 ? <p className="text-sm text-muted-foreground">Sin causas raíz. En una observación o una oportunidad de mejora son opcionales.</p> : null}
      <ol className="flex list-none flex-col gap-3">
        {lista.map((c, i) => (
          <li key={i} className="flex flex-col gap-2 rounded-md border border-border p-3">
            <label htmlFor={`causa-${i}`} className="text-sm font-medium">
              Causa raíz {i + 1}
            </label>
            <input
              id={`causa-${i}`}
              type="text"
              maxLength={500}
              value={c.texto}
              onChange={(e) => cambiar(i, { texto: e.target.value })}
              aria-describedby="causas-aviso"
              className={claseControl}
            />
            <label htmlFor={`causa-sin-${i}`} className="text-xs font-medium text-muted-foreground">
              Si no requiere acción, diga por qué (opcional ahora; se pide al enviar el plan)
            </label>
            <input
              id={`causa-sin-${i}`}
              type="text"
              maxLength={1000}
              value={c.sinAccionPorque}
              onChange={(e) => cambiar(i, { sinAccionPorque: e.target.value })}
              className={claseControl}
            />
            <Boton variante="fantasma" tamano="sm" className="self-start" onClick={() => setLista((l) => l.filter((_, j) => j !== i))}>
              {`Quitar la causa ${i + 1}`}
            </Boton>
          </li>
        ))}
      </ol>
      {lista.length < 20 ? (
        <Boton variante="secundario" tamano="sm" className="self-start" onClick={() => setLista((l) => [...l, { id: null, texto: "", sinAccionPorque: "" }])}>
          Añadir una causa
        </Boton>
      ) : null}
      <ErrorDeAnalisis estado={estado} />
      <div className="flex flex-wrap items-center gap-3">
        <Boton type="submit" pendiente={pendiente}>
          {pendiente ? "Guardando…" : "Guardar las causas"}
        </Boton>
        <span role="status" className="text-sm text-muted-foreground">
          {guardado ? "Guardado." : ""}
        </span>
      </div>
    </form>
  );
}
