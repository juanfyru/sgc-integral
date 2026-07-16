"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search } from "lucide-react";

/**
 * Barra superior presente en todas las páginas (Fase 5): marca + búsqueda
 * siempre accesible. El form es un GET real a /buscar — funciona sin
 * JavaScript. En /buscar se oculta el campo: allí manda el campo principal.
 */
export function EncabezadoSitio() {
  const ruta = usePathname();
  const enBuscar = ruta === "/buscar";

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur-sm">
      <div className="mx-auto flex h-14 w-full max-w-[1500px] items-center gap-3 px-4 sm:px-6">
        <Link
          href="/"
          className="flex min-w-0 items-center gap-2.5 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-azul"
        >
          <span
            className="grid size-8 shrink-0 place-items-center rounded-lg bg-azul font-display text-[11px] font-bold text-white"
            aria-hidden="true"
          >
            SGC
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-azul-tinta">
              SGC Documental
            </span>
            <span className="hidden truncate text-[11px] text-muted-foreground sm:block">
              ESE Hospital Nuestra Señora de Fátima · Suaza
            </span>
          </span>
        </Link>

        {!enBuscar && (
          <form
            action="/buscar"
            role="search"
            className="relative ml-auto w-full max-w-xs sm:max-w-sm"
          >
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              type="search"
              name="q"
              placeholder="Buscar documentos…"
              aria-label="Buscar documentos"
              autoComplete="off"
              className="h-9 w-full rounded-lg border border-border bg-card pl-9 pr-3 text-sm text-foreground shadow-xs outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-azul focus:ring-2 focus:ring-azul/20"
            />
          </form>
        )}
      </div>
    </header>
  );
}
