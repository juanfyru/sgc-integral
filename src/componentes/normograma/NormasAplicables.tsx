import Link from "next/link";
import { Scale } from "lucide-react";
import type { FilaNorma } from "@/db/consultas/normograma/lectura";
import { AsociarProceso } from "./AsociarProceso";
import { InsigniaNorma } from "./TablaNormas";

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";
const PRIMERAS = 5;

/**
 * «Normas aplicables (N)» de la página del proceso (spec 13C §10.6, maqueta 10): las primeras cinco del normograma del
 * proceso con su estado y su requisito, el enlace al normograma completo del proceso y, para quien tiene
 * `normograma.procesos` sobre él, «Asociar norma». La página lee los datos (`normasDeProceso`) y los pasa.
 */
export function NormasAplicables({
  proceso,
  normas,
  asociables,
}: {
  proceso: { id: number; slug: string };
  normas: (FilaNorma & { requisito: string | null })[];
  /** Las normas que la persona puede asociar al proceso; null si no puede asociar. */
  asociables: { id: number; nombre: string; titulo: string }[] | null;
}) {
  const enlace = `/normograma?proceso=${encodeURIComponent(proceso.slug)}`;
  return (
    <section className="mt-8" aria-labelledby="titulo-normas">
      <h2 id="titulo-normas" className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
        <Scale className="size-4 text-muted-foreground" aria-hidden="true" />
        {`Normas aplicables (${normas.length})`}
      </h2>
      {normas.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
          Ninguna norma del normograma está asociada a este proceso.
        </p>
      ) : (
        <ul className="flex list-none flex-col gap-2 rounded-xl border border-border bg-card p-3">
          {normas.slice(0, PRIMERAS).map((n) => (
            <li key={n.id} className="flex min-w-0 flex-wrap items-start justify-between gap-2 text-sm">
              <span className="min-w-0 flex-1">
                <Link href={`/normograma/${n.id}`} className={`rounded font-medium hover:underline ${FOCO}`}>
                  {n.nombre}
                </Link>
                <span className="block break-words text-muted-foreground">{n.requisito ?? n.titulo}</span>
              </span>
              <InsigniaNorma estado={n.estado} estadoEn={n.estadoEn} />
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex min-w-0 flex-col items-start gap-3">
        <Link href={enlace} className={`rounded text-sm font-medium text-marca underline-offset-2 hover:underline ${FOCO}`}>
          {normas.length === 0
            ? "Ir al normograma del proceso"
            : normas.length === 1
              ? "Verla en el normograma del proceso"
              : `Ver las ${normas.length} en el normograma del proceso`}
        </Link>
        {asociables !== null && asociables.length > 0 ? <AsociarProceso procesoId={proceso.id} normas={asociables} /> : null}
      </div>
    </section>
  );
}
