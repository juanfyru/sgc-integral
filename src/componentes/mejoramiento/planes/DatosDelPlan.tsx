import type { DetalleDePlan } from "@/db/consultas/mejoramiento/planes-lectura";
import { fechaLargaDeDia } from "@/lib/mejoramiento/formato";
import { ETIQUETA_ORIGEN } from "@/lib/mejoramiento/origenes";

/**
 * «Datos del plan» de la columna derecha (anexo §3.1, maqueta 2): el origen que propone, la fecha del evento, la vigencia, la
 * fecha límite del ente, el objetivo escrito y el del maestro; en un plan anulado, el motivo. Los ve todo el que ve el plan.
 */
export function DatosDelPlan({ plan }: { plan: DetalleDePlan }) {
  const filas: Array<[string, React.ReactNode]> = [
    [
      "Origen",
      <>
        {ETIQUETA_ORIGEN[plan.origen]} <span className="text-muted-foreground">(el que propone a los hallazgos que se registran aquí)</span>
      </>,
    ],
    ["Fecha del evento", fechaLargaDeDia(plan.fechaEvento)],
    ["Vigencia", String(plan.vigencia)],
    ...(plan.fechaLimiteEnte ? [["Fecha límite del ente", fechaLargaDeDia(plan.fechaLimiteEnte)] as [string, React.ReactNode]] : []),
    ...(plan.objetivoTexto ? [["Objetivo del plan", plan.objetivoTexto] as [string, React.ReactNode]] : []),
    ...(plan.objetivo ? [["Objetivo", plan.objetivo] as [string, React.ReactNode]] : []),
    ...(plan.estado === "anulado" && plan.anuladoMotivo ? [["Motivo de la anulación", plan.anuladoMotivo] as [string, React.ReactNode]] : []),
  ];
  return (
    <section aria-labelledby="datos-del-plan" className="rounded-lg border border-border bg-card p-4">
      <h2 id="datos-del-plan" className="font-display text-base font-semibold">
        Datos del plan
      </h2>
      <dl className="mt-2 flex flex-col gap-2">
        {filas.map(([termino, valor]) => (
          <div key={termino} className="min-w-0">
            <dt className="text-xs font-medium text-muted-foreground">{termino}</dt>
            <dd className="whitespace-pre-line break-words text-sm">{valor}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
