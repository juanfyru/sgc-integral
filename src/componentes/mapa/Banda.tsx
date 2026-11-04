import { Icono } from "@/componentes/iconos";
import type { MacroprocesoMapa } from "@/db/consultas/mapa";
import { TarjetaProceso } from "./TarjetaProceso";

// Banda del mapa: encabezado institucional + tarjetas que fluyen (D1).
// Agregar o quitar procesos en la BD reacomoda la banda sin tocar código.
export function Banda({
  macro,
  indice,
}: {
  macro: MacroprocesoMapa;
  indice: number;
}) {
  return (
    <section
      aria-labelledby={`banda-${macro.slug}`}
      className={`banda-animada banda-borde rounded-2xl border p-3 sm:p-4 ${macro.activo === false ? "opacity-50 grayscale" : ""}`}
      style={
        {
          "--color-banda": macro.color,
          "--indice-banda": indice,
          background: "color-mix(in srgb, var(--color-banda) 4%, var(--background))",
        } as React.CSSProperties
      }
    >
      <header className="mb-3 flex items-center gap-2.5">
        <span className="grid size-7 place-items-center rounded-md bg-[var(--color-banda)] text-white">
          <Icono nombre={macro.icono} className="size-4" />
        </span>
        <h2
          id={`banda-${macro.slug}`}
          className="font-display text-sm font-bold uppercase tracking-[0.08em] banda-texto"
        >
          <span aria-hidden="true">{macro.letra}. </span>
          {macro.nombre}
        </h2>
        {macro.activo === false && (
          <span className="rounded-full border border-dashed px-2 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
            inactivo
          </span>
        )}
      </header>
      <ul className="grid list-none grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-4 min-[1400px]:grid-cols-[repeat(auto-fill,minmax(160px,1fr))]">
        {macro.procesos.map((p) => (
          <li key={p.id} className="min-w-0">
            <TarjetaProceso proceso={p} />
          </li>
        ))}
      </ul>
    </section>
  );
}
