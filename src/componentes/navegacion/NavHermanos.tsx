import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import type { NodoHermano } from "@/db/consultas/procesos";

/**
 * Navegación lateral entre hermanos (procesos del mismo macroproceso o
 * subprocesos del mismo proceso) sin volver al mapa.
 */
export function NavHermanos({
  anterior,
  siguiente,
  base,
  etiqueta,
}: {
  anterior: NodoHermano | null;
  siguiente: NodoHermano | null;
  // Prefijo de las URLs: "/procesos" o "/procesos/<slug-del-proceso>".
  base: string;
  // "proceso" o "subproceso", para los aria-label.
  etiqueta: string;
}) {
  if (!anterior && !siguiente) return null;

  return (
    <nav
      aria-label={`Navegación entre ${etiqueta}s hermanos`}
      className="flex items-stretch justify-between gap-3 border-t border-border pt-4"
    >
      {anterior ? (
        <Link
          href={`${base}/${anterior.slug}`}
          aria-label={`${etiqueta} anterior: ${anterior.nombre}`}
          className="group flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <ArrowLeft
            className="size-4 shrink-0 transition-transform group-hover:-translate-x-0.5"
            aria-hidden="true"
          />
          <span className="truncate">{anterior.nombre}</span>
        </Link>
      ) : (
        <span aria-hidden="true" />
      )}
      {siguiente ? (
        <Link
          href={`${base}/${siguiente.slug}`}
          aria-label={`${etiqueta} siguiente: ${siguiente.nombre}`}
          className="group flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-right text-sm text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <span className="truncate">{siguiente.nombre}</span>
          <ArrowRight
            className="size-4 shrink-0 transition-transform group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </Link>
      ) : (
        <span aria-hidden="true" />
      )}
    </nav>
  );
}
