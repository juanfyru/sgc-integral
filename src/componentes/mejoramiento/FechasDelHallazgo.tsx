import type { FechasDeHallazgo } from "@/db/consultas/mejoramiento/lectura";
import { diaCorto, fechaLargaDeDia } from "@/lib/mejoramiento/formato";
import { fechaEnZona } from "@/lib/tramites/plazos";

/**
 * «Fechas» de la columna derecha (spec 15 §16.2, maqueta 2), de la ronda en curso: cuándo se formuló el plan y si fue a tiempo
 * (con su texto), el cierre previsto, desde cuándo se puede registrar «eficaz» mientras se espera y las reprogramaciones
 * aprobadas y pedidas. Sin nada que decir, no aparece.
 */
export function FechasDelHallazgo({ fechas: f, zona }: { fechas: FechasDeHallazgo; zona: string }) {
  const r = f.reprogramaciones;
  const filas: Array<[string, string]> = [
    ...(f.planFormulado
      ? [["Plan formulado", `${diaCorto(f.planFormulado.cuando, zona)} · ${f.planFormulado.aTiempo ? "a tiempo" : "fuera de plazo"}`] as [string, string]]
      : []),
    ...(f.cierrePrevisto ? [["Cierre previsto", fechaLargaDeDia(fechaEnZona(f.cierrePrevisto, zona))] as [string, string]] : []),
    ...(f.evaluableDesde ? [["«Eficaz» se puede registrar desde", fechaLargaDeDia(f.evaluableDesde)] as [string, string]] : []),
    ...(f.planFormulado || r.pedidas > 0
      ? [
          [
            "Reprogramaciones",
            `${r.aprobadas} ${r.aprobadas === 1 ? "aprobada" : "aprobadas"} · ${r.pedidas} ${r.pedidas === 1 ? "pedida" : "pedidas"}`,
          ] as [string, string],
        ]
      : []),
  ];
  if (filas.length === 0) return null;
  return (
    <section aria-labelledby="fechas-hallazgo" className="rounded-lg border border-border bg-card p-4">
      <h2 id="fechas-hallazgo" className="font-display text-base font-semibold">
        Fechas
      </h2>
      <dl className="mt-2 flex flex-col gap-2">
        {filas.map(([termino, valor]) => (
          <div key={termino} className="min-w-0">
            <dt className="text-xs font-medium text-muted-foreground">{termino}</dt>
            <dd className="break-words text-sm">{valor}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
