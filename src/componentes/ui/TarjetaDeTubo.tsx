"use client";

import { useEffect, useRef } from "react";

// Clases literales: Tailwind solo genera las que ve escritas completas.
const PUNTO: Record<string, string> = {
  bien: "bg-estado-bien",
  atencion: "bg-estado-atencion",
  critico: "bg-estado-critico",
  "sin-meta": "bg-tubo-neutro",
};
const FORMA_PUNTO = "inline-block size-2 shrink-0 rounded-full";

/**
 * La tarjeta de una gráfica de tubos (spec §11): aparece al pasar el cursor por la franja de un periodo y al enfocarla
 * con el teclado, con el periodo, el valor, el estado y la meta, y se va con Escape, la haya abierto el cursor o el
 * foco (WCAG 1.4.13). Lee lo que cada área sensible (`[data-tubo]`, que pinta el servidor) trae escrito y lo copia con
 * `textContent`. No se lee aparte: el área enfocada ya dice su valor y su estado, y la tabla equivalente lo trae todo.
 */
export function TarjetaDeTubo({ children }: { children: React.ReactNode }) {
  const raiz = useRef<HTMLDivElement>(null);
  const tarjeta = useRef<HTMLDivElement>(null);
  const valor = useRef<HTMLElement>(null);
  const punto = useRef<HTMLSpanElement>(null);
  const estado = useRef<HTMLSpanElement>(null);
  const pie = useRef<HTMLElement>(null);

  useEffect(() => {
    const caja = raiz.current;
    const t = tarjeta.current;
    const cifra = valor.current;
    const marca = punto.current;
    const nombre = estado.current;
    const linea = pie.current;
    if (!caja || !t || !cifra || !marca || !nombre || !linea) return;

    // Escape se escucha en el documento solo mientras la tarjeta se ve.
    let teclado: AbortController | null = null;
    const ocultar = () => {
      t.hidden = true;
      teclado?.abort();
      teclado = null;
    };
    const mostrar = (zona: SVGElement | HTMLElement, x: number, y: number) => {
      const d = zona.dataset;
      cifra.textContent = d.valor || d.nombre || "";
      nombre.textContent = d.valor ? (d.nombre ?? "") : "";
      marca.className = `${FORMA_PUNTO} ${PUNTO[d.estado ?? ""] ?? "bg-estado-sin-dato"}`;
      marca.hidden = !d.valor;
      linea.textContent = d.meta ? `${d.periodo ?? ""} · ${d.meta}` : (d.periodo ?? "");
      t.hidden = false;
      const r = caja.getBoundingClientRect();
      t.style.left = `${Math.min(Math.max(x - r.left + 14, 0), Math.max(r.width - t.offsetWidth, 0))}px`;
      t.style.top = `${Math.max(y - r.top - t.offsetHeight - 12, 0)}px`;
      if (!teclado) {
        teclado = new AbortController();
        document.addEventListener(
          "keydown",
          (e) => {
            if (e.key === "Escape") ocultar();
          },
          { signal: teclado.signal },
        );
      }
    };
    const zonaDe = (objetivo: EventTarget | null) =>
      objetivo instanceof Element ? objetivo.closest<SVGElement | HTMLElement>("[data-tubo]") : null;

    const eventos = new AbortController();
    const { signal } = eventos;
    caja.addEventListener(
      "pointermove",
      (e) => {
        const zona = zonaDe(e.target);
        if (zona) mostrar(zona, e.clientX, e.clientY);
        else ocultar();
      },
      { signal },
    );
    caja.addEventListener("pointerleave", ocultar, { signal });
    caja.addEventListener(
      "focusin",
      (e) => {
        const zona = zonaDe(e.target);
        if (!zona) return;
        const c = zona.getBoundingClientRect();
        mostrar(zona, c.left + c.width / 2, c.top + 24);
      },
      { signal },
    );
    caja.addEventListener("focusout", ocultar, { signal });
    return () => {
      eventos.abort();
      ocultar();
    };
  }, []);

  return (
    <div ref={raiz} className="relative">
      {children}
      <div
        ref={tarjeta}
        hidden
        aria-hidden="true"
        className="tubo-tarjeta pointer-events-none absolute z-10 min-w-32 rounded-lg border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-[var(--sombra-3)] print:hidden"
      >
        <b ref={valor} className="block text-lg leading-tight tabular-nums" />
        <span className="mt-0.5 flex items-center gap-1.5 font-semibold">
          <span ref={punto} className={FORMA_PUNTO} />
          <span ref={estado} />
        </span>
        <small ref={pie} className="block text-muted-foreground" />
      </div>
    </div>
  );
}
