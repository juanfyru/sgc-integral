import type { EventoDelPlan } from "@/db/consultas/mejoramiento/planes-lectura";
import { fechaDeDia } from "@/lib/mejoramiento/formato";
import { fechaEnZona } from "@/lib/tramites/plazos";

/**
 * «Historial del plan» (anexo §3.3 y §3.6, maqueta 2): del más reciente al más antiguo, «18 nov 2026 · Quién añadió HZ-…». Llega ya
 * decidido por la lectura: a quien no ve todo, solo las líneas del plan y las de los hallazgos que ve completos, y el otro plan de
 * un cambio de plan solo nombrado a quien lo ve.
 */
export function HistorialDelPlan({ eventos, zona }: { eventos: readonly EventoDelPlan[]; zona: string }) {
  if (eventos.length === 0) return null;
  return (
    <section aria-labelledby="historial-del-plan" className="rounded-lg border border-border bg-card p-4">
      <h2 id="historial-del-plan" className="font-display text-base font-semibold">
        Historial del plan
      </h2>
      <ol className="mt-2 flex list-none flex-col">
        {eventos.map((e, i) => (
          <li key={i} className="break-words border-b border-linea-suave py-2 text-sm last:border-b-0">
            <span className="font-semibold tabular-nums">{fechaDeDia(fechaEnZona(e.en, zona))}</span>
            {` · ${e.por} ${e.texto}`}
          </li>
        ))}
      </ol>
    </section>
  );
}
