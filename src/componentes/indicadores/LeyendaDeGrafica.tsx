/**
 * La meta y la leyenda de la gráfica principal de un indicador: las comparten la vista «Resultados» y la ficha impresa
 * (que así no arrastra los formularios de la vista).
 */
import type { ResultadosDelAnio } from "@/db/consultas/indicadores/lectura";

const cifra = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 4 });

/** La meta de la gráfica: una línea si es la misma en todos los periodos, escalonada si cambia; sin meta, ninguna. */
export function metaDeGrafica(g: ResultadosDelAnio["grafica"]) {
  const valores = g.meta.filter((m): m is number => m !== null);
  if (g.rango || valores.length === 0) return undefined;
  if (valores.length === g.meta.length && valores.every((m) => m === valores[0])) {
    return { valor: valores[0], texto: `Meta ${cifra.format(valores[0])}${g.unidad.sufijo}` };
  }
  return { porPeriodo: g.meta, texto: "Meta" };
}

/** La leyenda de la gráfica principal, con texto: el color de cada estado, la meta y el límite de crítico. */
export function LeyendaDeGrafica({ conLimite, conMeta, conAsterisco = false }: { conLimite: boolean; conMeta: boolean; conAsterisco?: boolean }) {
  const estados = [
    { clase: "bg-estado-bien", texto: "Bien" },
    { clase: "bg-estado-atencion", texto: "Atención" },
    { clase: "bg-estado-critico", texto: "Crítico" },
  ];
  return (
    <ul aria-label="Leyenda de la gráfica" className="flex list-none flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {estados.map((e) => (
        <li key={e.texto} className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className={`tubo-color-exacto size-2 rounded-full ${e.clase}`} />
          {e.texto}
        </li>
      ))}
      {/* Solo en papel, como el «Bien*» escrito sobre la columna (`tubo-impreso`): en pantalla no hay asterisco. */}
      {conAsterisco ? <li className="tubo-impreso">Bien*: Bien, sin alcanzar la meta</li> : null}
      {conMeta ? (
        <li className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="w-4 border-t-2 border-foreground" />
          Meta
        </li>
      ) : null}
      {conLimite ? (
        <li className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="w-4 border-t border-dashed border-muted-foreground" />
          Límite de crítico
        </li>
      ) : null}
    </ul>
  );
}
