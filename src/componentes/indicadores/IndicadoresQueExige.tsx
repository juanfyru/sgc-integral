import Link from "next/link";
import type { IndicadorQueExige } from "@/db/consultas/indicadores/busqueda";
import { rutaDeIndicador } from "@/lib/indicadores/rutas";

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";

/** «Indicadores que exige» de la ficha de una norma (spec 14 §12.8); sin ninguno que la persona vea, no se pinta. */
export function IndicadoresQueExige({ indicadores, clase }: { indicadores: IndicadorQueExige[]; clase: string }) {
  if (indicadores.length === 0) return null;
  return (
    <section aria-labelledby="norma-indicadores" className={clase}>
      <h2 id="norma-indicadores" className="text-sm font-semibold">
        Indicadores que exige
      </h2>
      <ul className="flex list-none flex-col gap-2 text-sm">
        {indicadores.map((i) => (
          <li key={i.codigo} className="min-w-0">
            <Link href={rutaDeIndicador(i.codigo)} className={`rounded-sm text-marca underline-offset-2 hover:underline ${FOCO}`}>
              <span className="font-mono text-xs">{i.codigo}</span> <span className="break-words">{i.nombre}</span>
            </Link>
            <span className="block break-words text-xs text-muted-foreground">{i.proceso}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
