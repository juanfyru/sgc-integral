"use client";

import { startTransition, useState, type FormEvent } from "react";
import type { EstadoAccion } from "@/app/admin/comun";
import { ErrorAccion, Ocultos } from "@/componentes/tramites/AccionesSolicitud";
import { Boton } from "@/componentes/ui/Boton";
import { claseControl } from "@/componentes/ui/Campo";
import type { RespuestaGuardada, RespuestaItem, Resultado } from "@/db/consultas/revision";
import type { Etapa } from "@/lib/tramites/tipos";

export const ETIQUETA_RESULTADO: Record<Resultado, string> = {
  cumple: "Cumple",
  no_cumple: "No cumple",
  no_aplica: "No aplica",
};
const RESULTADOS = Object.keys(ETIQUETA_RESULTADO) as Resultado[];

/** Lo que hace editable la lista: la acción que guarda y lo que el panel necesita saber de ella. */
export type EdicionLista = {
  estado: EstadoAccion;
  enviar: (datos: FormData) => void;
  pendiente: boolean;
  guardado: boolean;
  alCambiar: () => void;
  alEnviar: () => void;
};

type Referencia = { id: number; etapa: Etapa; ronda: number };

function Critico() {
  return (
    <span className="rounded-full bg-estado-critico-fondo px-2 py-0.5 text-xs font-medium text-estado-critico-texto">
      Crítico
    </span>
  );
}

function ItemSoloLectura({ r }: { r: RespuestaGuardada }) {
  return (
    <li className="flex flex-col gap-0.5 border-b border-border pb-2 text-sm last:border-b-0 last:pb-0">
      <span className="flex flex-wrap items-center gap-2">
        <span className="break-words">{r.texto}</span>
        {r.critico ? <Critico /> : null}
      </span>
      <span className="font-medium">{ETIQUETA_RESULTADO[r.resultado]}</span>
      {r.nota ? <span className="whitespace-pre-wrap break-words text-xs text-muted-foreground">{`Nota: ${r.nota}`}</span> : null}
    </li>
  );
}

function ItemEditable({ r, critico, alCambiar }: { r: RespuestaItem; critico: boolean; alCambiar: () => void }) {
  const [resultado, setResultado] = useState(r.resultado);
  const idAviso = `aviso-nota-${r.itemId}`;
  return (
    <fieldset className="flex min-w-0 flex-col gap-2 border-b border-border pb-3 last:border-b-0">
      <legend className="flex flex-wrap items-center gap-2 text-sm font-medium">
        <span className="break-words">{r.texto}</span>
        {critico ? <Critico /> : null}
      </legend>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {RESULTADOS.map((valor) => (
          <label key={valor} className="inline-flex items-center gap-1.5 text-sm">
            <input type="radio" name={`resultado_${r.itemId}`} value={valor} defaultChecked={r.resultado === valor}
              onChange={() => {
                setResultado(valor);
                alCambiar();
              }}
            />
            {ETIQUETA_RESULTADO[valor]}
          </label>
        ))}
      </div>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Nota (obligatoria si no cumple)
        <input
          name={`nota_${r.itemId}`}
          aria-describedby={resultado === "no_cumple" ? idAviso : undefined}
          maxLength={2000}
          defaultValue={r.nota ?? ""}
          onChange={alCambiar}
          className={`${claseControl} text-sm text-foreground`}
        />
      </label>
      {resultado === "no_cumple" ? (
        <p id={idAviso} className="text-xs text-estado-atencion-texto">
          Esta nota saldrá en el acta, visible para toda la entidad.
        </p>
      ) : null}
    </fieldset>
  );
}

/** Lo que se respondió en una ronda, para consultarlo: el resultado va como texto. */
export function ListaSoloLectura({ respuestas, etiqueta }: { respuestas: RespuestaGuardada[]; etiqueta: string }) {
  return (
    <ul className="flex list-none flex-col gap-2" aria-label={etiqueta}>
      {respuestas.map((r) => (
        <ItemSoloLectura key={r.itemId} r={r} />
      ))}
    </ul>
  );
}

/** La lista de verificación de quien revisa, en la ronda en curso (spec 13A §9.2): cada ítem es un grupo de tres opciones. */
export function ListaVerificacion({
  tramite,
  respuestas,
  criticosActuales,
  edicion,
}: {
  tramite: Referencia;
  respuestas: RespuestaItem[];
  /** Los ítems activos que hoy son críticos: la marca guardada en la ronda puede ser anterior. */
  criticosActuales: number[];
  edicion: EdicionLista;
}) {
  // Como en FormularioSolicitud: enviar desde una transición no reinicia lo marcado tras un rechazo.
  const alEnviar = (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault();
    const datos = new FormData(evento.currentTarget);
    edicion.alEnviar();
    startTransition(() => edicion.enviar(datos));
  };
  return (
    <form action={edicion.enviar} onSubmit={alEnviar} className="flex flex-col gap-3" aria-label="Lista de verificación">
      <Ocultos tramite={tramite} />
      {respuestas.map((r) => (
        <ItemEditable key={r.itemId} r={r} critico={r.critico || criticosActuales.includes(r.itemId)} alCambiar={edicion.alCambiar} />
      ))}
      <ErrorAccion estado={edicion.estado} />
      <div className="flex flex-wrap items-center justify-end gap-3">
        <p role="status" className="text-sm text-estado-bien-texto">
          {edicion.guardado ? "Avance guardado" : ""}
        </p>
        <Boton type="submit" variante="secundario" pendiente={edicion.pendiente}>
          {edicion.pendiente ? "Guardando…" : "Guardar avance"}
        </Boton>
      </div>
    </form>
  );
}
