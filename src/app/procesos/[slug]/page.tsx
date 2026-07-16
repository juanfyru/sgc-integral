import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, FileText, Layers } from "lucide-react";
import { Icono } from "@/componentes/iconos";
import { obtenerSql } from "@/db/cliente";

export const dynamic = "force-dynamic";

// Placeholder de la Fase 3: confirma la navegación mapa → proceso.
// La vista completa (documentos, subprocesos, breadcrumbs enriquecidos,
// "también aplica aquí") llega en la Fase 4.
export default async function VistaProceso({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const sql = obtenerSql();

  const [proceso] = await sql`
    SELECT p.id, p.nombre, p.sigla, p.icono, p.descripcion,
           m.nombre AS macro_nombre, m.color, m.letra
    FROM procesos p
    JOIN macroprocesos m ON m.id = p.macroproceso_id
    WHERE p.slug = ${slug} AND p.activo`;

  if (!proceso) notFound();

  const subprocesos = await sql`
    SELECT nombre FROM subprocesos
    WHERE proceso_id = ${proceso.id} AND activo ORDER BY orden`;

  return (
    <div
      className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 lg:py-10"
      style={{ "--color-banda": proceso.color as string } as React.CSSProperties}
    >
      <nav aria-label="Miga de pan" className="mb-6">
        <ol className="flex list-none flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
          <li>
            <Link
              href="/"
              className="rounded hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              Mapa de procesos
            </Link>
          </li>
          <li aria-hidden="true">
            <ChevronRight className="size-3.5" />
          </li>
          <li>{proceso.macro_nombre as string}</li>
          <li aria-hidden="true">
            <ChevronRight className="size-3.5" />
          </li>
          <li aria-current="page" className="font-medium text-foreground">
            {proceso.nombre as string}
          </li>
        </ol>
      </nav>

      <header className="flex items-start gap-4">
        <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-[color-mix(in_srgb,var(--color-banda)_12%,white)] text-[color-mix(in_srgb,var(--color-banda)_80%,black)]">
          <Icono nombre={proceso.icono as string} className="size-7" />
        </span>
        <div>
          <p className="font-mono text-xs tracking-wide text-muted-foreground">
            {proceso.sigla as string}
          </p>
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-azul-tinta sm:text-3xl">
            {proceso.nombre as string}
          </h1>
          {proceso.descripcion ? (
            <p className="mt-2 max-w-2xl text-sm/relaxed text-muted-foreground">
              {proceso.descripcion as string}
            </p>
          ) : null}
        </div>
      </header>

      {subprocesos.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
            <Layers className="size-4 text-muted-foreground" aria-hidden="true" />
            Subprocesos
          </h2>
          <ul className="flex list-none flex-wrap gap-2">
            {subprocesos.map((s) => (
              <li
                key={s.nombre as string}
                className="rounded-full border border-border bg-card px-3 py-1.5 text-sm text-foreground/85"
              >
                {s.nombre as string}
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="mt-10 flex items-center gap-2.5 rounded-xl border border-dashed border-border bg-card px-4 py-3.5 text-sm text-muted-foreground">
        <FileText className="size-4 shrink-0" aria-hidden="true" />
        Los documentos de este proceso se mostrarán aquí en la Fase 4
        (navegación en profundidad).
      </p>
    </div>
  );
}
