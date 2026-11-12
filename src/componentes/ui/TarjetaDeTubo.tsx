"use client";

import { useRef } from "react";

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
 * con el teclado, con el periodo, el valor, el estado y la meta, y se va con Escape. Lee lo que cada área sensible
 * (`[data-tubo]`, que pinta el servidor) trae escrito y lo copia con `textContent`. No se lee aparte: el área enfocada
 * ya dice su valor y su estado, y la tabla equivalente lo trae todo.
 */
export function TarjetaDeTubo({ children }: { children: React.ReactNode }) {
  const raiz = useRef<HTMLDivElement>(null);
  const tarjeta = useRef<HTMLDivElement>(null);
  const valor = useRef<HTMLElement>(null);
  const punto = useRef<HTMLSpanElement>(null);
  const estado = useRef<HTMLSpanElement>(null);
  const pie = useRef<HTMLElement>(null);

  const zonaDe = (objetivo: EventTarget | null) =>
    objetivo instanceof Element ? objetivo.closest<SVGElement | HTMLElement>("[data-tubo]") : null;

  function mostrar(zona: SVGElement | HTMLElement, x: number, y: number) {
    const caja = raiz.current;
    const t = tarjeta.current;
    if (!caja || !t || !valor.current || !punto.current || !estado.current || !pie.current) return;
    const d = zona.dataset;
    valor.current.textContent = d.valor || d.nombre || "";
    estado.current.textContent = d.valor ? (d.nombre ?? "") : "";
    punto.current.className = `${FORMA_PUNTO} ${PUNTO[d.estado ?? ""] ?? "bg-estado-sin-dato"}`;
    punto.current.hidden = !d.valor;
    pie.current.textContent = d.meta ? `${d.periodo ?? ""} · ${d.meta}` : (d.periodo ?? "");
    t.hidden = false;
    const r = caja.getBoundingClientRect();
    t.style.left = `${Math.min(Math.max(x - r.left + 14, 0), Math.max(r.width - t.offsetWidth, 0))}px`;
    t.style.top = `${Math.max(y - r.top - t.offsetHeight - 12, 0)}px`;
  }

  function ocultar() {
    if (tarjeta.current) tarjeta.current.hidden = true;
  }

  return (
    <div
      ref={raiz}
      className="relative"
      onPointerMove={(e) => {
        const zona = zonaDe(e.target);
        if (zona) mostrar(zona, e.clientX, e.clientY);
        else ocultar();
      }}
      onPointerLeave={ocultar}
      onFocus={(e) => {
        const zona = zonaDe(e.target);
        if (!zona) return;
        const c = zona.getBoundingClientRect();
        mostrar(zona, c.left + c.width / 2, c.top + 24);
      }}
      onBlur={ocultar}
      onKeyDown={(e) => {
        if (e.key === "Escape") ocultar();
      }}
    >
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
