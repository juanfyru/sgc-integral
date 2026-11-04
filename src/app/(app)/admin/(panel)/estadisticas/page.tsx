import type { Metadata } from "next";
import Link from "next/link";
import { obtenerEstadisticas, type Rango } from "@/db/consultas/estadisticas";
import { GraficoBarras } from "@/componentes/admin/estadisticas/GraficoBarras";
import { exigirPermiso } from "@/lib/paginas";

export const metadata: Metadata = { title: "Estadísticas — Administración SGC" };

const RANGOS: Array<{ clave: Rango; etiqueta: string }> = [
  { clave: "7", etiqueta: "7 días" },
  { clave: "30", etiqueta: "30 días" },
  { clave: "90", etiqueta: "90 días" },
  { clave: "todo", etiqueta: "Todo" },
];

export default async function PaginaEstadisticas({
  searchParams,
}: {
  searchParams: Promise<{ rango?: string }>;
}) {
  await exigirPermiso("estadisticas.ver");
  const { rango: rangoParam } = await searchParams;
  const rango = (["7", "30", "90", "todo"].includes(rangoParam ?? "") ? rangoParam : "30") as Rango;
  const e = await obtenerEstadisticas({ rango });

  return (
    <main className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-semibold">Estadísticas</h1>
        <div className="flex gap-2 text-sm">
          {RANGOS.map((r) => (
            <Link
              key={r.clave}
              href={`/admin/estadisticas?rango=${r.clave}`}
              className={`rounded-md border px-3 py-1 ${rango === r.clave ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
            >
              {r.etiqueta}
            </Link>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:max-w-md">
        <div
          className="entrada rounded-lg border bg-card p-4 shadow-[var(--sombra-1)]"
          style={{ "--indice": 0 } as React.CSSProperties}
        >
          <p className="text-sm text-muted-foreground">Vistas</p>
          <p className="font-display text-3xl font-semibold">{e.totalVistas}</p>
        </div>
        <div
          className="entrada rounded-lg border bg-card p-4 shadow-[var(--sombra-1)]"
          style={{ "--indice": 1 } as React.CSSProperties}
        >
          <p className="text-sm text-muted-foreground">Descargas</p>
          <p className="font-display text-3xl font-semibold">{e.totalDescargas}</p>
        </div>
      </div>

      <section>
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">Consultas por día</h2>
        <GraficoBarras serie={e.serie} />
      </section>

      <div className="grid gap-8 lg:grid-cols-3">
        <ListaDocs titulo="Más vistos" docs={e.masVistos} />
        <ListaDocs titulo="Más descargados" docs={e.masDescargados} />
        <section>
          <h2 className="mb-2 text-sm font-medium text-muted-foreground">Búsquedas sin resultados</h2>
          {e.sinResultados.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ninguna en el periodo.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {e.sinResultados.map((t) => (
                <li key={t.termino} className="flex justify-between gap-2">
                  <span className="truncate">{t.termino}</span>
                  <span className="text-muted-foreground">{t.veces}×</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}

function ListaDocs({
  titulo,
  docs,
}: {
  titulo: string;
  docs: { codigo: string; titulo: string; conteo: number }[];
}) {
  return (
    <section>
      <h2 className="mb-2 text-sm font-medium text-muted-foreground">{titulo}</h2>
      {docs.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin datos en el periodo.</p>
      ) : (
        <ol className="space-y-1 text-sm">
          {docs.map((d) => (
            <li key={d.codigo} className="flex justify-between gap-2">
              <Link href={`/documentos/${d.codigo}`} className="truncate hover:underline">
                <span className="font-mono">{d.codigo}</span> {d.titulo}
              </Link>
              <span className="text-muted-foreground">{d.conteo}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
