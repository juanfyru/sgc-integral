"use client";

import { useState } from "react";
import { Boton } from "@/componentes/ui/Boton";
import { Dialogo } from "@/componentes/ui/Dialogo";

export type PersonaQueFalta = { id: number; nombre: string; cargo: string | null; desdeHace: number };

const hace = (dias: number) => (dias === 0 ? "hoy" : dias === 1 ? "hace 1 día" : `hace ${dias} días`);

/** «Ver quién falta»: nombre, cargo y desde cuándo está pendiente. Los datos llegan ya filtrados por la visibilidad. */
export function QuienFalta({ titulo, personas }: { titulo: string; personas: PersonaQueFalta[] }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <Boton variante="secundario" onClick={() => setAbierto(true)} aria-haspopup="dialog" disabled={personas.length === 0}>
        {`Ver quién falta (${personas.length})`}
      </Boton>
      <Dialogo
        abierto={abierto}
        alCerrar={() => setAbierto(false)}
        titulo={`Quién falta: ${titulo}`}
        className="m-auto w-full max-w-md rounded-lg border border-border bg-card p-0 text-foreground shadow-xl backdrop:bg-black/40"
      >
        <div className="flex flex-col gap-3 p-5">
          <p aria-hidden="true" className="font-semibold">{`Falta confirmar: ${titulo}`}</p>
          <ul className="flex list-none flex-col gap-2">
            {personas.map((p) => (
              <li key={p.id} className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <span>
                  {p.nombre}
                  {p.cargo ? <span className="text-muted-foreground">{` · ${p.cargo}`}</span> : null}
                </span>
                <span className="text-xs text-muted-foreground">{`Pendiente ${hace(p.desdeHace)}`}</span>
              </li>
            ))}
          </ul>
          <div className="flex justify-end">
            <Boton variante="secundario" onClick={() => setAbierto(false)}>
              Cerrar
            </Boton>
          </div>
        </div>
      </Dialogo>
    </>
  );
}
