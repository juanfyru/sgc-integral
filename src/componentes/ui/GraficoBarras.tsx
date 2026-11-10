import type { PuntoSerie } from "@/db/consultas/estadisticas";
import { calcularBarras } from "./geometria";

const ANCHO = 640;
const ALTO = 140;

/**
 * Barras de una serie con su tabla equivalente. Los textos por omisión son los de las consultas por día; otra serie
 * (por ejemplo, una barra por proceso) da los suyos.
 */
export function GraficoBarras({
  serie,
  descripcion,
  titulo = "Consultas por día",
  columnas = ["Fecha", "Consultas"],
  hueco,
}: {
  serie: PuntoSerie[];
  /** El `aria-label` del gráfico. */
  descripcion?: string;
  /** El título de la tabla equivalente. */
  titulo?: string;
  columnas?: readonly [string, string];
  /** La parte de cada franja (0 a 1) que queda vacía entre barra y barra; sin ella, tres unidades, como los días. */
  hueco?: number;
}) {
  const separacion = hueco === undefined ? 3 : (ANCHO / Math.max(serie.length, 1)) * hueco;
  const barras = calcularBarras(serie, { ancho: ANCHO, alto: ALTO, separacion });
  const total = serie.reduce((s, p) => s + p.conteo, 0);

  if (serie.length === 0)
    return <p className="text-sm text-muted-foreground">Sin consultas en el periodo.</p>;

  return (
    <figure className="w-full">
      <svg
        viewBox={`0 0 ${ANCHO} ${ALTO}`}
        className="h-36 w-full"
        role="img"
        aria-label={descripcion ?? `Consultas por día en el periodo: ${total} en total, ${serie.length} días con actividad.`}
        preserveAspectRatio="none"
      >
        {barras.map((b) => (
          <rect
            key={b.fecha}
            x={b.x}
            y={b.y}
            width={b.ancho}
            height={b.alto}
            className="fill-mod-documentos"
          >
            <title>{`${b.fecha}: ${b.conteo}`}</title>
          </rect>
        ))}
      </svg>
      <figcaption className="sr-only">
        <table>
          <caption>{titulo}</caption>
          <thead>
            <tr>
              <th>{columnas[0]}</th>
              <th>{columnas[1]}</th>
            </tr>
          </thead>
          <tbody>
            {serie.map((p) => (
              <tr key={p.fecha}>
                <td>{p.fecha}</td>
                <td>{p.conteo}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </figcaption>
    </figure>
  );
}
