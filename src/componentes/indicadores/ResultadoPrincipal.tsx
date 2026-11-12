import { Insignia } from "@/componentes/ui/Insignia";
import type { UltimoResultado } from "@/db/consultas/indicadores/lectura";
import { InsigniaSemaforo } from "./InsigniaSemaforo";

const FLECHA: Record<"sube" | "baja" | "igual", string> = { sube: "▲", baja: "▼", igual: "=" };

/**
 * El último resultado en grande (spec §8.3 y §12.3, maqueta 2): la cifra, su estado escrito, las marcas, la frase y, debajo,
 * el periodo con la comparación («▼ 23,3 puntos menos que en el segundo trimestre · empeora»). La flecha es decorativa: el
 * texto ya dice hacia dónde fue.
 */
export function ResultadoPrincipal({ ultimo, periodosSinCumplir }: { ultimo: UltimoResultado | null; periodosSinCumplir: number }) {
  if (!ultimo) {
    return <p className="text-sm text-muted-foreground">Aún no hay resultados reportados: el primero aparecerá aquí en grande.</p>;
  }
  const c = ultimo.comparacion;
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-2">
      <p className="font-display text-4xl font-semibold leading-none tabular-nums">{ultimo.resultado ?? (ultimo.noAplica ? "n. a." : "s. d.")}</p>
      <div className="flex min-w-0 flex-col gap-1.5">
        <p className="flex flex-wrap items-center gap-1.5">
          <InsigniaSemaforo semaforo={ultimo.semaforo} noAplica={ultimo.noAplica} conResultado={ultimo.resultado !== null} />
          {ultimo.requiereAccion ? <Insignia variante="neutra">Requiere acción de mejora</Insignia> : null}
          {ultimo.repetido ? <Insignia variante="neutra">{`${periodosSinCumplir} periodos sin cumplir`}</Insignia> : null}
        </p>
        <p className="text-sm font-semibold">{ultimo.frase}</p>
        <p className="text-sm text-muted-foreground">
          {ultimo.etiqueta}
          {c ? (
            <>
              {" · "}
              <span aria-hidden="true">{FLECHA[c.flecha]} </span>
              {c.texto}
              {c.mejora === null ? null : c.mejora ? " · mejora" : " · empeora"}
            </>
          ) : null}
        </p>
      </div>
    </div>
  );
}
