"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useTransition } from "react";
import { LoaderCircle, Search } from "lucide-react";

/**
 * Campo principal de la página de búsqueda. Sincroniza `q` en la URL con
 * debounce (router.replace): los resultados los renderiza el Server Component
 * que lee searchParams. Envuelto en un form GET real: sin JavaScript la
 * búsqueda sigue funcionando con Enter.
 */
export function CampoBusqueda({ valorInicial }: { valorInicial: string }) {
  const router = useRouter();
  const parametros = useSearchParams();
  const [pendiente, iniciarTransicion] = useTransition();
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (temporizador.current) clearTimeout(temporizador.current);
    };
  }, []);

  function alEscribir(valor: string) {
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => {
      const siguiente = new URLSearchParams(parametros);
      if (valor.trim()) siguiente.set("q", valor.trim());
      else siguiente.delete("q");
      const consulta = siguiente.toString();
      iniciarTransicion(() => {
        router.replace(consulta ? `/buscar?${consulta}` : "/buscar", {
          scroll: false,
        });
      });
    }, 350);
  }

  return (
    <form action="/buscar" role="search" className="relative">
      <Search
        className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <input
        type="search"
        name="q"
        defaultValue={valorInicial}
        onChange={(e) => alEscribir(e.target.value)}
        placeholder="Buscar por código, título o palabras clave…"
        aria-label="Buscar documentos"
        autoFocus
        autoComplete="off"
        className="h-13 w-full rounded-2xl border border-border bg-card pl-12 pr-12 text-base text-foreground shadow-xs outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-azul focus:ring-2 focus:ring-azul/20"
      />
      <span
        className="absolute right-4 top-1/2 -translate-y-1/2"
        aria-hidden="true"
      >
        {pendiente && (
          <LoaderCircle className="size-5 animate-spin text-muted-foreground motion-reduce:animate-none" />
        )}
      </span>
    </form>
  );
}
