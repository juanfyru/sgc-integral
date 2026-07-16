import Link from "next/link";
import { ChevronDown, ChevronRight, FileText, HeartPulse, LogIn, LogOut } from "lucide-react";
import { Icono } from "@/componentes/iconos";
import type { DatosMapa, ElementoPeriferico } from "@/db/consultas/mapa";

// Estrategia mobile (D9): el mapa colapsa a un acordeón por macroproceso.
// <details>/<summary> nativos: accesibles, sin JavaScript, indexables.
export function AcordeonMapa({ datos }: { datos: DatosMapa }) {
  const { macroprocesos, entradas, salidas, configuracion } = datos;

  return (
    <div className="flex flex-col gap-3">
      {macroprocesos.map((macro, i) => (
        <details
          key={macro.id}
          open={i === 0}
          className="group overflow-hidden rounded-xl border bg-card shadow-xs"
          style={
            {
              "--color-banda": macro.color,
              borderColor: "color-mix(in srgb, var(--color-banda) 30%, white)",
            } as React.CSSProperties
          }
        >
          <summary className="flex cursor-pointer list-none items-center gap-3 p-3.5 transition-colors hover:bg-muted/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-banda)] [&::-webkit-details-marker]:hidden">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[var(--color-banda)] text-white">
              <Icono nombre={macro.icono} className="size-4.5" />
            </span>
            <span className="flex-1">
              <span className="block font-display text-sm font-bold text-[color-mix(in_srgb,var(--color-banda)_80%,black)]">
                {macro.letra}. {macro.nombre}
              </span>
              <span className="block text-xs text-muted-foreground">
                {macro.procesos.length} procesos
              </span>
            </span>
            <ChevronDown
              className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
              aria-hidden="true"
            />
          </summary>
          <ul className="list-none divide-y divide-border/70 border-t border-border/70">
            {macro.procesos.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/procesos/${p.slug}`}
                  className="flex items-center gap-3 px-3.5 py-3 transition-colors hover:bg-muted/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-banda)]"
                  aria-label={`${p.nombre}: ${p.docsVigentes} documentos vigentes`}
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[color-mix(in_srgb,var(--color-banda)_12%,white)] text-[color-mix(in_srgb,var(--color-banda)_80%,black)]">
                    <Icono nombre={p.icono} className="size-4" />
                  </span>
                  <span className="flex-1 text-sm font-medium">{p.nombre}</span>
                  <span
                    className="inline-flex items-center gap-1 text-xs tabular-nums text-muted-foreground"
                    aria-hidden="true"
                  >
                    <FileText className="size-3" />
                    {p.docsVigentes}
                  </span>
                  <ChevronRight
                    className="size-4 shrink-0 text-muted-foreground/60"
                    aria-hidden="true"
                  />
                </Link>
              </li>
            ))}
          </ul>
        </details>
      ))}

      <SeccionPeriferica
        titulo="Entradas del Sistema"
        tipo="entrada"
        elementos={entradas}
      />
      <SeccionPeriferica
        titulo="Salidas del Sistema"
        tipo="salida"
        elementos={salidas}
      />

      <p className="flex items-center justify-center gap-2 rounded-xl bg-azul-profundo px-4 py-3 text-center font-display text-sm font-semibold text-white">
        <HeartPulse className="size-4 shrink-0 text-verde" aria-hidden="true" />
        {configuracion.lema ?? ""}
      </p>
    </div>
  );
}

function SeccionPeriferica({
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
    <details
      className="group overflow-hidden rounded-xl border border-border bg-card shadow-xs"
      style={{ "--acento": acento } as React.CSSProperties}
    >
      <summary className="flex cursor-pointer list-none items-center gap-3 p-3.5 transition-colors hover:bg-muted/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--acento)] [&::-webkit-details-marker]:hidden">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[var(--acento)] text-white">
          {tipo === "entrada" ? (
            <LogIn className="size-4.5" aria-hidden="true" />
          ) : (
            <LogOut className="size-4.5" aria-hidden="true" />
          )}
        </span>
        <span className="flex-1 font-display text-sm font-bold text-[color-mix(in_srgb,var(--acento)_80%,black)]">
          {titulo}
        </span>
        <ChevronDown
          className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <ul className="list-none divide-y divide-border/70 border-t border-border/70">
        {elementos.map((e) => (
          <li key={e.texto} className="flex items-start gap-2.5 px-3.5 py-2.5">
            <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-md bg-[color-mix(in_srgb,var(--acento)_10%,white)] text-[color-mix(in_srgb,var(--acento)_80%,black)]">
              <Icono nombre={e.icono} className="size-3.5" />
            </span>
            <span className="text-xs/relaxed text-foreground/85">{e.texto}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}
