import Link from "next/link";
import type { ProcesoAsignado } from "@/lib/alcance";

export function MisProcesos({ procesos }: { procesos: ProcesoAsignado[] }) {
  return (
    <section aria-labelledby="mis-procesos-titulo" className="mb-6 lg:mb-8">
      <h2 id="mis-procesos-titulo" className="font-display text-lg font-bold text-azul-tinta">
        Mis procesos
      </h2>
      {procesos.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Aún no tiene procesos asignados; pídalo al administrador del SGC
        </p>
      ) : (
        <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {procesos.map((p) => (
            <li key={p.id}>
              <Link
                href={`/procesos/${p.slug}`}
                className="block rounded-lg border border-border bg-card p-4 transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-verde-texto">{p.sigla}</span>
                <span className="mt-1 block text-sm font-semibold text-azul-tinta">{p.nombre}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
