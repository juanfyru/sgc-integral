import { DefinicionesDeTubo, TuboSvg, useIdDeGrafica } from "./TuboSvg";
import { calcularTubos, escala, rotuloCorto, type Geometria, type PuntoDeSerie } from "./geometria-tubos";

const ALTO = 64;
const MARGEN = { izq: 6, der: 6, arriba: 14, abajo: 16 };
const FRANJA = 30;

/**
 * La gráfica pequeña de una variable (spec §11): sus propios tubos en neutro, con su propia escala (nunca dos escalas
 * en una gráfica), el valor sobre cada tubo y el periodo debajo, y su tabla equivalente en `sr-only`. Las variables no
 * tienen estado: el color solo significa estado, así que aquí no hay color. Como la principal, nunca se dibuja por
 * debajo de 1:1: si no cabe, se desplaza y arranca en los periodos más recientes.
 */
export function MiniTubos({ titulo, serie }: { titulo: string; serie: PuntoDeSerie[] }) {
  const id = useIdDeGrafica("mini");
  if (serie.length === 0) return <p className="text-sm text-muted-foreground">Sin periodos para mostrar.</p>;

  const g: Geometria = { ancho: Math.max(150, MARGEN.izq + MARGEN.der + serie.length * FRANJA), alto: ALTO, margen: MARGEN };
  const e = escala(serie.flatMap((p) => (p.valor === null ? [] : [p.valor])), [], false);
  const tubos = calcularTubos(serie, g, e);
  const base = ALTO - MARGEN.abajo;
  const tope = MARGEN.arriba;
  const sobre = (p: PuntoDeSerie) => (p.estado === "sin-dato" ? "s. d." : p.estado === "no-aplica" ? "n. a." : p.texto);

  return (
    <figure className="flex min-w-0 flex-col">
      {/* Enfocable: sin nada enfocable adentro, es la única forma de desplazarla con el teclado. */}
      <div className="tubo-desplazable overflow-x-auto [direction:rtl]" tabIndex={0} role="region" aria-label={titulo}>
        <svg
          viewBox={`0 0 ${g.ancho} ${ALTO}`}
          width={g.ancho}
          height={ALTO}
          className="tubo-lienzo block max-w-none [direction:ltr]"
          role="img"
          aria-label={titulo}
        >
          <DefinicionesDeTubo id={id} clases={["tubo-neutro"]} pistas={tubos.map((t) => ({ x: t.x, y: tope, ancho: t.ancho, alto: base - tope }))} />
          {tubos.map((t, i) => {
            const p = serie[i];
            return (
              <TuboSvg
                key={p.clave}
                id={id}
                indice={i}
                tubo={t}
                tope={tope}
                base={base}
                futuro={p.estado === "futuro"}
                clase={p.valor === null ? null : "tubo-neutro"}
                negativo={p.valor !== null && p.valor < 0}
              />
            );
          })}
          {tubos.map((t, i) => {
            const p = serie[i];
            return (
              <g key={p.clave}>
                {sobre(p) ? (
                  <text
                    x={t.centro}
                    y={tope - 4}
                    textAnchor="middle"
                    fontSize={9}
                    className={p.valor === null ? "fill-muted-foreground" : "fill-foreground font-semibold"}
                  >
                    {sobre(p)}
                  </text>
                ) : null}
                <text x={t.centro} y={ALTO - 4} textAnchor="middle" fontSize={9} className="fill-muted-foreground">
                  {rotuloCorto(p.clave, p.etiqueta)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <figcaption className="sr-only">
        <table>
          <caption>{titulo}</caption>
          <thead>
            <tr>
              <th scope="col">Periodo</th>
              <th scope="col">{titulo}</th>
            </tr>
          </thead>
          <tbody>
            {serie.map((p) => (
              <tr key={p.clave}>
                <th scope="row">{p.etiqueta}</th>
                <td>{p.valor === null ? p.nombreEstado : p.texto}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </figcaption>
    </figure>
  );
}
