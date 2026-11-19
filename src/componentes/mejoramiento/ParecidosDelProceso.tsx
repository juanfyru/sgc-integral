"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Insignia } from "@/componentes/ui/Insignia";
import { OCURRENCIA_DESDE_EL_PANEL } from "@/lib/mejoramiento/marcas";
import { DISTINTO, resolverPanelDeParecidos, salidaDe, type ParecidoDeRuta, type RespuestaDeParecidos } from "@/lib/mejoramiento/parecidos-panel";
import { rutaDeHallazgo } from "@/lib/mejoramiento/rutas";

/** Menos de este largo no es un texto con qué comparar (la ruta usa el mismo mínimo). */
const MINIMO = 15;
/** Lo que viaja en `q`: el título y el comienzo de la descripción bastan, y la URL tiene un límite. */
const LARGO_DE_LA_CONSULTA = 300;

type Props = {
  /** El proceso elegido en el formulario (el `id` como texto) y su nombre. */
  procesoId: string;
  proceso: string | null;
  /** El título y la descripción tal como se dejaron al salir de cada campo. */
  texto: string;
  /** La salida elegida: `ocurrencia:<id>`, `reincidencia:<id>` o `distinto`. */
  relacion: string;
  alCambiar: (relacion: string) => void;
  /**
   * El formulario llegó desde el panel de la marca de un indicador (`marcaMedicionId`, Fase 15B anexo §6.2): la ocurrencia de un
   * parecido abierto no se ofrece (el panel ya ofrece la de los hallazgos que citan el indicador, y deja la salida de la marca), y
   * `enlace` lleva de vuelta a ese panel. El servidor rechaza esa combinación igual (`OCURRENCIA_DESDE_EL_PANEL`).
   */
  desdeElPanel?: { enlace: string | null };
};

/**
 * Los hallazgos del mismo proceso que se parecen a lo que se escribe, con las tres salidas del spec 15 §7.5 (maqueta 3):
 * es el mismo problema de uno abierto (una ocurrencia), es reincidencia de uno cerrado, o es distinto. La elegida viaja en
 * el campo `relacion` del formulario. Sin resultados, el campo vale `distinto` y no se dice nada más que una nota.
 */
export function ParecidosDelProceso({ procesoId, proceso, texto, relacion, alCambiar, desdeElPanel }: Props) {
  const recortado = texto.trim().slice(0, LARGO_DE_LA_CONSULTA);
  const consulta = procesoId !== "" && recortado.length > MINIMO ? `proceso=${encodeURIComponent(procesoId)}&q=${encodeURIComponent(recortado)}` : null;
  const [respuesta, setRespuesta] = useState<RespuestaDeParecidos | null>(null);

  useEffect(() => {
    if (consulta === null) return;
    const control = new AbortController();
    const llegó = (parecidos: ParecidoDeRuta[] | null) =>
      setRespuesta((previa) => ({
        consulta,
        procesoId,
        parecidos: parecidos ?? (previa?.procesoId === procesoId ? previa.parecidos : []),
        error: parecidos === null,
      }));
    fetch(`/mejoramiento/parecidos?${consulta}`, { signal: control.signal })
      .then((r) => (r.ok ? (r.json() as Promise<{ parecidos?: ParecidoDeRuta[] }>) : null))
      .then((j) => llegó(j === null ? null : (j.parecidos ?? [])))
      .catch((e: unknown) => {
        if (!(e instanceof DOMException && e.name === "AbortError")) llegó(null);
      });
    return () => control.abort();
  }, [consulta, procesoId]);

  const { parecidos, buscando, error, vigente } = resolverPanelDeParecidos({
    consulta,
    procesoId,
    respuesta,
    relacion,
    sinOcurrencia: desdeElPanel !== undefined,
  });

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
              : buscando
                ? "Buscando…"
                : error
                  ? "No se pudieron buscar los parecidos"
                  : "No hay hallazgos parecidos en este proceso."}
          </p>
        ) : (
          <>
            {buscando ? <p className="text-muted-foreground">Buscando…</p> : null}
            {error ? <p role="alert" className="text-estado-critico-texto">No se pudieron buscar los parecidos</p> : null}
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
            <SalidasDeParecidos parecidos={parecidos} vigente={vigente} alCambiar={alCambiar} desdeElPanel={desdeElPanel} />
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

/**
 * Las salidas ante los parecidos (spec 15 §7.5): una ocurrencia de cada abierto, la reincidencia de cada cerrado y «distinto».
 * Desde el panel de la marca (`desdeElPanel`), los abiertos no dan salida: la nota dice que la ocurrencia se añade desde la página
 * del indicador, con su enlace.
 */
export function SalidasDeParecidos({
  parecidos,
  vigente,
  alCambiar,
  desdeElPanel,
}: {
  parecidos: ParecidoDeRuta[];
  vigente: string;
  alCambiar: (relacion: string) => void;
  desdeElPanel?: { enlace: string | null };
}) {
  const conSalida = desdeElPanel ? parecidos.filter((p) => !p.abierto) : parecidos;
  const abiertos = desdeElPanel ? parecidos.filter((p) => p.abierto) : [];
  return (
    <fieldset className="flex min-w-0 flex-col gap-2">
      <legend className="font-medium">¿Qué es lo que va a registrar?</legend>
      {conSalida.map((p) => (
        <label key={p.id} className="flex items-start gap-2">
          <input
            type="radio"
            name="salida-de-parecidos"
            checked={vigente === salidaDe(p)}
            onChange={() => alCambiar(salidaDe(p))}
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
      {abiertos.length > 0 && desdeElPanel ? (
        <p className="text-muted-foreground">
          {`${abiertos.map((p) => p.codigo).join(", ")} ${abiertos.length === 1 ? "está abierto" : "están abiertos"}. ${OCURRENCIA_DESDE_EL_PANEL}.`}
          {desdeElPanel.enlace ? (
            <>
              {" "}
              <Link
                href={desdeElPanel.enlace}
                className="rounded font-medium text-marca underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca"
              >
                Ir a la página del indicador
              </Link>
            </>
          ) : null}
        </p>
      ) : null}
    </fieldset>
  );
}
