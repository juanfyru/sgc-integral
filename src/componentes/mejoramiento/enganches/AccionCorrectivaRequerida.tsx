import type { DetalleDeHallazgo } from "@/db/consultas/mejoramiento/lectura";
import { fechaYHora } from "@/lib/mejoramiento/formato";

/**
 * «Acción correctiva» de la no conformidad que nació de un hallazgo de verificación (Fase 15B, anexo §7.2, maqueta 6): requerida desde
 * que nació, con su justificación y quién la tomó y cuándo (quien abrió la no conformidad). Va después de «2. Corrección», que es la de
 * ese hallazgo de verificación, y a la vista, sin plegar. La página la muestra solo a quien ve el hallazgo completo. Sin la acción
 * requerida y su justificación no pinta nada.
 */
export function AccionCorrectivaRequerida({ decision, zona }: { decision: DetalleDeHallazgo["decision"]; zona: string }) {
  if (decision.accionRequerida !== true || !decision.justificacion) return null;
  const quien = [decision.decididaPor, decision.decididaEn ? fechaYHora(decision.decididaEn, zona) : null].filter(Boolean).join(", ");
  return (
    <section aria-labelledby="accion-correctiva-requerida" className="rounded-lg border border-border bg-card px-4 py-3">
      <h2 id="accion-correctiva-requerida" className="font-display text-base font-semibold">
        Acción correctiva
      </h2>
      <p className="mt-1 whitespace-pre-line break-words text-sm">{`Requerida: «${decision.justificacion}»`}</p>
      {quien ? <p className="mt-1 text-sm text-muted-foreground">{`La decidió al abrir la no conformidad: ${quien}`}</p> : null}
    </section>
  );
}
