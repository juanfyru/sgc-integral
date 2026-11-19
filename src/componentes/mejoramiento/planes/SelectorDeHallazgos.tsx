"use client";

import { useActionState } from "react";
import { enviarSinReiniciar } from "@/componentes/admin/sin-reiniciar";
import { Boton } from "@/componentes/ui/Boton";
import type { CandidatoParaPlan } from "@/db/consultas/mejoramiento/planes-lectura";
import { ETIQUETA_ORIGEN } from "@/lib/mejoramiento/origenes";
import type { Origen } from "@/lib/mejoramiento/tipos";
import { ErrorDelPaso, type AccionDelPaso } from "../pasos/Partes";

/**
 * «Añadir hallazgos» a un plan (anexo §3.4, camino 2): las casillas de los candidatos que dejó la búsqueda (los que cuentan y no
 * están en ningún plan) y, si el plan propone su objetivo, la casilla «Poner el objetivo del plan a los que no tienen», marcada por
 * omisión (desmarcada, la acción manda «no»: el que ya tiene uno lo conserva siempre). Se añaden todos en una transacción, con un
 * evento por hallazgo; si uno ya no se puede, no se añade ninguno y el mensaje dice por qué.
 */
export function SelectorDeHallazgos({
  planId,
  candidatos,
  proponeObjetivo,
  accion,
}: {
  planId: number;
  candidatos: readonly CandidatoParaPlan[];
  /** Si el plan tiene un objetivo activo que proponer: sin él, la casilla no aparece (se ignoraría). */
  proponeObjetivo: boolean;
  accion: AccionDelPaso;
}) {
  const [estado, enviar, pendiente] = useActionState(accion, null);
  return (
    <form action={enviar} onSubmit={enviarSinReiniciar(enviar)} className="flex min-w-0 flex-col gap-4">
      <input type="hidden" name="planId" value={planId} />
      <input type="hidden" name="volverAlPlan" value="si" />
      <fieldset className="flex min-w-0 flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">Hallazgos que se pueden añadir</legend>
        <ul className="flex list-none flex-col gap-2">
          {candidatos.map((h) => (
            <li key={h.id} className="min-w-0">
              <label className="flex min-w-0 cursor-pointer items-start gap-3 rounded-lg border border-border bg-card p-3 hover:bg-muted">
                <input type="checkbox" name="hallazgoIds" value={h.id} className="mt-1 size-4 shrink-0 accent-marca" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm">
                    <span className="font-mono text-xs font-medium">{h.codigo}</span> <span className="break-words font-medium">{h.titulo}</span>
                  </span>
                  <span className="block text-xs text-muted-foreground">{`${h.proceso} · ${ETIQUETA_ORIGEN[h.origen as Origen]} · ${h.estado}`}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
      {proponeObjetivo ? (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="conObjetivo" value="si" defaultChecked className="mt-0.5 size-4 shrink-0 accent-marca" />
          <span>Poner el objetivo del plan a los que no tienen</span>
        </label>
      ) : null}
      <ErrorDelPaso estado={estado} />
      <div className="flex flex-wrap justify-end gap-2">
        <Boton type="submit" pendiente={pendiente}>
          {pendiente ? "Añadiendo…" : "Añadir los elegidos al plan"}
        </Boton>
      </div>
    </form>
  );
}
