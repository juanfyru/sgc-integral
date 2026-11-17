"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Insignia } from "@/componentes/ui/Insignia";
import { rutaDeHallazgo } from "@/lib/mejoramiento/rutas";

/** Lo que responde `GET /mejoramiento/parecidos`: la fecha llega como texto ISO. */
type Parecido = { id: number; codigo: string; titulo: string; etiqueta: string; abierto: boolean; cuando: string };

/** Menos de este largo no es un texto con qué comparar (la ruta usa el mismo mínimo). */
const MINIMO = 15;

const DISTINTO = "distinto";

/** La salida que corresponde a cada parecido: abierto, una ocurrencia; cerrado, una reincidencia (spec 15 §7.5). */
const valorDe = (p: Parecido) => `${p.abierto ? "ocurrencia" : "reincidencia"}:${p.id}`;

type Props = {
  /** El proceso elegido en el formulario (el `id` como texto) y su nombre. */
  procesoId: string;
  proceso: string | null;
  /** El título y la descripción tal como se dejaron al salir de cada campo. */
  texto: string;
  /** La salida elegida: `ocurrencia:<id>`, `reincidencia:<id>` o `distinto`. */
  relacion: string;
  alCambiar: (relacion: string) => void;
};

/**
 * Los hallazgos del mismo proceso que se parecen a lo que se escribe, con las tres salidas del spec 15 §7.5 (maqueta 3):
 * es el mismo problema de uno abierto (una ocurrencia), es reincidencia de uno cerrado, o es distinto. La elegida viaja en
 * el campo `relacion` del formulario. Sin resultados, el campo vale `distinto` y no se dice nada más que una nota.
 */
export function ParecidosDelProceso({ procesoId, proceso, texto, relacion, alCambiar }: Props) {
  const consulta = procesoId !== "" && texto.trim().length > MINIMO ? `proceso=${encodeURIComponent(procesoId)}&q=${encodeURIComponent(texto.trim())}` : null;
  const [respuesta, setRespuesta] = useState<{ consulta: string; parecidos: Parecido[] } | null>(null);

  useEffect(() => {
    if (consulta === null) return;
    const control = new AbortController();
    fetch(`/mejoramiento/parecidos?${consulta}`, { signal: control.signal })
      .then((r) => (r.ok ? r.json() : { parecidos: [] }))
      .then((j: { parecidos?: Parecido[] }) => setRespuesta({ consulta, parecidos: j.parecidos ?? [] }))
      .catch(() => undefined);
    return () => control.abort();
  }, [consulta]);

  const parecidos = consulta !== null && respuesta?.consulta === consulta ? respuesta.parecidos : [];
  // Una salida que ya no está entre los resultados vuelve a «distinto».
  const vigente = parecidos.some((p) => valorDe(p) === relacion) ? relacion : DISTINTO;

  // El formulario cambia el texto de su botón según la salida: se le dice cuando una salida deja de valer.
  useEffect(() => {
    if (vigente !== relacion) alCambiar(vigente);
  }, [vigente, relacion, alCambiar]);

  return (
    <section aria-labelledby="parecidos-titulo" className="rounded-lg border border-border bg-card p-4">
      <h2 id="parecidos-titulo" className="font-display text-base font-semibold">
        {proceso ? `Parecidos en ${proceso}` : "Parecidos en el proceso"}
      </h2>
      <input type="hidden" name="relacion" value={vigente} form="formulario-hallazgo" />
      <div aria-live="polite" className="mt-2 flex flex-col gap-3 text-sm">
        {parecidos.length === 0 ? (
          <p className="text-muted-foreground">
            {consulta === null
              ? "Elija el proceso y escriba el título y la descripción: el sistema busca hallazgos parecidos del mismo proceso."
              : "No hay hallazgos parecidos en este proceso."}
          </p>
        ) : (
          <>
            <ul className="flex list-none flex-col gap-2">
              {parecidos.map((p) => (
                <li key={p.id} className="rounded-md border border-linea-suave px-3 py-2">
                  <span className="flex flex-wrap items-center gap-2">
                    <Link
                      href={rutaDeHallazgo(p.id)}
                      target="_blank"
                      className="rounded font-medium text-marca underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca"
                    >
                      {p.codigo}
                    </Link>
                    <Insignia variante="neutra">{p.etiqueta}</Insignia>
                  </span>
                  <span className="mt-1 block break-words">{p.titulo}</span>
                </li>
              ))}
            </ul>
            <fieldset className="flex flex-col gap-2">
              <legend className="font-medium">¿Qué es lo que va a registrar?</legend>
              {parecidos.map((p) => (
                <label key={p.id} className="flex items-start gap-2">
                  <input
                    type="radio"
                    name="salida-de-parecidos"
                    checked={vigente === valorDe(p)}
                    onChange={() => alCambiar(valorDe(p))}
                    className="mt-1 accent-marca"
                  />
                  <span>
                    {p.abierto
                      ? `Es el mismo problema de ${p.codigo}, que está abierto: se añade como ocurrencia`
                      : `Es reincidencia de ${p.codigo}, que está cerrado`}
                  </span>
                </label>
              ))}
              <label className="flex items-start gap-2">
                <input
                  type="radio"
                  name="salida-de-parecidos"
                  checked={vigente === DISTINTO}
                  onChange={() => alCambiar(DISTINTO)}
                  className="mt-1 accent-marca"
                />
                <span>Es distinto: se registra como un hallazgo nuevo</span>
              </label>
            </fieldset>
            {vigente.startsWith("ocurrencia:") ? (
              <p className="text-muted-foreground">
                No nace otro hallazgo: la fecha de detección y la descripción de este formulario quedan como una ocurrencia del que ya existe.
              </p>
            ) : null}
            {vigente.startsWith("reincidencia:") ? (
              <p className="text-muted-foreground">
                El hallazgo nuevo queda enlazado al anterior, lleva la marca «Reincidente» y exige acción correctiva.
              </p>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
