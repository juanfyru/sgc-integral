import { GraficoBarras } from "@/componentes/ui/GraficoBarras";
import type { ResultadoIndicadores } from "@/lib/indicadores-documentales/metas";
import { cuenta } from "@/lib/plural";

/** El ancho de cada barra en el gráfico; con pocos procesos el gráfico no ocupa toda la caja. */
const REM_POR_BARRA = 4.5;

/**
 * Los documentos con revisión vencida de cada proceso (spec 13C §11.4): `GraficoBarras` con una barra por proceso (la
 * sigla va en `fecha`) y su tabla equivalente; las etiquetas visibles repiten la tabla y por eso se ocultan al lector.
 * Son categorías, no días: cada barra deja un hueco del 30 % de su franja, para que dos cifras iguales no se vean como
 * un solo bloque.
 */
export function BarrasPorProceso({ filas }: { filas: ResultadoIndicadores["vencidosPorProceso"] }) {
  const total = filas.reduce((s, p) => s + p.vencidos, 0);
  return (
    <section aria-labelledby="titulo-vencidos-proceso" className="min-w-0 rounded-lg border border-border bg-card p-4">
      <h2 id="titulo-vencidos-proceso" className="text-sm font-semibold">
        Documentos con revisión vencida, por proceso
      </h2>
      {filas.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">Ningún documento de su alcance tiene la revisión vencida.</p>
      ) : (
        <div className="mt-3 w-full" style={{ maxWidth: `${filas.length * REM_POR_BARRA}rem` }}>
          <GraficoBarras
            serie={filas.map((p) => ({ fecha: p.sigla, conteo: p.vencidos }))}
            descripcion={`Documentos con revisión vencida por proceso: ${total} en ${cuenta(filas.length, "proceso", "procesos")}.`}
            titulo="Documentos con revisión vencida por proceso"
            columnas={["Proceso", "Vencidos"]}
            hueco={0.3}
          />
          <div
            aria-hidden="true"
            className="mt-1 grid text-center text-xs text-muted-foreground"
            style={{ gridTemplateColumns: `repeat(${filas.length}, minmax(0, 1fr))` }}
          >
            {filas.map((p) => (
              <span key={p.procesoId} className="truncate" title={p.proceso}>
                {`${p.sigla} ${p.vencidos}`}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
