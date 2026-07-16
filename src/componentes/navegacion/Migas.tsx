import Link from "next/link";
import { ChevronRight } from "lucide-react";

export type Miga = { nombre: string; href?: string };

/** Miga de pan persistente: mapa → macroproceso → proceso → subproceso → doc. */
export function Migas({ items }: { items: Miga[] }) {
  return (
    <nav aria-label="Miga de pan">
      <ol className="flex list-none flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
        <li>
          <Link
            href="/"
            className="rounded hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Mapa de procesos
          </Link>
        </li>
        {items.map((item, i) => {
          const esActual = i === items.length - 1;
          return (
            <li key={`${item.nombre}-${i}`} className="flex items-center gap-1.5">
              <ChevronRight className="size-3.5" aria-hidden="true" />
              {item.href && !esActual ? (
                <Link
                  href={item.href}
                  className="rounded hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  {item.nombre}
                </Link>
              ) : (
                <span
                  aria-current={esActual ? "page" : undefined}
                  className={esActual ? "font-medium text-foreground" : undefined}
                >
                  {item.nombre}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
