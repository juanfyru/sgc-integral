import { ChevronDown } from "lucide-react";
import { AnalisisEnLectura } from "@/componentes/mejoramiento/analisis/AnalisisEnLectura";
import { PlanEnLectura, type IndicadorEnLectura } from "@/componentes/mejoramiento/plan/PlanEnLectura";
import type { RondaDeDetalle } from "@/db/consultas/mejoramiento/lectura";
import { fechaYHora } from "@/lib/mejoramiento/formato";
import { SeccionEficacia, SeccionVerificacion } from "./SeccionVerificacion";

/**
 * Una ronda anterior (spec 15 §8.7, maqueta 2): la que terminó «no eficaz» queda congelada y a la vista, plegada, como «Ronda N ·
 * no eficaz». Dentro, en lectura y plegadas también, su causa raíz, su plan, su verificación y su evaluación; sin controles.
 * `indicador` es el del criterio de eficacia, ya decidido para quien mira; lo congelado de la evaluación también llega decidido.
 */
export function RondaAnterior({
  ronda,
  indicador,
  hoy,
  zona,
  adjuntos,
  children,
}: {
  ronda: RondaDeDetalle;
  indicador: IndicadorEnLectura;
  hoy: string;
  zona: string;
  /** Los adjuntos del análisis de esa ronda, a quien los ve. */
  adjuntos?: React.ReactNode;
  /** Lo que la página añade al final (los ajustes de su plan). */
  children?: React.ReactNode;
}) {
  const e = ronda.evaluacion;
  const titulo = `Ronda ${ronda.numero} · ${e?.resultado === "eficaz" ? "eficaz" : "no eficaz"}`;
  const resumen = e ? `Evaluó ${e.por}, ${fechaYHora(e.en, zona)}` : "Ronda anterior";
  return (
    <details className="group rounded-lg border border-border bg-muted">
      <summary className="flex cursor-pointer list-none items-start justify-between gap-3 rounded-lg px-4 py-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca">
        <span className="min-w-0">
          <span className="block font-display text-base font-semibold">{titulo}</span>
          <span className="block break-words text-sm text-muted-foreground">{resumen}</span>
        </span>
        <ChevronDown aria-hidden="true" className="mt-1 size-4 shrink-0 transition-transform group-open:rotate-180" />
      </summary>
      <div className="flex flex-col gap-3 border-t border-linea-suave p-3">
        <AnalisisEnLectura ronda={ronda} abierta={false}>
          {adjuntos}
        </AnalisisEnLectura>
        <PlanEnLectura ronda={ronda} abierta={false} indicador={indicador} hoy={hoy} />
        {children}
        <SeccionVerificacion ronda={ronda} abierta={false} zona={zona} />
        <SeccionEficacia evaluacion={e} evaluableDesde={null} abierta={false} zona={zona} />
      </div>
    </details>
  );
}
