import { Fragment } from "react";
import { Insignia, type VarianteInsignia } from "./Insignia";
import { claseDeRelleno, type EstadoDePunto } from "./geometria-tubos";

/** Una fila de las barras: su nombre, su cifra ya escrita, el ancho (de 0 a 100, `barrasAcostadas`) y su estado en texto. */
export type FilaDeBarra = { etiqueta: string; valor: string; ancho: number; estado: EstadoDePunto; textoEstado: string; destacada?: boolean };

const INSIGNIA: Record<EstadoDePunto, VarianteInsignia> = {
  bien: "bien",
  atencion: "atencion",
  critico: "critico",
  "sin-meta": "sin-dato",
  "sin-dato": "sin-dato",
  "no-aplica": "sin-dato",
  futuro: "sin-dato",
};

/** Dónde queda la etiqueta de la meta para no salirse por los extremos. */
const alineacion = (pct: number) => (pct < 15 ? "" : pct > 85 ? "-translate-x-full" : "-translate-x-1/2");

/**
 * Barras acostadas, una por fila (anexo 14C, §5.6, maqueta 8): la de cada categoría de un desagregado y la del total,
 * destacada, con el color de su estado, la cifra y el estado escritos al lado (nunca solo el color) y la meta como una
 * línea vertical que cruza todas las barras a la misma altura, con su texto bajo la última. Todas las pistas comparten la
 * columna, así la línea queda recta. Lo dibujado no se lee aparte: la tabla equivalente (`sr-only`) dice lo mismo, con el
 * título y la meta. Sin librería; como las demás gráficas, se imprime con su color.
 */
export function BarrasAcostadas({ titulo, filas, meta }: { titulo: string; filas: FilaDeBarra[]; meta: { posicion: number; texto: string } | null }) {
  const lectura = meta ? `${titulo} · ${meta.texto}` : titulo;
  return (
    <figure className="tubo-color-exacto flex min-w-0 flex-col gap-2">
      <div
        aria-hidden="true"
        className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 text-sm sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_auto] sm:gap-y-2"
      >
        {filas.map((f, i) => {
          const clase = claseDeRelleno(f.estado);
          const conEtiquetaDeMeta = meta !== null && i === filas.length - 1;
          // El total se separa con una línea; en un teléfono, su nombre va en su propio renglón.
          const separada = f.destacada ? "border-t border-border pt-2" : "";
          const separadaEnFila = f.destacada ? "sm:border-t sm:border-border sm:pt-2" : "";
          return (
            <Fragment key={`${i}-${f.etiqueta}`}>
              <span data-destacada={f.destacada ? "true" : undefined} className={`col-span-2 break-words sm:col-span-1 ${separada} ${f.destacada ? "font-semibold" : ""}`}>
                {f.etiqueta}
              </span>
              <div className={separadaEnFila}>
                <div className={`relative ${conEtiquetaDeMeta ? "pb-5" : ""}`}>
                  <div className="h-3.5 overflow-hidden rounded-full bg-tubo-pista">
                    {clase !== null && f.ancho > 0 ? (
                      <div className={`tubo-relleno tubo-acostado ${clase} h-full rounded-full`} style={{ width: `${f.ancho}%` }} />
                    ) : null}
                  </div>
                  {meta ? (
                    <span className="absolute -top-1 h-5.5 w-0.5 -translate-x-1/2 rounded-full bg-foreground" style={{ left: `${meta.posicion}%` }} />
                  ) : null}
                  {conEtiquetaDeMeta ? (
                    <span className={`absolute top-5 whitespace-nowrap text-xs text-muted-foreground ${alineacion(meta.posicion)}`} style={{ left: `${meta.posicion}%` }}>
                      {meta.texto}
                    </span>
                  ) : null}
                </div>
              </div>
              <span className={`flex items-center justify-end gap-2 whitespace-nowrap tabular-nums ${separadaEnFila} ${f.destacada ? "font-semibold" : ""}`}>
                {f.valor}
                <Insignia variante={INSIGNIA[f.estado]}>{f.textoEstado}</Insignia>
              </span>
            </Fragment>
          );
        })}
      </div>
      <figcaption className="sr-only">
        <table>
          <caption>{lectura}</caption>
          <thead>
            <tr>
              <th scope="col">Categoría</th>
              <th scope="col">Resultado</th>
              <th scope="col">Estado</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f, i) => (
              <tr key={`${i}-${f.etiqueta}`}>
                <th scope="row">{f.etiqueta}</th>
                <td>{f.valor}</td>
                <td>{f.textoEstado}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </figcaption>
    </figure>
  );
}
