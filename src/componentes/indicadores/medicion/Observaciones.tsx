"use client";

import { useActionState } from "react";
import { observarAccion, responderAccion } from "@/app/acciones-indicadores";
import { ErrorAccion } from "@/componentes/tramites/AccionesSolicitud";
import { Boton } from "@/componentes/ui/Boton";
import { Campo, claseControl } from "@/componentes/ui/Campo";
import { Insignia } from "@/componentes/ui/Insignia";

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";
const CONTROL = `${claseControl} w-full min-w-0`;

/** Una respuesta, con su fecha ya escrita en la zona de la instalación. */
export type RespuestaVista = { id: number; autor: string; fecha: string; texto: string };
export type ObservacionVista = RespuestaVista & { respuestas: RespuestaVista[] };

function Autor({ r }: { r: RespuestaVista }) {
  return (
    <p className="text-xs text-muted-foreground">
      <span className="font-medium text-foreground">{r.autor}</span>
      {` · ${r.fecha}`}
    </p>
  );
}

function Responder({ observacionId }: { observacionId: number }) {
  const [estado, enviar, pendiente] = useActionState(responderAccion, null);
  const texto = estado?.valores?.texto;
  return (
    <details className="rounded-md border border-border px-3 py-2">
      <summary className={`cursor-pointer rounded-sm text-sm font-medium ${FOCO}`}>Responder</summary>
      <form action={enviar} className="mt-3 flex flex-col gap-3">
        <input type="hidden" name="id" value={observacionId} />
        <Campo etiqueta="Respuesta" nombre="texto" id={`respuesta-${observacionId}`} ayuda="Hasta 2.000 caracteres. Avisa a quien dejó la observación.">
          <textarea required maxLength={2000} rows={3} defaultValue={typeof texto === "string" ? texto : ""} className={CONTROL} />
        </Campo>
        <ErrorAccion estado={estado} />
        <div>
          <Boton type="submit" variante="secundario" pendiente={pendiente}>
            {pendiente ? "Respondiendo…" : "Enviar la respuesta"}
          </Boton>
        </div>
      </form>
    </details>
  );
}

function NuevaObservacion({ medicionId, etiqueta }: { medicionId: number; etiqueta: string }) {
  const [estado, enviar, pendiente] = useActionState(observarAccion, null);
  const texto = estado?.valores?.texto;
  return (
    <form action={enviar} className="flex min-w-0 flex-col gap-3 rounded-lg border border-border px-4 py-3">
      <input type="hidden" name="id" value={medicionId} />
      <Campo
        etiqueta={`Observación sobre ${etiqueta.toLowerCase()}`}
        nombre="texto"
        id={`observacion-${medicionId}`}
        ayuda="Hasta 2.000 caracteres. No se edita ni se borra; avisa a quienes analizan el indicador."
      >
        <textarea required maxLength={2000} rows={3} defaultValue={typeof texto === "string" ? texto : ""} className={CONTROL} />
      </Campo>
      <ErrorAccion estado={estado} />
      <div>
        <Boton type="submit" pendiente={pendiente}>
          {pendiente ? "Guardando…" : "Dejar la observación"}
        </Boton>
      </div>
    </form>
  );
}

/**
 * Las observaciones de una medición (spec §8.6) con sus respuestas, y los formularios para dejar una (quien puede
 * observar) y responderla (quien puede analizar o el Admin SGC). Son de solo inserción: ni se editan ni se borran. Texto
 * plano, con sus saltos de línea.
 */
export function Observaciones({
  medicionId,
  etiqueta,
  observaciones,
  puedeObservar,
  puedeResponder,
}: {
  medicionId: number;
  /** «Tercer trimestre de 2026». */
  etiqueta: string;
  observaciones: ObservacionVista[];
  puedeObservar: boolean;
  puedeResponder: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-4">
      {observaciones.length === 0 ? (
        <p className="text-sm text-muted-foreground">{`${etiqueta} no tiene observaciones.`}</p>
      ) : (
        <ol className="flex list-none flex-col gap-3">
          {observaciones.map((o) => (
            <li key={o.id} className="flex min-w-0 flex-col gap-2 rounded-lg border border-border px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Autor r={o} />
                {o.respuestas.length === 0 ? <Insignia variante="atencion">Sin respuesta</Insignia> : null}
              </div>
              <p className="whitespace-pre-wrap break-words text-sm">{o.texto}</p>
              {o.respuestas.length > 0 ? (
                <ol aria-label="Respuestas" className="ml-2 flex list-none flex-col gap-2 border-l-2 border-border pl-3">
                  {o.respuestas.map((r) => (
                    <li key={r.id} className="flex min-w-0 flex-col gap-1">
                      <Autor r={r} />
                      <p className="whitespace-pre-wrap break-words text-sm">{r.texto}</p>
                    </li>
                  ))}
                </ol>
              ) : null}
              {puedeResponder ? <Responder observacionId={o.id} /> : null}
            </li>
          ))}
        </ol>
      )}
      {puedeObservar ? <NuevaObservacion medicionId={medicionId} etiqueta={etiqueta} /> : null}
    </div>
  );
}
