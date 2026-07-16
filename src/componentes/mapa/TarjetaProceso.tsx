import Link from "next/link";
import { FileText, Layers } from "lucide-react";
import { Icono } from "@/componentes/iconos";
import type { ProcesoMapa } from "@/db/consultas/mapa";

// La tarjeta hereda el color de su banda vía --color-banda (definida por el
// contenedor). Todo el color se deriva de la BD: nada hardcodeado por proceso.
export function TarjetaProceso({ proceso }: { proceso: ProcesoMapa }) {
  const etiqueta = `${proceso.nombre}: ${proceso.docsVigentes} ${
    proceso.docsVigentes === 1 ? "documento vigente" : "documentos vigentes"
  }${
    proceso.numSubprocesos > 0
      ? `, ${proceso.numSubprocesos} subprocesos`
      : ""
  }`;

  return (
    <Link
      href={`/procesos/${proceso.slug}`}
      aria-label={etiqueta}
      className="group flex min-h-28 flex-col justify-between gap-3 rounded-xl border border-border bg-card p-3.5 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--color-banda)] hover:shadow-md focus-visible:-translate-y-0.5 focus-visible:border-[var(--color-banda)] focus-visible:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-banda)]"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[color-mix(in_srgb,var(--color-banda)_12%,white)] text-[color-mix(in_srgb,var(--color-banda)_80%,black)] transition-colors group-hover:bg-[var(--color-banda)] group-hover:text-white">
          <Icono nombre={proceso.icono} className="size-4.5" />
        </span>
        <span
          className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground transition-colors group-hover:bg-[color-mix(in_srgb,var(--color-banda)_12%,white)] group-hover:text-[color-mix(in_srgb,var(--color-banda)_80%,black)]"
          aria-hidden="true"
        >
          <FileText className="size-3" />
          {proceso.docsVigentes}
        </span>
      </div>
      <div>
        <p className="text-sm/snug font-semibold text-foreground">
          {proceso.nombre}
        </p>
        <p
          className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground"
          aria-hidden="true"
        >
          <span className="font-mono tracking-wide">{proceso.sigla}</span>
          {proceso.numSubprocesos > 0 && (
            <span className="inline-flex items-center gap-1">
              <Layers className="size-3" />
              {proceso.numSubprocesos} subprocesos
            </span>
          )}
        </p>
      </div>
    </Link>
  );
}
