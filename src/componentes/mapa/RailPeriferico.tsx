import { LogIn, LogOut } from "lucide-react";
import { Icono } from "@/componentes/iconos";
import type { ElementoPeriferico } from "@/db/consultas/mapa";

// Entradas y salidas del sistema: los rieles laterales del mapa oficial.
export function RailPeriferico({
  titulo,
  tipo,
  elementos,
}: {
  titulo: string;
  tipo: "entrada" | "salida";
  elementos: ElementoPeriferico[];
}) {
  const acento = tipo === "entrada" ? "var(--color-azul)" : "var(--color-verde)";

  return (
    <section
      aria-label={titulo}
      className="rounded-2xl border border-border bg-card p-3 shadow-xs"
      style={{ "--acento": acento } as React.CSSProperties}
    >
      <header className="mb-2 flex items-center gap-2 rounded-lg bg-[var(--acento)] px-2.5 py-2 text-white">
        {tipo === "entrada" ? (
          <LogIn className="size-4" aria-hidden="true" />
        ) : (
          <LogOut className="size-4" aria-hidden="true" />
        )}
        <h2 className="font-display text-[13px] font-bold tracking-wide">
          {titulo}
        </h2>
      </header>
      <ul className="list-none divide-y divide-border/70">
        {elementos.map((e) => (
          <li
            key={e.texto}
            className={`flex items-start gap-2.5 px-1.5 py-2.5 ${e.activo === false ? "opacity-50" : ""}`}
          >
            <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-md bg-[color-mix(in_srgb,var(--acento)_10%,white)] text-[color-mix(in_srgb,var(--acento)_80%,black)]">
              <Icono nombre={e.icono} className="size-3.5" />
            </span>
            <span className="text-xs/relaxed text-foreground/85">
              {e.texto}
              {e.activo === false && (
                <span className="ml-1 text-[10px] uppercase text-muted-foreground">(inactivo)</span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
