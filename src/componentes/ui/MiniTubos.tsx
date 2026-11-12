import { DefinicionesDeTubo, useIdDeGrafica } from "./GraficoTubos";
import { calcularTubos, escala, rotuloCorto, type Geometria, type PuntoDeSerie } from "./geometria-tubos";

const ALTO = 64;
const MARGEN = { izq: 6, der: 6, arriba: 14, abajo: 16 };
const FRANJA = 30;

/**
 * La gráfica pequeña de una variable (spec §11): sus propios tubos en neutro, con su propia escala (nunca dos escalas
 * en una gráfica), el valor sobre cada tubo y el periodo debajo, y su tabla equivalente en `sr-only`. Las variables no
 * tienen estado: el color solo significa estado, así que aquí no hay color.
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
      <svg viewBox={`0 0 ${g.ancho} ${ALTO}`} className="block h-auto w-full max-w-72" role="img" aria-label={titulo}>
        <DefinicionesDeTubo id={id} clases={["tubo-neutro"]} pistas={tubos.map((t) => ({ x: t.x, y: tope, ancho: t.ancho, alto: base - tope }))} />
        {tubos.map((t, i) => (
          <rect
            key={serie[i].clave}
            className={`tubo-pista ${serie[i].estado === "futuro" ? "fill-tubo-pista-futura" : "fill-tubo-pista"}`}
            x={t.x}
            y={tope}
            width={t.ancho}
            height={base - tope}
            rx={t.ancho / 2}
          />
        ))}
        <g clipPath={`url(#${id}-pistas)`}>
          {tubos.map((t, i) =>
            serie[i].valor === null ? null : (
              <rect
                key={serie[i].clave}
                className="tubo-relleno tubo-neutro"
                style={{ "--i": i } as React.CSSProperties}
                x={t.x}
                y={t.yRelleno}
                width={t.ancho}
                height={t.altoRelleno + t.ancho}
                rx={t.ancho / 2}
                fill={`url(#${id}-tubo-neutro)`}
              />
            ),
          )}
        </g>
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
