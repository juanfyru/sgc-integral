import Link from "next/link";
import { Insignia } from "@/componentes/ui/Insignia";
import type { HallazgoParecido } from "@/db/consultas/mejoramiento/parecidos";
import { rutaDeHallazgo } from "@/lib/mejoramiento/rutas";

/**
 * Los hallazgos parecidos de **otros** procesos (spec 15 §7.5 y §8.6, de `parecidosDeOtrosProcesos`): los ve solo el
 * Administrador del SGC al revisar el plan, que ve todos los hallazgos; la página lo decide (la consulta no recibe sesión).
 * Cada uno con su código (enlace a su página), su estado en texto, su proceso y su título.
 */
export function ParecidosDeOtrosProcesos({ parecidos }: { parecidos: ReadonlyArray<HallazgoParecido & { proceso: string }> }) {
  return (
    <section aria-labelledby="parecidos-otros-titulo" className="flex flex-col gap-2 rounded-md border border-linea-suave p-3">
      <h3 id="parecidos-otros-titulo" className="text-sm font-semibold">
        Parecidos en otros procesos
      </h3>
      {parecidos.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay hallazgos parecidos en otros procesos.</p>
      ) : (
        <ul className="flex list-none flex-col gap-2">
          {parecidos.map((p) => (
            <li key={p.id} className="flex min-w-0 flex-col gap-1 text-sm">
              <span className="flex flex-wrap items-center gap-2">
                <Link
                  href={rutaDeHallazgo(p.id)}
                  className="rounded font-medium text-marca underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca"
                >
                  {p.codigo}
                </Link>
                <Insignia variante="neutra">{p.etiqueta}</Insignia>
                <span className="text-xs text-muted-foreground">{p.proceso}</span>
              </span>
              <span className="break-words">{p.titulo}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
